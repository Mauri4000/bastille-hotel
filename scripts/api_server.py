# -*- coding: utf-8 -*-
"""
Servidor API local para la pagina de Reportes del admin panel.
Corre junto al dev server de React.
Uso: python scripts/api_server.py
Endpoints:
  GET  /api/generate?from=YYYY-MM-DD&to=YYYY-MM-DD  -> PDF bytes
  GET  /api/send?from=YYYY-MM-DD&to=YYYY-MM-DD      -> JSON {ok, message}
"""
import sys, os, json, traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import date
import importlib.util

# Carga send_parte_diario desde la misma carpeta scripts/
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
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs     = parse_qs(parsed.query)

        def qd(key):
            vals = qs.get(key, [])
            return date.fromisoformat(vals[0]) if vals else None

        try:
            if parsed.path == "/api/generate":
                fd = qd("from"); td = qd("to")
                if not fd or not td:
                    raise ValueError("Faltan parametros from/to")
                res      = spd.fetch_reservations(fd, td)
                invoiced = [r for r in res if r.get("wants_invoice")]
                pdf      = spd.build_pdf(fd, td, invoiced)
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Length", str(len(pdf)))
                fname = "PARTE_DIARIA_%s_%s.pdf" % (fd.strftime("%d%m%Y"), td.strftime("%d%m%Y"))
                self.send_header("Content-Disposition", 'inline; filename="%s"' % fname)
                self.end_headers()
                self.wfile.write(pdf)

            elif parsed.path == "/api/send":
                fd = qd("from"); td = qd("to")
                if not fd or not td:
                    raise ValueError("Faltan parametros from/to")
                res      = spd.fetch_reservations(fd, td)
                invoiced = [r for r in res if r.get("wants_invoice")]
                pdf      = spd.build_pdf(fd, td, invoiced)
                spd.send_email(pdf, fd, td)
                body = json.dumps({"ok": True, "message": "Correo enviado correctamente."}).encode()
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

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
    print("Endpoints:")
    print("  GET /api/generate?from=YYYY-MM-DD&to=YYYY-MM-DD")
    print("  GET /api/send?from=YYYY-MM-DD&to=YYYY-MM-DD")
    server.serve_forever()
