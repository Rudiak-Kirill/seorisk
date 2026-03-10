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
