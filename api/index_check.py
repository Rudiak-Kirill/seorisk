import json
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree as ET

TIMEOUT = 12
MAX_HTML_BYTES = 500_000
MAX_TEXT_BYTES = 1_500_000
MAX_SITEMAP_FETCHES = 200
MAX_SITEMAP_URLS = 200_000

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def json_response(payload: dict, status: int = 200):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, ensure_ascii=False),
    }


def normalize_url(raw: str) -> str:
    raw = (raw or "").strip()
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


def normalize_compare_url(url: str) -> str:
    parsed = urlparse(normalize_url(url))
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            "",
            parsed.query,
            "",
        )
    )


def same_url(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    return normalize_compare_url(left) == normalize_compare_url(right)


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta_robots = []
        self.canonical_url = None

    def handle_starttag(self, tag, attrs):
        attrs_dict = {k.lower(): v for k, v in attrs}
        if tag == "meta":
            name = (attrs_dict.get("name") or "").lower().strip()
            content = (attrs_dict.get("content") or "").strip()
            if name in ("robots", "googlebot", "yandexbot") and content:
                self.meta_robots.append({"name": name, "content": content})

        if tag == "link":
            rel = (attrs_dict.get("rel") or "").lower()
            href = (attrs_dict.get("href") or "").strip()
            if "canonical" in rel and href and not self.canonical_url:
                self.canonical_url = href


class RecordingRedirectHandler(HTTPRedirectHandler):
    def __init__(self):
        super().__init__()
        self.chain = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.chain.append(
            {
                "from_url": req.full_url,
                "to_url": newurl,
                "status_code": code,
            }
        )
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_url(url: str, max_bytes: int = MAX_TEXT_BYTES) -> dict:
    redirect_handler = RecordingRedirectHandler()
    opener = build_opener(redirect_handler)
    request = Request(
        url,
        headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    started = time.time()

    try:
        with opener.open(request, timeout=TIMEOUT) as response:
            body = response.read(max_bytes)
            status_code = response.getcode() or 0
            final_url = response.geturl()
            headers = {k.lower(): v for k, v in response.headers.items()}
    except HTTPError as exc:
        try:
            body = exc.read(max_bytes)
        except Exception:
            body = b""
        status_code = getattr(exc, "code", 0) or 0
        final_url = exc.geturl()
        headers = {k.lower(): v for k, v in (exc.headers or {}).items()}
    except URLError as exc:
        return {
            "ok": False,
            "status_code": 0,
            "final_url": url,
            "redirect_chain": redirect_handler.chain,
            "headers": {},
            "body_text": "",
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status_code": 0,
            "final_url": url,
            "redirect_chain": redirect_handler.chain,
            "headers": {},
            "body_text": "",
            "error": str(exc),
            "elapsed_ms": int((time.time() - started) * 1000),
        }

    return {
        "ok": True,
        "status_code": status_code,
        "final_url": final_url,
        "redirect_chain": redirect_handler.chain,
        "headers": headers,
        "body_text": body.decode("utf-8", errors="replace"),
        "error": None,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


def format_meta_robots(meta_robots: list[dict]) -> str | None:
    if not meta_robots:
        return None
    return "; ".join(f"{item['name']}: {item['content']}" for item in meta_robots)


def has_noindex(value: str | None) -> bool:
    if not value:
        return False
    lowered = value.lower()
    return "noindex" in lowered or "none" in lowered


def parse_robots_txt(text: str) -> tuple[list[dict], list[str]]:
    groups = []
    current_agents = []
    current_rules = []
    sitemaps = []

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        field, value = line.split(":", 1)
        field = field.strip().lower()
        value = value.strip()

        if field == "sitemap":
            if value:
                sitemaps.append(value)
            continue

        if field == "user-agent":
            if current_agents and current_rules:
                groups.append({"user_agents": current_agents, "rules": current_rules})
                current_agents = []
                current_rules = []
            current_agents.append(value.lower())
            continue

        if field in ("allow", "disallow"):
            if not current_agents:
                continue
            current_rules.append({"directive": field, "value": value})

    if current_agents:
        groups.append({"user_agents": current_agents, "rules": current_rules})

    return groups, sitemaps


def choose_robots_group(
    groups: list[dict], target_user_agent: str = "googlebot"
) -> tuple[dict | None, str | None]:
    best_group = None
    best_agent = None
    best_score = -1
    target = target_user_agent.lower()

    for group in groups:
        for agent in group.get("user_agents", []):
            score = -1
            if agent == target:
                score = 100
            elif agent == "*":
                score = 1
            elif target.startswith(agent):
                score = len(agent)

            if score > best_score:
                best_group = group
                best_agent = agent
                best_score = score

    return best_group, best_agent


def evaluate_robots(group: dict | None, final_url: str) -> tuple[bool, str | None, list[str]]:
    if not group:
        return True, None, []

    parsed = urlparse(final_url)
    page_path = parsed.path or "/"
    if parsed.query:
        page_path = f"{page_path}?{parsed.query}"

    matched_rule = None
    matched_length = -1
    rules_found = []

    for rule in group.get("rules", []):
        directive = rule.get("directive")
        value = rule.get("value", "")
        rules_found.append(f"{directive}: {value}")

        if directive == "disallow" and value == "":
            continue
        if not page_path.startswith(value):
            continue

        value_length = len(value)
        if value_length > matched_length:
            matched_rule = rule
            matched_length = value_length
        elif (
            value_length == matched_length
            and matched_rule
            and matched_rule.get("directive") == "disallow"
            and directive == "allow"
        ):
            matched_rule = rule

    if not matched_rule:
        return True, None, rules_found

    allowed = matched_rule.get("directive") != "disallow"
    matched_rule_text = f"{matched_rule.get('directive')}: {matched_rule.get('value', '')}"
    return allowed, matched_rule_text, rules_found


def xml_tag_name(tag: str) -> str:
    return tag.split("}", 1)[-1].lower()


def extract_loc_values(root: ET.Element, parent_tag: str) -> list[str]:
    values = []
    for node in root.iter():
        if xml_tag_name(node.tag) == parent_tag:
            for child in node:
                if xml_tag_name(child.tag) == "loc" and child.text:
                    values.append(child.text.strip())
    return values


def inspect_sitemap(start_url: str, target_url: str) -> tuple[bool, str | None, int, int]:
    queue = [start_url]
    seen = set()
    fetch_count = 0
    normalized_target = normalize_compare_url(target_url)
    root_type = None
    root_status = 0
    urls_count = 0
    page_found = False

    while queue and fetch_count < MAX_SITEMAP_FETCHES and urls_count < MAX_SITEMAP_URLS:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        fetch_count += 1

        fetched = fetch_url(current, max_bytes=MAX_TEXT_BYTES)
        if fetch_count == 1:
            root_status = fetched.get("status_code", 0)

        if not fetched.get("ok") or not (200 <= fetched.get("status_code", 0) < 300):
            continue

        try:
            root = ET.fromstring(fetched.get("body_text") or "")
        except Exception:
            if fetch_count == 1:
                root_type = "invalid"
            continue

        current_type = xml_tag_name(root.tag)
        if fetch_count == 1:
            root_type = current_type

        if current_type == "urlset":
            urls = extract_loc_values(root, "url")
            if urls:
                remaining = max(0, MAX_SITEMAP_URLS - urls_count)
                urls_count += min(len(urls), remaining)
            if any(
                same_url(url, normalized_target) or normalize_compare_url(url) == normalized_target
                for url in urls
            ):
                page_found = True

        if current_type == "sitemapindex":
            sitemap_urls = extract_loc_values(root, "sitemap")
            for sitemap_url in sitemap_urls:
                if sitemap_url not in seen and len(queue) < MAX_SITEMAP_FETCHES:
                    queue.append(sitemap_url)

    return page_found, root_type, root_status, urls_count


def check_sitemap(site_root: str, final_url: str, robots_sitemaps: list[str]) -> dict:
    candidates = []
    if robots_sitemaps:
        for sitemap_url in robots_sitemaps:
            candidates.append(("robots.txt", sitemap_url))
    else:
        candidates.append(("standard", urljoin(site_root, "/sitemap.xml")))

    fallback = {
        "sitemap_found": False,
        "sitemap_source": None,
        "sitemap_url": candidates[0][1] if candidates else None,
        "sitemap_status_code": 0,
        "sitemap_type": None,
        "page_in_sitemap": False,
        "sitemap_urls_count": 0,
    }

    for source, sitemap_url in candidates:
        page_found, sitemap_type, status_code, urls_count = inspect_sitemap(sitemap_url, final_url)
        if status_code:
            fallback["sitemap_status_code"] = status_code
            fallback["sitemap_url"] = sitemap_url
            fallback["sitemap_source"] = source
            fallback["sitemap_type"] = sitemap_type
            fallback["sitemap_urls_count"] = urls_count

        if status_code and 200 <= status_code < 300:
            return {
                "sitemap_found": True,
                "sitemap_source": source,
                "sitemap_url": sitemap_url,
                "sitemap_status_code": status_code,
                "sitemap_type": sitemap_type,
                "page_in_sitemap": page_found,
                "sitemap_urls_count": urls_count,
            }

    return fallback


def build_verdict(
    http_ok: bool, indexable_meta: bool, robots_allowed: bool, in_sitemap: bool
) -> tuple[str, list[str]]:
    reasons = []

    if not http_ok:
        reasons.append("http_not_ok")
    if not indexable_meta:
        reasons.append("noindex_detected")
    if not robots_allowed:
        reasons.append("blocked_by_robots")
    if not in_sitemap:
        reasons.append("not_in_sitemap")

    if not http_ok or not indexable_meta or not robots_allowed:
        return "fail", reasons
    if not in_sitemap:
        return "warn", reasons
    return "ok", reasons


def _handle_request(params: dict) -> dict:
    input_url = normalize_url(params.get("url") or "")
    if not valid_url(input_url):
        return json_response({"ok": False, "error": "Неверный URL"}, 400)

    page = fetch_url(input_url, max_bytes=MAX_HTML_BYTES)
    final_url = page.get("final_url") or input_url
    site_root = f"{urlparse(final_url).scheme}://{urlparse(final_url).netloc}"

    parser = MetadataParser()
    try:
        parser.feed(page.get("body_text") or "")
    except Exception:
        pass

    meta_robots = format_meta_robots(parser.meta_robots)
    x_robots_tag = page.get("headers", {}).get("x-robots-tag")
    canonical_url = urljoin(final_url, parser.canonical_url) if parser.canonical_url else None
    canonical_self = same_url(canonical_url, final_url) if canonical_url else None
    canonical_ok = bool(canonical_url and canonical_self)

    robots_url = urljoin(site_root, "/robots.txt")
    robots_fetch = fetch_url(robots_url, max_bytes=200_000)
    robots_found = robots_fetch.get("ok") and 200 <= robots_fetch.get("status_code", 0) < 300
    robots_groups, robots_sitemaps = (
        parse_robots_txt(robots_fetch.get("body_text") or "") if robots_found else ([], [])
    )
    robots_group, robots_user_agent = choose_robots_group(robots_groups, "googlebot")
    robots_allowed, robots_rule, robots_rules = evaluate_robots(robots_group, final_url)

    sitemap_result = check_sitemap(site_root, final_url, robots_sitemaps)

    http_ok = page.get("ok") and 200 <= page.get("status_code", 0) < 300
    indexable_meta = not has_noindex(meta_robots) and not has_noindex(x_robots_tag)
    verdict, reasons = build_verdict(
        bool(http_ok),
        bool(indexable_meta),
        bool(robots_allowed),
        bool(sitemap_result.get("page_in_sitemap")),
    )

    return json_response(
        {
            "ok": True,
            "checked_at": utc_now_iso(),
            "input_url": input_url,
            "final_url": final_url,
            "status_code": page.get("status_code", 0),
            "redirect_chain": page.get("redirect_chain", []),
            "meta_robots": meta_robots,
            "x_robots_tag": x_robots_tag,
            "canonical_url": canonical_url,
            "canonical_self": canonical_self,
            "canonical_ok": canonical_ok,
            "robots_url": robots_url,
            "robots_found": bool(robots_found),
            "robots_status_code": robots_fetch.get("status_code", 0),
            "robots_rules_found": bool(robots_rules),
            "robots_rules": robots_rules,
            "robots_allowed_for_page": bool(robots_allowed),
            "robots_matched_rule": robots_rule,
            "robots_matched_user_agent": robots_user_agent,
            "sitemap_found": sitemap_result.get("sitemap_found"),
            "sitemap_source": sitemap_result.get("sitemap_source"),
            "sitemap_url": sitemap_result.get("sitemap_url"),
            "sitemap_status_code": sitemap_result.get("sitemap_status_code"),
            "sitemap_type": sitemap_result.get("sitemap_type"),
            "page_in_sitemap": sitemap_result.get("page_in_sitemap"),
            "sitemap_urls_count": sitemap_result.get("sitemap_urls_count"),
            "http_ok": bool(http_ok),
            "indexable_meta": bool(indexable_meta),
            "verdict": verdict,
            "reasons": reasons,
            "errors": {
                "page": page.get("error"),
                "robots": robots_fetch.get("error"),
            },
        }
    )


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        response = _handle_request(params)
        body = response.get("body", "")
        self.send_response(response.get("statusCode", 200))
        for key, value in (response.get("headers") or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, format, *args):
        return
