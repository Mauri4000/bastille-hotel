"""
Cambia la cuenta de Eloisa → Lizz en Supabase Auth + tabla profiles.
Corré con: python scripts/create_lizz.py
"""
import urllib.request, json

SUPABASE_URL = "https://spjhqriqozgybdimcjea.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwamhxcmlxb3pneWJkaW1jamVhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjM5MTM1NywiZXhwIjoyMDk3OTY3MzU3fQ.9nSGVLLM53msRMrIeEwEVrkbAYst_n2C4rs33abFczU"

ELOISA_UID = "0841619b-609d-49d7-8c0a-26e65410ccdb"
NEW_EMAIL  = "lizz@bastillehotel.bo"
NEW_PASS   = "Lizz2025!"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": "Bearer " + SERVICE_KEY,
    "Content-Type": "application/json",
}

def req(method, url, body=None):
    data = json.dumps(body).encode() if body else None
    r = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(r) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

print("Actualizando auth user...")
status, resp = req("PUT",
    f"{SUPABASE_URL}/auth/v1/admin/users/{ELOISA_UID}",
    {"email": NEW_EMAIL, "password": NEW_PASS, "email_confirm": True}
)
if status == 200:
    print(f"  ✓ Email actualizado a: {resp.get('email')}")
else:
    print(f"  ✗ Error {status}:", resp)

print("Actualizando tabla profiles...")
status2, resp2 = req("PATCH",
    f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{ELOISA_UID}",
    {"name": "Lizz", "email": NEW_EMAIL}
)
if status2 in (200, 204):
    print("  ✓ Nombre e email actualizados en profiles")
else:
    print(f"  ✗ Error {status2}:", resp2)

print()
print("=== Credenciales de Lizz ===")
print(f"  Email:      {NEW_EMAIL}")
print(f"  Contraseña: {NEW_PASS}")
print("  Rol:        admin")
