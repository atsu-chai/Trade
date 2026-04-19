import json
import mimetypes
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, Tuple
from urllib.parse import parse_qs, urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import db
from app.services import (
    create_stock,
    dashboard,
    delete_stock,
    get_stock_detail,
    import_stocks_csv,
    list_notifications,
    list_signals,
    list_stocks,
    run_analysis,
    update_stock,
)


HOST = "127.0.0.1"
PORT = 8000
STATIC_DIR = Path(__file__).resolve().parent / "static"


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


class Handler(BaseHTTPRequestHandler):
    server_version = "TradeSignalMVP/0.1"

    def do_GET(self) -> None:
        self.route("GET")

    def do_POST(self) -> None:
        self.route("POST")

    def do_PUT(self) -> None:
        self.route("PUT")

    def do_DELETE(self) -> None:
        self.route("DELETE")

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def route(self, method: str) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/"):
                result = self.handle_api(method, parsed.path, parse_qs(parsed.query))
                self.send_json(result)
                return
            self.serve_static(parsed.path)
        except ApiError as exc:
            self.send_json({"error": exc.message}, exc.status)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def read_body(self) -> Tuple[Dict[str, Any], str]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else ""
        content_type = self.headers.get("Content-Type", "")
        if "application/json" in content_type and raw:
            return json.loads(raw), raw
        return {}, raw

    def handle_api(self, method: str, path: str, query: Dict[str, Any]) -> Dict[str, Any]:
        if method == "GET" and path == "/api/health":
            return {"ok": True}
        if method == "GET" and path == "/api/dashboard":
            return dashboard()
        if method == "GET" and path == "/api/stocks":
            return {"stocks": list_stocks()}
        if method == "POST" and path == "/api/stocks":
            payload, _ = self.read_body()
            return {"stock": create_stock(payload)}
        if method == "POST" and path == "/api/stocks/import":
            payload, raw = self.read_body()
            content = payload.get("content") if payload else raw
            return import_stocks_csv(content or "")
        if path.startswith("/api/stocks/"):
            parts = path.strip("/").split("/")
            if len(parts) < 3:
                raise ApiError("不正なURLです。", 404)
            stock_id = int(parts[2])
            if method == "GET" and len(parts) == 3:
                return get_stock_detail(stock_id)
            if method == "PUT" and len(parts) == 3:
                payload, _ = self.read_body()
                return {"stock": update_stock(stock_id, payload)}
            if method == "DELETE" and len(parts) == 3:
                delete_stock(stock_id)
                return {"ok": True}
            if method == "POST" and len(parts) == 4 and parts[3] == "analyze":
                notify = query.get("notify", ["0"])[0] == "1"
                return run_analysis(stock_id, notify=notify)
        if method == "POST" and path == "/api/analyze":
            notify = query.get("notify", ["0"])[0] == "1"
            return run_analysis(notify=notify)
        if method == "GET" and path == "/api/signals":
            return {"signals": list_signals()}
        if method == "GET" and path == "/api/notifications":
            return {"notifications": list_notifications()}
        raise ApiError("APIが見つかりません。", 404)

    def send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path: str) -> None:
        if path in {"", "/"}:
            path = "/index.html"
        safe_path = path.lstrip("/")
        target = (STATIC_DIR / safe_path).resolve()
        if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.exists() or target.is_dir():
            target = STATIC_DIR / "index.html"
        body = target.read_bytes()
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def seed_if_empty() -> None:
    if db.row("SELECT id FROM stocks LIMIT 1"):
        return
    samples = [
        {"code": "7203", "name": "トヨタ自動車", "tags": "大型株,自動車", "watch_status": "normal"},
        {"code": "9984", "name": "ソフトバンクグループ", "tags": "AI関連,大型株", "watch_status": "normal"},
        {"code": "6920", "name": "レーザーテック", "tags": "半導体", "watch_status": "strong"},
    ]
    for sample in samples:
        create_stock(sample)
    run_analysis()


def main() -> None:
    db.init_db()
    seed_if_empty()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Trade signal MVP running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
