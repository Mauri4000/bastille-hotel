import { useState } from 'react';
import { FileText, Download, RefreshCw, AlertCircle, Send } from 'lucide-react';
import DatePicker from '../components/DatePicker';
import { supabase } from '../../lib/supabase';

const API = 'http://localhost:5001';

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
}
function mondayStr() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
}
function fmt(ds: string) {
  if (!ds) return '';
  const [y, m, d] = ds.split('-');
  return `${d}/${m}/${y}`;
}
function ageFromBirthdate(bd: string | null): number | null {
  if (!bd) return null;
  const birth = new Date(bd + 'T12:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mo = today.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = () => resolve(); s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function loadXLSX() {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  return (window as any).XLSX;
}
async function loadPdfMake() {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/pdfmake.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/vfs_fonts.js');
  return (window as any).pdfMake;
}
async function imgToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });
}

interface GuestRow {
  name: string; gender: string; age: number | null; marital: string;
  country: string; document: string; profession: string; purpose: string;
  room: string; origin: string; next_dest: string; transport: string;
  check_in: string; check_out: string;
}
type RawRes = Record<string, any>;

const DAYS_ES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CM = 28.35;
const GRAY = '#666666';
// Column widths matching Python CW array (in points)
const CW = [4.0, 0.7, 0.65, 0.72, 1.8, 1.8, 1.7, 1.4, 0.7, 1.1, 1.15, 0.55].map(v => v * CM);

export default function ReportesPage() {
  const [fromDate,  setFromDate]  = useState(mondayStr());
  const [toDate,    setToDate]    = useState(todayStr());
  const [rows,      setRows]      = useState<GuestRow[] | null>(null);
  const [rawRes,    setRawRes]    = useState<RawRes[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [pdfLoad,   setPdfLoad]   = useState(false);
  const [pyPdfLoad, setPyPdfLoad] = useState(false);
  const [sendLoad,  setSendLoad]  = useState(false);
  const [xlsLoad,   setXlsLoad]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [sendMsg,   setSendMsg]   = useState<string | null>(null);

  async function handleGenerar() {
    setLoading(true); setError(null); setRows(null); setRawRes([]);
    try {
      const { data, error: err } = await supabase
        .from('reservations')
        .select(`room_id, check_in, check_out, wants_invoice,
          guest_name, guest_gender, guest_age, guest_birthdate,
          guest_marital_status, guest_country, guest_document,
          guest_profession, guest_purpose, guest_origin, guest_next_dest, guest_transport,
          additional_guests`)
        .eq('status','ocupado').eq('wants_invoice',true)
        .lte('check_in', toDate).gte('check_out', fromDate)
        .order('check_in', { ascending: true });
      if (err) throw err;
      setRawRes(data ?? []);
      const result: GuestRow[] = [];
      for (const r of (data ?? [])) {
        const push = (src: any, roomId: string) => result.push({
          name: src.guest_name ?? src.name ?? '',
          gender: src.guest_gender ?? src.gender ?? '',
          age: src.guest_age ?? ageFromBirthdate(src.guest_birthdate ?? src.birthdate ?? null),
          marital: src.guest_marital_status ?? src.marital_status ?? '',
          country: src.guest_country ?? src.country ?? '',
          document: src.guest_document ?? src.document ?? '',
          profession: src.guest_profession ?? src.profession ?? '',
          purpose: src.guest_purpose ?? src.purpose ?? '',
          room: roomId,
          origin: src.guest_origin ?? src.origin ?? '',
          next_dest: src.guest_next_dest ?? src.next_dest ?? '',
          transport: src.guest_transport ?? src.transport ?? '',
          check_in: r.check_in, check_out: r.check_out,
        });
        push(r, r.room_id);
        for (const ag of (r.additional_guests ?? []) as any[]) push(ag, r.room_id);
      }
      setRows(result);
    } catch (e: any) { setError(e.message ?? 'Error'); }
    finally { setLoading(false); }
  }

  // ── Python server helpers ────────────────────────────────────────────────────
  async function callServer(endpoint: string) {
    const res = await fetch(API + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_date: fromDate, to_date: toDate, reservations: rawRes }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message ?? `Error ${res.status}`);
    }
    return res;
  }

  async function downloadPyPDF() {
    if (!rawRes.length) return;
    setPyPdfLoad(true); setError(null);
    try {
      const res = await callServer('/api/generate');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `PARTE_DIARIA_${fromDate}_${toDate}_python.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e: any) {
      setError('Servidor Python no responde. Corré: python scripts/api_server.py  —  ' + (e.message ?? ''));
    }
    finally { setPyPdfLoad(false); }
  }

  async function sendEmail() {
    if (!rawRes.length) return;
    setSendLoad(true); setSendMsg(null); setError(null);
    try {
      const res = await callServer('/api/send');
      const j   = await res.json();
      setSendMsg(j.message ?? 'Correo enviado.');
    } catch (e: any) {
      setError('Servidor Python no responde. Corré: python scripts/api_server.py  —  ' + (e.message ?? ''));
    }
    finally { setSendLoad(false); }
  }

  // ── Excel ────────────────────────────────────────────────────────────────────
  async function downloadXLSX() {
    if (!rows) return;
    setXlsLoad(true); setError(null);
    try {
      const XLSX = await loadXLSX();
      const COLS = ['Nombre y Apellidos','Género','Edad','Est. Civil','País de origen',
        'Doc./Pasaporte','Profesión','Objeto','Habitación','Procedencia','Próximo Destino','Vía','Ingreso','Salida'];
      const aoa: any[][] = [COLS];
      for (const r of rows)
        aoa.push([r.name,r.gender,r.age??'',r.marital,r.country,
          r.document,r.profession,r.purpose,r.room,
          r.origin,r.next_dest,r.transport,fmt(r.check_in),fmt(r.check_out)]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [22,7,6,8,14,15,14,10,8,12,14,5,10,10].map((w:number) => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Parte Diario');
      XLSX.writeFile(wb, `PARTE_DIARIO_${fromDate}_${toDate}.xlsx`);
    } catch (e: any) { setError(e.message ?? 'Error Excel'); }
    finally { setXlsLoad(false); }
  }

  // ── PDF con pdfmake (descarga directa sin diálogo) ──────────────────────────
  async function downloadPDF() {
    if (!rawRes.length) return;
    setPdfLoad(true); setError(null);
    try {
      const pm   = await loadPdfMake();
      const base = window.location.origin;
      // logo-bastille = Chuquisaca (izquierda), logo-gobierno = Secretaría (derecha)
      const logoIzq = await imgToBase64(`${base}/logo-bastille.png`).catch(() => '');
      const logoDer = await imgToBase64(`${base}/logo-gobierno.png`).catch(() => '');

      // ── Helpers ──────────────────────────────────────────────────────────────
      function dash(v: any) {
        if (v === null || v === undefined) return '-';
        return String(v).trim() || '-';
      }
      function getRow(r: any, roomId: string): string[] {
        const g = (k: string, alt = '') => String(r[k] ?? r[alt] ?? '');
        const ms = g('guest_marital_status','marital_status');
        return [
          g('guest_name','name'), g('guest_gender','gender'),
          g('guest_age','age'),   ms ? ms[0].toUpperCase() : '',
          g('guest_country','country'),       g('guest_document','document'),
          g('guest_profession','profession'), g('guest_purpose','purpose'),
          roomId,
          g('guest_origin','origin'), g('guest_next_dest','next_dest'),
          g('guest_transport','transport'),
        ];
      }
      function expandSection(list: RawRes[]): string[][] {
        const out: string[][] = [];
        for (const r of list) {
          out.push(getRow(r, r.room_id));
          for (const ag of (r.additional_guests || []) as any[]) out.push(getRow(ag, r.room_id));
        }
        return out;
      }
      function classify(ds: string) {
        const e: RawRes[] = [], p: RawRes[] = [], s: RawRes[] = [];
        for (const r of rawRes) {
          const ci = r.check_in, co = r.check_out;
          if (ci > ds || co < ds) continue;
          if (ci === ds && co === ds) e.push(r);
          else if (co === ds) s.push(r);
          else if (ci === ds) e.push(r);
          else p.push(r);
        }
        return { e, p, s };
      }

      // SVG vertical text — bottom-to-top, like ReportLab rotate(90)
      function svgV(text: string, wPt: number): any {
        const hPt = 44;
        return {
          svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${wPt.toFixed(1)}" height="${hPt}">` +
               `<text transform="translate(${(wPt/2).toFixed(1)},${hPt-2}) rotate(-90)" ` +
               `text-anchor="start" font-size="6.5" fill="${GRAY}" font-family="Helvetica">${text}</text>` +
               `</svg>`,
          width: wPt, height: hPt, alignment: 'center',
        };
      }
      function svgVML(t1: string, t2: string, wPt: number): any {
        const hPt = 44;
        return {
          svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${wPt.toFixed(1)}" height="${hPt}">` +
               `<text transform="translate(${(wPt*0.28).toFixed(1)},${hPt-2}) rotate(-90)" text-anchor="start" font-size="6" fill="${GRAY}" font-family="Helvetica">${t1}</text>` +
               `<text transform="translate(${(wPt*0.72).toFixed(1)},${hPt-2}) rotate(-90)" text-anchor="start" font-size="6" fill="${GRAY}" font-family="Helvetica">${t2}</text>` +
               `</svg>`,
          width: wPt, height: hPt, alignment: 'center',
        };
      }

      // SVG horizontal text — bottom-aligned, matching Python VALIGN=BOTTOM
      function hdrSvg(lines: string[], wPt: number, anchor: 'start'|'middle' = 'middle'): any {
        const hPt = 44;
        const lineH = 8;
        const x = anchor === 'start' ? 3 : wPt / 2;
        const baseY = hPt - 3;
        const svgLines = lines.map((line, i) =>
          `<text x="${x.toFixed(1)}" y="${(baseY - (lines.length - 1 - i) * lineH).toFixed(1)}" ` +
          `text-anchor="${anchor}" font-size="6.5" fill="${GRAY}" font-family="Helvetica">${line}</text>`
        ).join('');
        return {
          svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${wPt.toFixed(1)}" height="${hPt}">${svgLines}</svg>`,
          width: wPt, height: hPt,
        };
      }

      // Table column header row — all cells bottom-aligned via SVG
      const hdrRow = [
        hdrSvg(['Nombre y Apellidos'], CW[0], 'start'),
        svgV('Género', CW[1]),
        hdrSvg(['Edad'], CW[2]),
        svgV('Est. Civil', CW[3]),
        hdrSvg(['País de', 'origen'], CW[4]),
        hdrSvg(['Documento de', 'identificación', 'o pasaporte'], CW[5]),
        hdrSvg(['Profesión'], CW[6]),
        hdrSvg(['Objeto'], CW[7]),
        svgV('Habitación', CW[8]),
        hdrSvg(['Proced-', 'encia'], CW[9]),
        svgVML('Próximo', 'Destino', CW[10]),
        svgV('Vía', CW[11]),
      ];

      // Section label row — 12 cells with vertical inner borders
      const secLabel = (lbl: string) => [
        { text: lbl, fontSize: 7, bold: true, color: GRAY, margin: [2,3,2,3] },
        ...Array(11).fill({ text: '' }),
      ];

      // Data cell
      const DC = (v: string, align = 'center') => ({ text: dash(v), fontSize: 7, color: GRAY, alignment: align, margin: [2,2,2,2] });

      // Section data rows
      function secRows(rows: string[][]) {
        if (!rows.length) return [Array(12).fill({ text: ' ', fontSize: 7, margin: [2,5,2,5] })];
        return rows.map(cells => cells.map((c, ci) => DC(c, ci === 0 ? 'left' : 'center')));
      }

      // Border layout — no horizontal lines between data rows, only outer + header separator
      const parteLayout = {
        hLineWidth: (i: number, node: any) => {
          if (i === 0 || i === 1 || i === node.table.body.length) return 0.4;
          return 0;
        },
        vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length) ? 0.4 : 0.25,
        hLineColor: () => '#000000',
        vLineColor: () => '#000000',
        paddingLeft:   () => 2,
        paddingRight:  () => 2,
        paddingTop:    () => 2,
        paddingBottom: () => 2,
      };

      // ── Build content ────────────────────────────────────────────────────────
      const content: any[] = [];

      // Header: [Chuquisaca izq] | [PARTE DIARIO + Establecimiento + Dirección] | [Secretaría der + Categoría + Teléfono]
      const rightStack: any[] = [];
      if (logoDer) rightStack.push({ image: logoDer, fit: [90, 37], alignment: 'right' });
      else         rightStack.push({ text: 'Secretaría de\nCulturas y Turismo', fontSize: 7, color: GRAY, alignment: 'right' });
      rightStack.push({ text: 'Categoría:',         fontSize: 9, color: GRAY, alignment: 'right', margin: [0,2,0,0] });
      rightStack.push({ text: 'Teléfono: 6463516', fontSize: 9, color: GRAY, alignment: 'right' });

      content.push({
        columns: [
          logoIzq
            ? { image: logoIzq, fit: [90, 37], width: 3.5*CM }
            : { text: 'Gobierno Autónomo\nde Chuquisaca', fontSize: 7, color: GRAY, width: 3.5*CM },
          {
            stack: [
              { text: 'PARTE DIARIO', fontSize: 18, bold: true, color: GRAY, alignment: 'center' },
              {
                columns: [
                  { text: 'Establecimiento:', fontSize: 9, color: GRAY, width: 3.3*CM },
                  { text: 'BASTILLE HOTEL',   fontSize: 9, color: GRAY, width: '*' },
                ], margin: [0, 3, 0, 0],
              },
              {
                columns: [
                  { text: 'Dirección:', fontSize: 9, color: GRAY, width: 3.3*CM },
                  { text: 'Calle Aniceto Arce 247', fontSize: 9, color: GRAY, width: '*' },
                ],
              },
            ],
            width: '*',
            margin: [4, 0, 4, 0],
          },
          { stack: rightStack, width: 3.5*CM },
        ],
        columnGap: 4,
        margin: [0, 0, 0, 6],
      });

      // Day blocks
      const days: Date[] = [];
      const cur = new Date(fromDate + 'T12:00:00');
      const endD = new Date(toDate + 'T12:00:00');
      while (cur <= endD) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

      const DL = (t: string) => ({ text: t, fontSize: 9, color: GRAY, alignment: 'right'  as const });
      const DV = (t: string) => ({ text: t, fontSize: 9, color: GRAY, alignment: 'left'   as const });

      const dayLayout = {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft:   () => 2,
        paddingRight:  () => 2,
        paddingTop:    () => 0,
        paddingBottom: () => 0,
      };

      for (const day of days) {
        const ds  = day.toLocaleDateString('en-CA');
        const { e, p, s } = classify(ds);
        const dow = DAYS_ES[day.getDay()];
        const mon = MONTHS_ES[day.getMonth() + 1];

        // Day header row — labels right-aligned, values left-aligned (tight spacing)
        // Parte table
        const tableBody = [
          hdrRow,
          secLabel('ENTRANTES'),   ...secRows(expandSection(e)),
          secLabel('PERMANENTES'), ...secRows(expandSection(p)),
          secLabel('SALIENTES'),   ...secRows(expandSection(s)),
        ];

        // Wrap day row + table in unbreakable stack so they never split across pages
        content.push({
          stack: [
            {
              table: {
                widths: [1.4,2.8,1.0,1.4,2.8,1.4,2.0].map(v => v*CM),
                body: [[DL('Día:'), DV(dow), DV(String(day.getDate())), DL('Mes:'), DV(mon), DL('Año:'), DV(String(day.getFullYear()))]],
              },
              layout: dayLayout,
              alignment: 'center',
              margin: [0, 4, 0, 2],
            },
            {
              table: { headerRows: 1, widths: CW, body: tableBody },
              layout: parteLayout,
              margin: [0, 0, 0, 8],
            },
          ],
          unbreakable: true,
        });
      }

      // ── PDF definition ───────────────────────────────────────────────────────
      const docDef: any = {
        pageSize: 'A4',
        pageMargins: [1.5*CM, 1.2*CM, 1.5*CM, 1.8*CM],
        content,
        footer: () => ({
          text: 'NOTA: Doy fe por la veracidad de los datos',
          fontSize: 10, color: GRAY, bold: true,
          margin: [1.5*CM, 0.5*CM, 1.5*CM, 0],
        }),
        defaultStyle: { font: 'Roboto' },
      };

      pm.createPdf(docDef).download(`PARTE_DIARIA_${fromDate}_${toDate}.pdf`);
    } catch (e: any) { setError(e.message ?? 'Error PDF'); }
    finally { setPdfLoad(false); }
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-sm text-gray-500 mt-1">Genera el Parte Diario para la Secretaría de Culturas y Turismo.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <FileText size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Parte Diario</h2>
            <p className="text-xs text-gray-500">Formato oficial — Secretaría de Culturas y Turismo de Sucre</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-40">
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <DatePicker value={fromDate} onChange={v => { setFromDate(v); setRows(null); setRawRes([]); }} placeholder="Desde" />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <DatePicker value={toDate} onChange={v => { setToDate(v); setRows(null); setRawRes([]); }} placeholder="Hasta" />
            </div>
            <button onClick={handleGenerar} disabled={loading || !fromDate || !toDate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-500 text-gray-900 font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
              {loading ? 'Cargando...' : 'Generar'}
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          )}
          {sendMsg && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs">{sendMsg}</div>
          )}

          {rows && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={downloadXLSX} disabled={xlsLoad}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white font-medium text-sm transition-colors disabled:opacity-50">
                  {xlsLoad ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                  {xlsLoad ? 'Generando...' : 'Descargar Excel'}
                </button>
                <button onClick={downloadPDF} disabled={pdfLoad}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium text-sm transition-colors disabled:opacity-50">
                  {pdfLoad ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                  {pdfLoad ? 'Generando PDF...' : 'Descargar PDF'}
                </button>
                <button onClick={downloadPyPDF} disabled={pyPdfLoad}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-medium text-sm transition-colors disabled:opacity-50">
                  {pyPdfLoad ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}
                  {pyPdfLoad ? 'Generando...' : 'PDF (Python)'}
                </button>
                <button onClick={sendEmail} disabled={sendLoad}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors disabled:opacity-50">
                  {sendLoad ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                  {sendLoad ? 'Enviando...' : 'Enviar correo'}
                </button>
                <span className="text-xs text-gray-400">
                  {rows.length} huésped{rows.length !== 1 ? 'es' : ''} facturado{rows.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-3 py-3 text-left font-semibold">Nombre</th>
                      <th className="px-3 py-3 text-center font-semibold">Gén.</th>
                      <th className="px-3 py-3 text-center font-semibold">Edad</th>
                      <th className="px-3 py-3 text-center font-semibold">E.C.</th>
                      <th className="px-3 py-3 text-left font-semibold">País</th>
                      <th className="px-3 py-3 text-left font-semibold">Documento</th>
                      <th className="px-3 py-3 text-left font-semibold">Objeto</th>
                      <th className="px-3 py-3 text-center font-semibold">Hab.</th>
                      <th className="px-3 py-3 text-left font-semibold">Ingreso</th>
                      <th className="px-3 py-3 text-left font-semibold">Salida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.length === 0 ? (
                      <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">Sin huéspedes facturados</td></tr>
                    ) : rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-800 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{r.gender}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{r.age ?? '—'}</td>
                        <td className="px-3 py-2 text-center text-gray-600">{r.marital}</td>
                        <td className="px-3 py-2 text-gray-600">{r.country}</td>
                        <td className="px-3 py-2 text-gray-600 font-mono text-xs">{r.document}</td>
                        <td className="px-3 py-2 text-gray-600">{r.purpose}</td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-900">{r.room}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{fmt(r.check_in)}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{fmt(r.check_out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm opacity-60">
        <div className="flex items-center gap-3 px-6 py-4">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
            <FileText size={18} className="text-gray-400" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-500">Parte Mensual</h2>
            <p className="text-xs text-gray-400">Próximamente</p>
          </div>
        </div>
      </div>
    </div>
  );
}
