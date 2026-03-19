import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

RATE_PATH = Path('/tmp/seorisk_rate.json')
DEBUG_LOG_PATH = Path('/tmp/seorisk_debug.log')
RATE_LIMIT_PER_DAY = 1
RATE_LIMIT_EXEMPT_HOSTS = {"zakupki44fz.ru"}
RATE_LIMIT_EXEMPT_IPS = {"compare-internal"}
MAX_HTML_BYTES = 400_000
CONNECT_TIMEOUT = 10
READ_TIMEOUT = 30

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
YANDEX_UA = "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"
GOOGLE_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"

ACCESS_TOKENS = [
    ("blocked", ["access denied", "forbidden", "blocked"]),
    ("captcha", ["captcha", "recaptcha", "hcaptcha"]),
    ("challenge", ["turnstile", "cf-challenge", "cloudflare", "checking your browser", "verify you are human", "attention required"]),
]


class TextLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.links = []
        self.has_h1 = False
        self.has_title = False
        self._in_script = False
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self._in_script = True
        if tag == "h1":
            self.has_h1 = True
        if tag == "title":
            self.has_title = True
        if tag == "a":
            for k, v in attrs:
                if k == "href" and v:
                    href = v.strip()
                    if href and not href.startswith(("#", "javascript:", "mailto:", "tel:")):
                        self.links.append(href)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._in_script = False
            self._in_style = False

    def handle_data(self, data):
        if self._in_script or self._in_style:
            return
        if data and data.strip():
            self.text_parts.append(data.strip())


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def json_response(payload: dict, status: int = 200):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, ensure_ascii=False),
    }


def log_debug(line: str) -> None:
    try:
        DEBUG_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        DEBUG_LOG_PATH.write_text(
            (DEBUG_LOG_PATH.read_text(encoding="utf-8", errors="replace") + line + "\n")
            if DEBUG_LOG_PATH.exists()
            else (line + "\n"),
            encoding="utf-8",
        )
    except Exception:
        pass


def normalize_url(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw
    return raw


def valid_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def load_rate_state() -> dict:
    if not RATE_PATH.exists():
        return {}
    try:
        return json.loads(RATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_rate_state(state: dict) -> None:
    try:
        RATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        RATE_PATH.write_text(json.dumps(state), encoding="utf-8")
    except Exception:
        pass


def check_rate_limit(ip: str, url: str) -> tuple[bool, str]:
    if ip in RATE_LIMIT_EXEMPT_IPS:
        return True, "internal_exempt"
    try:
        host = urlparse(url).hostname or ""
        host = host.lower()
        if host in RATE_LIMIT_EXEMPT_HOSTS:
            return True, "exempt"
    except Exception:
        pass
    today = datetime.utcnow().strftime("%Y-%m-%d")
    state = load_rate_state()
    day = state.setdefault(today, {})
    key = f"{ip}"
    if key in day:
        return False, "Лимит: 1 URL на IP в сутки"
    day[key] = {"url": url, "ts": utc_now_iso()}
    # garbage collect old days
    for k in list(state.keys()):
        if k != today:
            state.pop(k, None)
    save_rate_state(state)
    return True, "ok"


def detect_access_state(text: str) -> tuple[str, str | None]:
    if not text:
        return "unknown", None
    lowered = text.lower()
    for state, tokens in ACCESS_TOKENS:
        for token in tokens:
            if token in lowered:
                return state, token.replace(" ", "_")
    return "ok", None


def fetch_once(url: str, ua: str, include_headers: bool = False) -> dict:
    started = time.time()
    req = Request(url, headers={
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    try:
        with urlopen(req, timeout=CONNECT_TIMEOUT) as resp:
            ttfb_ms = int((time.time() - started) * 1000)
            body = resp.read(MAX_HTML_BYTES)
            code = resp.getcode() or 0
            size = len(body)
            response_headers = dict(resp.headers.items()) if include_headers else None
    except HTTPError as exc:
        ttfb_ms = int((time.time() - started) * 1000)
        try:
            body = exc.read(MAX_HTML_BYTES)
        except Exception:
            body = b""
        code = getattr(exc, "code", 0) or 0
        size = len(body) if body else 0
        response_headers = dict(exc.headers.items()) if include_headers and exc.headers else None
    except URLError as exc:
        return {
            "http_code": 0,
            "size_bytes": 0,
            "ttfb_ms": 0,
            "text_len": 0,
            "links_count": 0,
            "anchor_tags_count": 0,
            "filtered_links_count": 0,
            "links_source": "error",
            "raw_tail": "",
            "response_headers": None,
            "access_state": "error",
            "access_match": None,
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }
    except Exception as exc:
        return {
            "http_code": 0,
            "size_bytes": 0,
            "ttfb_ms": 0,
            "text_len": 0,
            "links_count": 0,
            "anchor_tags_count": 0,
            "filtered_links_count": 0,
            "links_source": "error",
            "raw_tail": "",
            "response_headers": None,
            "access_state": "error",
            "access_match": None,
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }

    raw_html = body.decode("utf-8", errors="replace")
    anchor_tags_count = len(re.findall(rb"<a\\b", body.lower()))
    parser = TextLinkParser()
    try:
        parser.feed(raw_html)
    except Exception:
        pass
    text = " ".join(parser.text_parts)
    text = re.sub(r"\s+", " ", text).strip()
    access_state, access_match = detect_access_state(text)
    filtered_links_count = len(parser.links)
    links_source = None
    if anchor_tags_count == 0 and filtered_links_count == 0:
        links_source = "no_anchors_in_raw_html"
    elif anchor_tags_count == 0 and filtered_links_count > 0:
        links_source = "parser_found_anchors_no_raw_match"
    elif anchor_tags_count > 0 and filtered_links_count == 0:
        links_source = "filter_or_parser_issue"
    return {
        "http_code": code,
        "size_bytes": size,
        "ttfb_ms": ttfb_ms,
        "text_len": len(text),
        "links_count": filtered_links_count,
        "anchor_tags_count": anchor_tags_count,
        "filtered_links_count": filtered_links_count,
        "links_source": links_source,
        "raw_tail": raw_html[-4000:],
        "response_headers": response_headers,
        "has_h1": bool(parser.has_h1),
        "has_title": bool(parser.has_title),
        "access_state": access_state,
        "access_match": access_match,
        "error": None,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


def build_checks(url: str, browser_ua: str | None = None, include_headers: bool = False) -> dict:
    ua_browser = browser_ua or BROWSER_UA
    return {
        "browser": fetch_once(url, ua_browser, include_headers),
        "yandex": fetch_once(url, YANDEX_UA, include_headers),
        "google": fetch_once(url, GOOGLE_UA, include_headers),
    }


def _handle_request(params: dict, headers: dict, include_raw: bool = False) -> dict:
    raw_url = params.get("url") or ""
    url = normalize_url(raw_url)
    if not valid_url(url):
        return json_response({"ok": False, "error": "Неверный URL"}, 400)

    ip = headers.get("x-forwarded-for", "").split(",")[0].strip() or "unknown"

    allowed, reason = check_rate_limit(ip, url)
    if not allowed:
        return json_response({"ok": False, "error": reason}, 429)

    raw_ua = params.get("ua") or ""
    ua = raw_ua.strip()
    if ua and len(ua) > 512:
        ua = ua[:512]

    checks = build_checks(url, ua or None, include_headers=include_raw)

    def ratio_diff(a: int, b: int) -> float:
        denom = max(a, b, 1)
        return abs(a - b) / denom

    reasons = []
    for label, snap in checks.items():
        if snap.get("http_code") != 200:
            reasons.append(f"{label}: http_code={snap.get('http_code')}")
        if snap.get("access_state") not in (None, "ok"):
            reasons.append(f"{label}: access={snap.get('access_state')}")

    br = checks.get("browser", {})
    for bot_label in ("yandex", "google"):
        bot = checks.get(bot_label, {})
        if ratio_diff(br.get("text_len", 0), bot.get("text_len", 0)) > 0.3:
            reasons.append(f"{bot_label}: text_diff")
        if abs((br.get("links_count") or 0) - (bot.get("links_count") or 0)) > 10:
            reasons.append(f"{bot_label}: links_diff")
        if br.get("has_h1") != bot.get("has_h1"):
            reasons.append(f"{bot_label}: h1_diff")
        if br.get("has_title") != bot.get("has_title"):
            reasons.append(f"{bot_label}: title_diff")

    verdict = "ok" if not reasons else "mismatch"

    # Rule engine v1
    def empty_like(snap: dict) -> bool:
        return (snap.get("text_len") or 0) < 50 and (snap.get("links_count") or 0) == 0

    def significant_diff(a: int, b: int, ratio: float = 0.3) -> bool:
        denom = max(a, b, 1)
        return abs(a - b) / denom > ratio

    br = checks.get("browser", {})
    ga = checks.get("google", {})
    ya = checks.get("yandex", {})

    rules = []

    def add_rule(rule_id: str, severity: str, verdict_label: str, summary: str, recommendation: str):
        rules.append({
            "id": rule_id,
            "severity": severity,
            "verdict": verdict_label,
            "summary": summary,
            "recommendation": recommendation,
        })

    # A. Access / HTTP
    if br.get("access_state") != "ok" or (br.get("http_code") or 0) >= 400:
        add_rule("R002", "critical", "Browser access failed",
                 "Страница недоступна в обычном браузере.",
                 "Проверить доступность страницы и цепочку редиректов.")
    if ga.get("access_state") != "ok" or (ga.get("http_code") or 0) >= 400:
        add_rule("R003", "critical", "Google bot access failed",
                 "Googlebot не может получить страницу корректно.",
                 "Проверить доступ Googlebot на уровне сервера, CDN и robots.")
    if ya.get("access_state") != "ok" or (ya.get("http_code") or 0) >= 400:
        add_rule("R004", "critical", "Yandex bot access failed",
                 "Яндекс-бот не может получить страницу корректно.",
                 "Проверить доступ YandexBot на уровне сервера и прокси.")
    if (br.get("http_code") != ga.get("http_code")) or (br.get("http_code") != ya.get("http_code")):
        add_rule("R005", "critical", "Different HTTP status by user-agent",
                 "Браузер и боты получают разные HTTP-ответы.",
                 "Проверить серверную логику по user-agent.")

    # B. Rendering / content availability
    br_empty = empty_like(br)
    ga_empty = empty_like(ga)
    ya_empty = empty_like(ya)

    if br_empty and (not ga_empty or not ya_empty):
        add_rule("R101", "medium", "Rendering mismatch",
                 "Браузер получает почти пустую страницу, а боты — полноценный контент.",
                 "Проверить SSR/prerender и убедиться, что браузерный HTML не пустой.")
    if not br_empty and (ga_empty or ya_empty):
        add_rule("R102", "critical", "Critical SEO rendering risk",
                 "Пользователь видит контент, но поисковый бот получает пустую или урезанную страницу.",
                 "Срочно проверить indexability, SSR и доступ ботов.")
    if br_empty and ga_empty and ya_empty:
        add_rule("R103", "high", "Thin or empty page",
                 "Все агенты получают почти пустую страницу.",
                 "Проверить шаблон страницы и источник контента.")
    if (br.get("text_len") or 0) < 0.3 * max(ga.get("text_len") or 0, ya.get("text_len") or 0, 1):
        add_rule("R104", "high", "Browser gets reduced content",
                 "В браузере значительно меньше текста, чем у поисковых ботов.",
                 "Сравнить исходный HTML и post-render DOM.")
    if (ga.get("text_len") or 0) < 0.3 * max(br.get("text_len") or 0, 1):
        add_rule("R105", "critical", "Google receives reduced content",
                 "Googlebot получает намного меньше контента, чем браузер.",
                 "Проверить, что основной контент есть в HTML до JS.")
    if (ya.get("text_len") or 0) < 0.3 * max(br.get("text_len") or 0, 1):
        add_rule("R106", "critical", "Yandex receives reduced content",
                 "Яндекс получает намного меньше контента, чем браузер.",
                 "Проверить рендер и доступ YandexBot.")
    if significant_diff(ga.get("text_len") or 0, ya.get("text_len") or 0, 0.3):
        add_rule("R107", "high", "Bot-to-bot content mismatch",
                 "Google и Яндекс получают разный объем контента.",
                 "Проверить HTML-ответ по разным user-agent.")

    # C. Title / H1
    if not br.get("has_title") and not ga.get("has_title") and not ya.get("has_title"):
        add_rule("R201", "high", "Missing title",
                 "У страницы отсутствует title.",
                 "Вернуть title в server-side HTML.")
    if br.get("has_title") and (not ga.get("has_title") or not ya.get("has_title")):
        add_rule("R202", "critical", "Bots miss title",
                 "Браузер видит title, но боты — нет.",
                 "Генерировать title на сервере.")
    if not br.get("has_h1") and not ga.get("has_h1") and not ya.get("has_h1"):
        add_rule("R204", "medium", "Missing H1",
                 "На странице не найден H1.",
                 "Добавить основной H1 в HTML.")
    if not br.get("has_h1") and (ga.get("has_h1") or ya.get("has_h1")):
        add_rule("R205", "high", "H1 rendering mismatch",
                 "H1 есть у ботов, но отсутствует в браузере.",
                 "Проверить, что H1 присутствует в пользовательской версии страницы.")
    if br.get("has_h1") and (not ga.get("has_h1") or not ya.get("has_h1")):
        add_rule("R206", "critical", "Bots miss H1",
                 "Боты не получают основной заголовок страницы.",
                 "Отдавать H1 в исходном HTML.")

    # D. Links / navigation
    if (br.get("links_count") or 0) == 0 and ((ga.get("links_count") or 0) > 0 or (ya.get("links_count") or 0) > 0):
        add_rule("R301", "high", "Link structure mismatch",
                 "Навигация и ссылки есть у ботов, но не видны в браузере.",
                 "Проверить рендер меню и основного контента.")
    if (br.get("links_count") or 0) > 0 and ((ga.get("links_count") or 0) == 0 or (ya.get("links_count") or 0) == 0):
        add_rule("R302", "critical", "Bots miss internal links",
                 "Боты не видят ссылки, доступные пользователю.",
                 "Отдавать ключевые ссылки в HTML без зависимости от JS.")
    if significant_diff(br.get("links_count") or 0, ga.get("links_count") or 0, 0.5) or significant_diff(br.get("links_count") or 0, ya.get("links_count") or 0, 0.5):
        add_rule("R303", "medium", "Link count mismatch",
                 "Количество ссылок заметно различается.",
                 "Сравнить DOM и проверить основные навигационные блоки.")
    if significant_diff(ga.get("links_count") or 0, ya.get("links_count") or 0, 0.5):
        add_rule("R304", "medium", "Bot link mismatch",
                 "Google и Яндекс видят разное количество ссылок.",
                 "Проверить шаблон ответа по разным user-agent.")

    # H. Soft 404 / thin content / placeholder
    if (br.get("http_code") == 200) and (br.get("text_len") or 0) < 30 and (br.get("links_count") or 0) < 2:
        add_rule("R701", "high", "Soft 404 suspected",
                 "Страница отвечает 200 OK, но выглядит как пустая/ошибочная.",
                 "Проверить шаблон и возврат корректного статуса 404/410 при необходимости.")
    if all((snap.get("text_len") or 0) < 150 for snap in (br, ga, ya)) and not (br_empty and ga_empty and ya_empty):
        add_rule("R702", "medium", "Thin content",
                 "Контента на странице мало.",
                 "Проверить, является ли это нормой для данного типа страницы.")
    if (br.get("has_title") or ga.get("has_title") or ya.get("has_title")) and all((snap.get("text_len") or 0) < 50 for snap in (br, ga, ya)) and all((snap.get("links_count") or 0) == 0 for snap in (br, ga, ya)):
        add_rule("R703", "high", "Template without content",
                 "Похоже, загрузился шаблон без основного содержимого.",
                 "Проверить данные страницы и загрузку контента.")

    # G. Cloaking / UA targeting
    if (not br_empty) and ga_empty and ya_empty:
        add_rule("R601", "critical", "Possible bot blocking",
                 "Поисковые боты получают существенно меньше контента.",
                 "Проверить защитные правила и рендеринг для ботов.")
    if br_empty and (not ga_empty) and (not ya_empty):
        add_rule("R602", "high", "Possible dynamic rendering / cloaking pattern",
                 "Версия для ботов отличается от пользовательской.",
                 "Проверить соответствие Google guidelines и целесообразность схемы.")
    if significant_diff(br.get("text_len") or 0, ga.get("text_len") or 0, 0.5) and significant_diff(br.get("text_len") or 0, ya.get("text_len") or 0, 0.5) and not significant_diff(ga.get("text_len") or 0, ya.get("text_len") or 0, 0.2):
        add_rule("R603", "high", "Browser-vs-bot split detected",
                 "Есть отдельная версия страницы для ботов.",
                 "Проверить, насколько различия оправданы.")
    if significant_diff(br.get("text_len") or 0, ga.get("text_len") or 0, 0.5) and not significant_diff(br.get("text_len") or 0, ya.get("text_len") or 0, 0.3):
        add_rule("R604", "high", "Google-specific mismatch",
                 "Проблема проявляется именно для Googlebot.",
                 "Тестировать отдельно под Googlebot.")
    if significant_diff(br.get("text_len") or 0, ya.get("text_len") or 0, 0.5) and not significant_diff(br.get("text_len") or 0, ga.get("text_len") or 0, 0.3):
        add_rule("R605", "high", "Yandex-specific mismatch",
                 "Проблема проявляется именно для YandexBot.",
                 "Тестировать отдельно под YandexBot.")

    # J. Consistency rules
    if any(r.get("id") in ("R104", "R301", "R205") for r in rules) and any(r.get("id") in ("R105", "R106", "R302", "R206") for r in rules):
        add_rule("R901", "critical", "Major rendering mismatch",
                 "Отличается сразу несколько ключевых SEO-сигналов.",
                 "Проверить HTML source, DOM after render и response by UA.")
    if len(rules) == 1:
        add_rule("R902", "low", "Minor difference detected",
                 "Найдены незначительные расхождения без явного SEO-риска.",
                 "Можно наблюдать без срочных действий.")
    if significant_diff(br.get("text_len") or 0, ya.get("text_len") or 0, 0.4) and not significant_diff(br.get("text_len") or 0, ga.get("text_len") or 0, 0.3):
        add_rule("R903", "medium", "Yandex-only issue",
                 "Проблема воспроизводится в Яндексе, но не в Google.",
                 "Проверить обработку YandexBot отдельно.")
    if significant_diff(br.get("text_len") or 0, ga.get("text_len") or 0, 0.4) and not significant_diff(br.get("text_len") or 0, ya.get("text_len") or 0, 0.3):
        add_rule("R904", "medium", "Google-only issue",
                 "Проблема воспроизводится в Google, но не в Яндексе.",
                 "Проверить обработку Googlebot отдельно.")

    if not rules:
        add_rule("R001", "info", "No SEO Risk",
                 "Браузер и поисковые боты видят страницу одинаково.",
                 "Ничего критичного не обнаружено.")

    severity_order = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    top_rule = sorted(rules, key=lambda r: severity_order.get(r["severity"], 0), reverse=True)[0]
    rule_verdict = "fail" if top_rule["severity"] in ("critical",) else "warn" if top_rule["severity"] in ("high", "medium") else "ok"
    log_debug(f"{utc_now_iso()} url={url} verdict={verdict} reasons={len(reasons)}")
    for label, snap in checks.items():
        log_debug(
            f"  {label} code={snap.get('http_code')} text={snap.get('text_len')} "
            f"links={snap.get('links_count')} anchors={snap.get('anchor_tags_count')} "
            f"source={snap.get('links_source')} access={snap.get('access_state')}"
        )

    safe_checks = checks
    if not include_raw:
        safe_checks = {
            k: {
                kk: vv
                for kk, vv in v.items()
                if kk not in ("raw_tail", "response_headers")
            }
            for k, v in checks.items()
        }

    return json_response({
        "ok": True,
        "url": url,
        "checked_at": utc_now_iso(),
        "verdict": verdict,
        "rule_version": "v1",
        "rule_verdict": rule_verdict,
        "rule_severity": top_rule["severity"],
        "rule_id": top_rule["id"],
        "rule_summary": top_rule["summary"],
        "rule_recommendation": top_rule["recommendation"],
        "matched_rules": rules,
        "reasons": reasons,
        "checks": safe_checks,
    })


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        headers = {k.lower(): v for k, v in self.headers.items()}
        resp = _handle_request(params, headers)
        body = resp.get("body", "")
        self.send_response(resp.get("statusCode", 200))
        for k, v in (resp.get("headers") or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, format, *args):
        return
