# -*- coding: utf-8 -*-
"""
Servidor API local para la pagina de Reportes del admin panel.
Uso: python scripts/api_server.py
Endpoints:
  POST /api/generate  body: {from_date, to_date, reservations:[...]}  -> PDF bytes
  POST /api/send      body: {from_date, to_date, reservations:[...]}  -> JSON {ok, message}
"""
import sys, os, json, traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from datetime import date
import importlib.util

_dir  = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("spd", os.path.join(_dir, "send_parte_diario.py"))
spd   = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spd)

PORT = 5001

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[API]", fmt % args)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body         = self._read_body()
            from_date    = date.fromisoformat(body["from_date"])
            to_date      = date.fromisoformat(body["to_date"])
            reservations = body.get("reservations", [])
            print("[API] %d reservations received for %s - %s" % (len(reservations), from_date, to_date))

            if parsed.path == "/api/generate":
                pdf = spd.build_pdf(from_date, to_date, reservations)
                fname = "PARTE_DIARIA_%s_%s.pdf" % (from_date.strftime("%d%m%Y"), to_date.strftime("%d%m%Y"))
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(len(pdf)))
                self.send_header("Content-Disposition", 'inline; filename="%s"' % fname)
                self.end_headers()
                self.wfile.write(pdf)

            elif parsed.path == "/api/send":
                pdf = spd.build_pdf(from_date, to_date, reservations)
                spd.send_email(pdf, from_date, to_date)
                body_out = json.dumps({"ok": True, "message": "Correo enviado correctamente."}).encode()
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body_out)))
                self.end_headers()
                self.wfile.write(body_out)

            else:
                self.send_response(404)
                self._cors()
                self.end_headers()

        except Exception as e:
            tb  = traceback.format_exc()
            msg = json.dumps({"ok": False, "message": str(e), "trace": tb}).encode()
            print(tb)
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

if __name__ == "__main__":
    server = HTTPServer(("localhost", PORT), Handler)
    print("API server corriendo en http://localhost:%d" % PORT)
    print("  POST /api/generate  -> PDF")
    print("  POST /api/send      -> Correo")
    server.serve_forever()
