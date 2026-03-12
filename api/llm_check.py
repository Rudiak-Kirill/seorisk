import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

MAX_HTML_BYTES = 400_000
CONNECT_TIMEOUT = 10

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

LLM_UA_MAP = {
    "gptbot": {
        "label": "GPTBot",
        "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0; +https://openai.com/gptbot)",
    },
    "chatgpt-user": {
        "label": "ChatGPT-User",
        "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    },
    "oai-searchbot": {
        "label": "OAI-SearchBot",
        "ua": "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    },
    "claudebot": {
        "label": "ClaudeBot",
        "ua": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://www.anthropic.com/claudebot)",
    },
    "anthropic-ai": {
        "label": "Anthropic AI",
        "ua": "Mozilla/5.0 (compatible; anthropic-ai/1.0; +https://www.anthropic.com)",
    },
    "perplexitybot": {
        "label": "PerplexityBot",
        "ua": "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://www.perplexity.ai/perplexitybot)",
    },
    "youbot": {
        "label": "YouBot",
        "ua": "Mozilla/5.0 (compatible; YouBot/1.0; +https://you.com/youbot)",
    },
    "applebot-extended": {
        "label": "Applebot-Extended",
        "ua": "Mozilla/5.0 (compatible; Applebot-Extended/1.0; +https://support.apple.com/en-us/HT204683)",
    },
    "amazonbot": {
        "label": "Amazonbot",
        "ua": "Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)",
    },
    "bytespider": {
        "label": "Bytespider",
        "ua": "Mozilla/5.0 (compatible; Bytespider/1.0; +https://www.bytedance.com)",
    },
    "diffbot": {
        "label": "Diffbot",
        "ua": "Mozilla/5.0 (compatible; Diffbot/1.1; +https://www.diffbot.com)",
    },
    "ccbot": {
        "label": "CCBot",
        "ua": "Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)",
    },
    "cohere-ai": {
        "label": "Cohere",
        "ua": "Mozilla/5.0 (compatible; cohere-ai/1.0; +https://cohere.com)",
    },
}

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
            ttfb_ms = int((time.time() - started) * 1000)
            body = resp.read(MAX_HTML_BYTES)
            code = resp.getcode() or 0
            size = len(body)
    except HTTPError as exc:
        ttfb_ms = int((time.time() - started) * 1000)
        try:
            body = exc.read(MAX_HTML_BYTES)
        except Exception:
            body = b""
        code = getattr(exc, "code", 0) or 0
        size = len(body) if body else 0
    except URLError as exc:
        return {
            "http_code": 0,
            "size_bytes": 0,
            "ttfb_ms": 0,
            "text_len": 0,
            "links_count": 0,
            "has_h1": False,
            "has_title": False,
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
            "has_h1": False,
            "has_title": False,
            "access_state": "error",
            "access_match": None,
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }

    raw_html = body.decode("utf-8", errors="replace")
    parser = TextLinkParser()
    try:
        parser.feed(raw_html)
    except Exception:
        pass
    text = " ".join(parser.text_parts)
    text = re.sub(r"\s+", " ", text).strip()
    access_state, access_match = detect_access_state(text)

    return {
        "http_code": code,
        "size_bytes": size,
        "ttfb_ms": ttfb_ms,
        "text_len": len(text),
        "links_count": len(parser.links),
        "has_h1": bool(parser.has_h1),
        "has_title": bool(parser.has_title),
        "access_state": access_state,
        "access_match": access_match,
        "error": None,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


def _resolve_agent(key: str) -> dict:
    if key in LLM_UA_MAP:
        return {"key": key, **LLM_UA_MAP[key]}
    # fallback to gptbot
    return {"key": "gptbot", **LLM_UA_MAP["gptbot"]}


def _handle_request(params: dict) -> dict:
    raw_url = params.get("url") or ""
    url = normalize_url(raw_url)
    if not valid_url(url):
        return json_response({"ok": False, "error": "Неверный URL"}, 400)

    a1 = params.get("a1") or "gptbot"
    a2 = params.get("a2") or "claudebot"
    a3 = params.get("a3") or "perplexitybot"

    agents = [_resolve_agent(a1), _resolve_agent(a2), _resolve_agent(a3)]

    browser = fetch_once(url, BROWSER_UA)
    checks = {"browser": browser}
    meta = {}
    for idx, agent in enumerate(agents, start=1):
        key = f"llm{idx}"
        checks[key] = fetch_once(url, agent["ua"])
        meta[key] = agent

    return json_response({
        "ok": True,
        "url": url,
        "checked_at": utc_now_iso(),
        "checks": checks,
        "agents": meta,
    })


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        resp = _handle_request(params)
        body = resp.get("body", "")
        self.send_response(resp.get("statusCode", 200))
        for k, v in (resp.get("headers") or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, format, *args):
        return
