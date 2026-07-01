# -*- coding: utf-8 -*-
"""
BASTILLE HOTEL -- Parte Diario
Envia automaticamente cada domingo.
Uso: python scripts/send_parte_diario.py [YYYY-MM-DD] [YYYY-MM-DD]
"""
import os, sys, json, smtplib, urllib.request
from datetime import timedelta, date
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.platypus.flowables import Flowable
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase.pdfmetrics import stringWidth

# -- Color suave para todo el documento (menos la NOTA del pie) -----------
GRAY = colors.Color(0.40, 0.40, 0.40)

# -- Assets ------------------------------------------------------------------
ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "assets")
def find_asset(name):
    for ext in (".png", ".jpg", ".jpeg"):
        p = os.path.join(ASSETS_DIR, name + ext)
        if os.path.exists(p): return p
    return None

LOGO_LEFT  = find_asset("logo_gac")
LOGO_RIGHT = find_asset("logo_secretaria")

# -- Config ------------------------------------------------------------------
SUPABASE_URL = "https://spjhqriqozgybdimcjea.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwamhxcmlxb3pneWJkaW1jamVhIiwicm9sZSI6"
    "ImFub24iLCJpYXQiOjE3ODIzOTEzNTcsImV4cCI6MjA5Nzk2NzM1N30"
    ".vyWHpJMVrFJPvQiNbtk_RaL8ffwKSPKYwHijYuu8fcE"
)
GMAIL_USER = "bastillehotelsucre@gmail.com"
GMAIL_PASS = "hxjglpbwbunqxczg"
EMAIL_TO   = "mauridav377@gmail.com"   # PRUEBA
EMAIL_CC   = []                        # PRUEBA

HOTEL_NAME    = "BASTILLE HOTEL"
HOTEL_ADDRESS = "Calle Aniceto Arce 247"
HOTEL_PHONE   = "6463516"
HOTEL_CAT     = "***"

DIAS_ES  = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
MESES_ES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
             "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

# -- Vertical text (single line, rotated 90 deg) -----------------------------
class VerticalText(Flowable):
    def __init__(self, text, font="Helvetica", size=6.5):
        Flowable.__init__(self)
        self.text = text; self.font = font; self.size = size
    def wrap(self, aW, aH):
        self.height = stringWidth(self.text, self.font, self.size) + 4
        self.width  = self.size + 4
        return self.width, self.height
    def draw(self):
        c = self.canv
        c.saveState(); c.rotate(90)
        c.setFont(self.font, self.size)
        c.setFillColor(GRAY)
        c.drawString(2, -(self.size + 1), self.text)
        c.restoreState()

# -- Vertical text (two words stacked as separate rotated columns) -----------
class VerticalTextML(Flowable):
    def __init__(self, text, font="Helvetica", size=6, gap=3):
        Flowable.__init__(self)
        self.lines = text.split("\n")
        self.font = font; self.size = size; self.gap = gap
    def wrap(self, aW, aH):
        self.height = max(stringWidth(l, self.font, self.size) for l in self.lines) + 4
        self.width  = (self.size + self.gap) * len(self.lines) + 2
        return self.width, self.height
    def draw(self):
        c = self.canv
        for i, line in enumerate(self.lines):
            c.saveState()
            c.translate((i + 0.5) * (self.size + self.gap), 0)
            c.rotate(90)
            c.setFont(self.font, self.size)
            c.setFillColor(GRAY)
            c.drawString(2, -(self.size + 1), line)
            c.restoreState()

def V(t):   return VerticalText(t)
def VML(t): return VerticalTextML(t)

# (FullVLinesTable removed -- replaced by single-row table approach in day_table)

# -- Supabase ----------------------------------------------------------------
def supabase_get(table, params=""):
    url = "%s/rest/v1/%s?%s" % (SUPABASE_URL, table, params)
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r: return json.loads(r.read())

def get_week_dates():
    t = date.today(); m = t - timedelta(days=t.weekday())
    return m, m + timedelta(days=6)

def fetch_reservations(fd, td):
    td2 = (td + timedelta(days=1)).isoformat()
    p = ("wants_invoice=eq.true&check_in=lt." + td2 +
         "&check_out=gt." + fd.isoformat() + "&select=*&order=check_in.asc")
    return supabase_get("reservations", p)

def classify_for_day(rsvs, day):
    e, p, s = [], [], []
    nd = day + timedelta(days=1)
    for r in rsvs:
        ci = date.fromisoformat(r["check_in"])
        co = date.fromisoformat(r["check_out"])
        if ci > day or co <= day: continue
        if ci == day:   e.append(r)
        elif co == nd:  s.append(r)
        else:           p.append(r)
    return e, p, s

# -- PDF ---------------------------------------------------------------------
def build_pdf(from_date, to_date, reservations):
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.2*cm, bottomMargin=1.8*cm)

    # Column widths -- portrait A4 usable ~18 cm
    CW = [4.0*cm, 0.7*cm, 0.65*cm, 0.72*cm, 1.8*cm, 1.8*cm,
          1.7*cm, 1.4*cm, 0.7*cm, 1.1*cm, 1.15*cm, 0.55*cm]
    TOTAL_W = sum(CW)

    def S(name, **kw):
        kw.setdefault("fontName", "Helvetica")
        return ParagraphStyle(name, **kw)

    HC = S("hc", fontSize=6.5, alignment=TA_CENTER, leading=8, textColor=GRAY)

    def make_header_row():
        return [
            Paragraph("Nombre y Apellidos",                          S("hn", fontSize=6.5, leading=8, textColor=GRAY)),
            V("Genero"),
            Paragraph("Edad",                                        HC),
            V("Est. Civil"),
            Paragraph("Pais de<br/>origen",                          HC),
            Paragraph("Documento de<br/>identificacion o<br/>pasaporte", HC),
            Paragraph("Profesion",                                   HC),
            Paragraph("Objeto",                                      HC),
            V("Habitacion"),
            Paragraph("Procedencia",                                 HC),
            VML("Proximo\nDestino"),
            V("Via"),
        ]

    def grow(r):
        def g(k, a=""): return str(r.get(k, "") or r.get(a, "") or "")
        ms = g("guest_marital_status", "marital_status")
        # Paragraph wraps text within cell so it never overflows into adjacent columns
        DL = S("dl", fontSize=7, leading=8, textColor=GRAY, alignment=TA_LEFT)
        DC = S("dc", fontSize=7, leading=8, textColor=GRAY, alignment=TA_CENTER)
        def P(txt, style=DC): return Paragraph(txt, style) if txt else ""
        return [
            P(g("guest_name","name"), DL),          # col 0  Nombre - left
            g("guest_gender","gender"),              # col 1  Genero - narrow plain
            g("guest_age","age"),                    # col 2  Edad   - narrow plain
            ms[0].upper() if ms else "",             # col 3  Est.Civil - initial only
            P(g("guest_country","country")),         # col 4  Pais   - center
            P(g("guest_document","document")),       # col 5  Doc    - center
            P(g("guest_profession","profession")),   # col 6  Prof   - center
            P(g("guest_purpose","purpose")),         # col 7  Objeto - center
            g("room_id"),                            # col 8  Hab    - narrow plain
            P(g("guest_origin","origin")),           # col 9  Proced - center
            P(g("guest_next_dest","next_dest")),     # col 10 Dest   - center
            g("guest_transport","transport"),        # col 11 Via    - narrow plain
        ]

    def make_logo(path, h=1.3):
        if path and os.path.exists(path):
            img = RLImage(path); asp = img.imageWidth / img.imageHeight
            hh = h * cm; return RLImage(path, width=hh*asp, height=hh)
        return None

    def day_table(ent, per, sal):
        """Returns a list of single-row Tables. INNERGRID always works in 1-row tables."""
        nc = len(CW)
        tables = []

        def data_ts(bottom=False):
            """TableStyle commands for a single data/empty row."""
            ts = [
                ("FONTNAME",      (0,0),(nc-1,0), "Helvetica"),
                ("FONTSIZE",      (0,0),(nc-1,0), 7),
                ("TEXTCOLOR",     (0,0),(nc-1,0), GRAY),
                ("VALIGN",        (0,0),(nc-1,0), "MIDDLE"),
                ("TOPPADDING",    (0,0),(nc-1,0), 2),
                ("BOTTOMPADDING", (0,0),(nc-1,0), 2),
                ("LEFTPADDING",   (0,0),(nc-1,0), 2),
                ("RIGHTPADDING",  (0,0),(nc-1,0), 2),
                # Outer left + right edges
                ("LINEBEFORE",    (0,0),(0,0), 0.4, colors.black),
                ("LINEAFTER",     (nc-1,0),(nc-1,0), 0.4, colors.black),
                # Vertical column separators — works reliably in 1-row tables
                ("INNERGRID",     (0,0),(nc-1,0), 0.25, colors.black),
                # Center all columns except Nombre (col 0)
                ("ALIGN",         (1,0),(nc-1,0), "CENTER"),
            ]
            if bottom:
                ts.append(("LINEBELOW", (0,0),(nc-1,0), 0.4, colors.black))
            return ts

        # -- Header row --
        ht = Table([make_header_row()], colWidths=CW)
        ht.setStyle(TableStyle([
            ("BOX",           (0,0),(nc-1,0), 0.4, colors.black),
            ("INNERGRID",     (0,0),(nc-1,0), 0.25, colors.black),
            ("ROWHEIGHT",     (0,0),(nc-1,0), 2.0*cm),
            ("VALIGN",        (0,0),(nc-1,0), "BOTTOM"),
            ("ALIGN",         (0,0),(nc-1,0), "CENTER"),
            ("FONTNAME",      (0,0),(nc-1,0), "Helvetica"),
            ("FONTSIZE",      (0,0),(nc-1,0), 6.5),
            ("TEXTCOLOR",     (0,0),(nc-1,0), GRAY),
            ("TOPPADDING",    (0,0),(nc-1,0), 2),
            ("BOTTOMPADDING", (0,0),(nc-1,0), 2),
            ("LEFTPADDING",   (0,0),(nc-1,0), 2),
            ("RIGHTPADDING",  (0,0),(nc-1,0), 2),
        ]))
        tables.append(ht)

        sections = [("ENTRANTES", ent), ("PERMANENTES", per), ("SALIENTES", sal)]
        for si, (lbl, lst) in enumerate(sections):
            is_last_section = (si == len(sections) - 1)

            # -- Label row — label in col 0, spaces in remaining cols so INNERGRID draws --
            lt = Table([[lbl] + [" "] * (nc - 1)], colWidths=CW)
            lt.setStyle(TableStyle([
                ("FONTNAME",      (0,0),(nc-1,0), "Helvetica"),
                ("FONTSIZE",      (0,0),(nc-1,0), 7),
                ("TEXTCOLOR",     (0,0),(nc-1,0), GRAY),
                ("TOPPADDING",    (0,0),(nc-1,0), 4),
                ("BOTTOMPADDING", (0,0),(nc-1,0), 3),
                ("LEFTPADDING",   (0,0),(nc-1,0), 2),
                ("RIGHTPADDING",  (0,0),(nc-1,0), 2),
                ("LINEBEFORE",    (0,0),(0,0), 0.4, colors.black),
                ("LINEAFTER",     (nc-1,0),(nc-1,0), 0.4, colors.black),
                ("INNERGRID",     (0,0),(nc-1,0), 0.25, colors.black),
            ]))
            tables.append(lt)

            # -- Collect guest rows --
            section_rows = []
            for r in lst:
                section_rows.append(grow(r))
                for ag in (r.get("additional_guests") or []):
                    ag2 = dict(ag); ag2["room_id"] = r.get("room_id", "")
                    section_rows.append(grow(ag2))
            if not section_rows:
                section_rows = [[" "] * nc]   # empty placeholder — space triggers INNERGRID

            for ri, row_data in enumerate(section_rows):
                is_last_row = is_last_section and (ri == len(section_rows) - 1)
                rt = Table([row_data], colWidths=CW)
                rt.setStyle(TableStyle(data_ts(bottom=is_last_row)))
                tables.append(rt)

        return tables

    # -- Page footer ---------------------------------------------------------
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawString(1.5*cm, 0.9*cm, "NOTA: Doy fe por la veracidad de los datos")
        canvas.restoreState()

    # -- Story ---------------------------------------------------------------
    story = []

    ll = make_logo(LOGO_LEFT,  1.3)
    lr = make_logo(LOGO_RIGHT, 1.3)
    hl = ll if ll else Paragraph("Gobierno Autonomo de<br/>Chuquisaca",   S("gl", fontSize=7))
    hr = lr if lr else Paragraph("Secretaria de<br/>CULTURAS Y TURISMO", S("gr", fontSize=7, alignment=TA_RIGHT))
    hc = Paragraph("PARTE DIARIO", S("gc", fontSize=18, alignment=TA_CENTER, textColor=colors.Color(0.40, 0.40, 0.40)))

    lw = 3.5*cm; cw2 = TOTAL_W - 2*lw
    ht = Table([[hl, hc, hr]], colWidths=[lw, cw2, lw])
    ht.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0),(-1,-1), 0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 0),
    ]))
    story.append(ht)
    story.append(Spacer(1, 6))

    # Hotel info: 4 columns so labels and values align vertically
    # Col 0: label left  | Col 1: value left  | Col 2: label right | Col 3: value right
    LBL_W  = 3.3*cm   # wide enough for "Establecimiento:"
    VAL_W  = TOTAL_W * 0.6 - LBL_W
    RLBL_W = 2.0*cm   # "Categoría:" / "Teléfono:"
    RVAL_W = TOTAL_W * 0.4 - RLBL_W

    IL  = S("il",  fontSize=9, alignment=TA_LEFT,  textColor=GRAY)
    IR  = S("ir",  fontSize=9, alignment=TA_RIGHT, textColor=GRAY)
    IV  = S("iv",  fontSize=9, alignment=TA_LEFT,  textColor=GRAY)
    IVR = S("ivr", fontSize=9, alignment=TA_LEFT,  textColor=GRAY)

    hotel_tbl = Table([
        [Paragraph("Establecimiento:", IL), Paragraph(HOTEL_NAME,    IV),
         Paragraph("Categoría:",       IR), Paragraph(HOTEL_CAT,     IVR)],
        [Paragraph("Dirección:",       IL), Paragraph(HOTEL_ADDRESS, IV),
         Paragraph("Teléfono:",        IR), Paragraph(HOTEL_PHONE,   IVR)],
    ], colWidths=[LBL_W, VAL_W, RLBL_W, RVAL_W])
    hotel_tbl.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 1),
        ("BOTTOMPADDING", (0,0),(-1,-1), 1),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("FONTNAME",      (0,0),(-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,0),(-1,-1), 9),
        ("TEXTCOLOR",     (0,0),(-1,-1), colors.Color(0.40, 0.40, 0.40)),
    ]))
    story.append(hotel_tbl)
    story.append(Spacer(1, 8))

    # One block per day
    current = from_date
    while current <= to_date:
        dow = DIAS_ES[current.weekday()]
        mes = MESES_ES[current.month]
        day_row = Table(
            [["Día:", dow, str(current.day), "Mes:", mes, "Año:", str(current.year)]],
            colWidths=[1.4*cm, 2.8*cm, 1.0*cm, 1.4*cm, 2.8*cm, 1.4*cm, 2.0*cm],
            hAlign="CENTER"
        )
        day_row.setStyle(TableStyle([
            ("FONTNAME",      (0,0),(-1,-1), "Helvetica"),
            ("FONTSIZE",      (0,0),(-1,-1), 9),
            ("TOPPADDING",    (0,0),(-1,-1), 0),
            ("BOTTOMPADDING", (0,0),(-1,-1), 0),
            ("LEFTPADDING",   (0,0),(-1,-1), 4),
            ("RIGHTPADDING",  (0,0),(-1,-1), 4),
            ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
            ("TEXTCOLOR",     (0,0),(-1,-1), colors.Color(0.40, 0.40, 0.40)),
        ]))
        story.append(day_row)
        story.append(Spacer(1, 3))
        e, p, s = classify_for_day(reservations, current)
        story.extend(day_table(e, p, s))
        story.append(Spacer(1, 10))
        current += timedelta(days=1)

    doc.build(story, onFirstPage=add_footer, onLaterPages=add_footer)
    return buf.getvalue()

# -- Email -------------------------------------------------------------------
def send_email(pdf_bytes, from_date, to_date):
    today   = date.today()
    subject = "BASTILLE HOTEL PARTE DIARIA %d DE %s %d" % (
        today.day, MESES_ES[today.month].upper(), today.year)
    filename = "PARTE_DIARIA_%s_%s.pdf" % (
        from_date.strftime("%d%m%Y"), to_date.strftime("%d%m%Y"))
    body = ("Estimados,\n\nHago el envio del Parte Diario del periodo "
            "%s al %s.\n\nSaludos,\nMauricio Davalos\nBastille Hotel -- Sucre\nTel: %s"
            ) % (from_date.strftime("%d/%m/%Y"), to_date.strftime("%d/%m/%Y"), HOTEL_PHONE)
    msg = MIMEMultipart()
    msg["From"] = GMAIL_USER
    msg["To"] = EMAIL_TO
    msg["Cc"] = ", ".join(EMAIL_CC)
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))
    part = MIMEBase("application", "pdf")
    part.set_payload(pdf_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", 'attachment; filename="PARTE_DIARIA.pdf"')
    msg.attach(part)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as srv:
        srv.login(GMAIL_USER, GMAIL_PASS)
        srv.sendmail(GMAIL_USER, [EMAIL_TO] + EMAIL_CC, msg.as_string())
    print("Enviado: " + subject)

def main():
    monday, sunday = get_week_dates()
    if len(sys.argv) == 3:
        monday = date.fromisoformat(sys.argv[1])
        sunday = date.fromisoformat(sys.argv[2])
    print("Generando: %s a %s" % (monday, sunday))
    res = fetch_reservations(monday, sunday)
    invoiced = [r for r in res if r.get("wants_invoice")]
    print("Con factura: %d" % len(invoiced))
    pdf = build_pdf(monday, sunday, invoiced)
    send_email(pdf, monday, sunday)

if __name__ == "__main__":
    main()
