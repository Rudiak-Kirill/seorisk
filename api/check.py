import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

RATE_PATH = Path('/tmp/seorisk_rate.json')
RATE_LIMIT_PER_DAY = 1
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
                    if href.startswith(("http", "/", "?")) and not href.startswith(("#", "javascript:", "mailto:", "tel:")):
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


def fetch_once(url: str, ua: str) -> dict:
    started = time.time()
    req = Request(url, headers={
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    try:
        with urlopen(req, timeout=CONNECT_TIMEOUT) as resp:
            body = resp.read(MAX_HTML_BYTES)
            code = resp.getcode() or 0
            size = len(body)
    except Exception as exc:
        return {
            "http_code": 0,
            "size_bytes": 0,
            "text_len": 0,
            "links_count": 0,
            "access_state": "error",
            "access_match": None,
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }

    parser = TextLinkParser()
    try:
        parser.feed(body.decode("utf-8", errors="replace"))
    except Exception:
        pass
    text = " ".join(parser.text_parts)
    text = re.sub(r"\s+", " ", text).strip()
    access_state, access_match = detect_access_state(text)

    return {
        "http_code": code,
        "size_bytes": size,
        "text_len": len(text),
        "links_count": len(parser.links),
        "has_h1": bool(parser.has_h1),
        "has_title": bool(parser.has_title),
        "access_state": access_state,
        "access_match": access_match,
        "error": None,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


def _extract_params(event) -> dict:
    if isinstance(event, dict):
        return event.get("queryStringParameters") or {}
    if hasattr(event, "query_params"):
        return dict(event.query_params)
    return {}


def _extract_headers(event) -> dict:
    if isinstance(event, dict):
        return event.get("headers") or {}
    if hasattr(event, "headers"):
        return dict(event.headers)
    return {}


def handler(event, context=None):
    params = _extract_params(event)
    raw_url = params.get("url") or ""
    url = normalize_url(raw_url)
    if not valid_url(url):
        return json_response({"ok": False, "error": "Неверный URL"}, 400)

    headers = _extract_headers(event)
    ip = headers.get("x-forwarded-for", "").split(",")[0].strip() or "unknown"

    allowed, reason = check_rate_limit(ip, url)
    if not allowed:
        return json_response({"ok": False, "error": reason}, 429)

    checks = {
        "browser": fetch_once(url, BROWSER_UA),
        "yandex": fetch_once(url, YANDEX_UA),
        "google": fetch_once(url, GOOGLE_UA),
    }

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

    return json_response({
        "ok": True,
        "url": url,
        "checked_at": utc_now_iso(),
        "verdict": verdict,
        "reasons": reasons,
        "checks": checks,
    })
