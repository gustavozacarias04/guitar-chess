#!/usr/bin/env python3
"""Static server for local development.

Any static server works; this one exists so that a fresh clone needs nothing
installed beyond Python. It sets the WebAssembly MIME type (Stockfish needs it
for streaming instantiation) and disables caching, which otherwise makes editing
the AudioWorklet maddening.

    python serve.py          -> http://localhost:8000
    python serve.py 8080     -> http://localhost:8080
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SimpleHTTPRequestHandler.extensions_map.update({
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
})


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(Handler, directory=str(Path(__file__).parent))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Guitar Chess -> http://localhost:{port}  (Ctrl+C para parar)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nadeus")


if __name__ == "__main__":
    main()
