"""Test-only HTTP transport around the real API, isolated from Forge/user files."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import signal
import sys
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from speech_bubble_forge import api, settings, project_api, background_removal_routes


def main():
    with TemporaryDirectory(prefix="sbe-browser-") as directory:
        root = Path(directory)
        for module in (api, settings, project_api, background_removal_routes):
            module.data_root = lambda: root
        values = {
            "speech_bubble_forge_language": "en",
            "speech_bubble_forge_auto_save": False,
            "speech_bubble_forge_prompt_export_location": False,
            "speech_bubble_forge_use_forge_output_dir": False,
        }
        settings.get_setting = lambda name, default: values.get(name, default)
        app = FastAPI()
        api.register_routes(app)
        with TestClient(app) as client:
            class Handler(BaseHTTPRequestHandler):
                def handle_request(self):
                    size = int(self.headers.get("content-length", "0"))
                    body = self.rfile.read(size) if size else None
                    response = client.request(self.command, self.path, content=body, headers=dict(self.headers))
                    self.send_response(response.status_code)
                    for key, value in response.headers.items():
                        if key.lower() not in {"content-length", "connection", "transfer-encoding"}:
                            self.send_header(key, value)
                    self.send_header("content-length", str(len(response.content)))
                    self.end_headers()
                    self.wfile.write(response.content)
                do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = handle_request
                def log_message(self, *args):
                    pass
            with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
                print("SBE_TEST_SERVER=" + str(server.server_port), flush=True)
                def stop(*args):
                    raise SystemExit(0)
                signal.signal(signal.SIGTERM, stop)
                server.serve_forever()


if __name__ == "__main__":
    main()
