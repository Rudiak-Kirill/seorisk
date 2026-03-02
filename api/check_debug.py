import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
from pathlib import Path
from importlib.machinery import SourceFileLoader
from importlib.util import spec_from_loader, module_from_spec

DEBUG_LOG_PATH = Path('/tmp/seorisk_debug.log')

def _load_check_module():
    path = Path(__file__).resolve().parent.joinpath("check.py")
    loader = SourceFileLoader("seorisk_check", str(path))
    spec = spec_from_loader(loader.name, loader)
    module = module_from_spec(spec)
    loader.exec_module(module)
    return module


def _read_log_tail(limit_lines: int = 200) -> str:
    if not DEBUG_LOG_PATH.exists():
        return ""
    try:
        lines = DEBUG_LOG_PATH.read_text(encoding="utf-8", errors="replace").splitlines()
        return "\n".join(lines[-limit_lines:])
    except Exception:
        return ""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            headers = {k.lower(): v for k, v in self.headers.items()}
            if "url" not in params:
                payload = {"ok": True, "log_tail": _read_log_tail()}
                body = json.dumps(payload, ensure_ascii=False)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(body.encode("utf-8"))
                return
            check = _load_check_module()
            resp = check._handle_request(params, headers, include_raw=True)
            payload = json.loads(resp.get("body", "{}"))
            payload["raw_head"] = {k: v.get("raw_head") for k, v in payload.get("checks", {}).items()}
            payload["log_tail"] = _read_log_tail()
            body = json.dumps(payload, ensure_ascii=False)
            self.send_response(resp.get("statusCode", 200))
            for k, v in (resp.get("headers") or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
        except Exception as exc:
            body = json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))

    def log_message(self, format, *args):
        return
