import { useState } from 'react';
import { FileText, Download, RefreshCw, AlertCircle, Send } from 'lucide-react';
import DatePicker from '../components/DatePicker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
  // Use canvas so ANY format the browser supports (WebP, JPEG, PNG, etc.)
  // is converted to a valid PNG that pdfmake always accepts.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth  || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = url;
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

// ── Parte Mensual — nationality columns ─────────────────────────────────────
const NAT_LABELS = [
  'Bolivia','Argentina','Brasil','Colombia','Chile','Ecuador',
  'Paraguay','Perú','Uruguay','Venezuela','México','Otros Amer.',
  'Canadá','EE.UU','Alemania','España','Francia','Inglaterra',
  'Italia','Suiza','Holanda','Otros Europ.','Japón','Israel',
  'Otros Asia','Oceanía','África',
];
const N_NATS = NAT_LABELS.length; // 27

function mapNatIdx(nat: string): number {
  if (!nat) return 11; // default: Otros Amer.
  const n = nat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/boliv/.test(n)) return 0;
  if (/argentin/.test(n)) return 1;
  if (/brasil|brazil/.test(n)) return 2;
  if (/colomb/.test(n)) return 3;
  if (/chile/.test(n)) return 4;
  if (/ecuador/.test(n)) return 5;
  if (/paragua/.test(n)) return 6;
  if (/peru/.test(n)) return 7;
  if (/urugua/.test(n)) return 8;
  if (/venezuel/.test(n)) return 9;
  if (/mexic|mejic/.test(n)) return 10;
  if (/canad/.test(n)) return 12;
  if (/estado.*uni|eeuu|usa|united.*state|norteameri/.test(n)) return 13;
  if (/aleman|german/.test(n)) return 14;
  if (/espa/.test(n)) return 15;
  if (/franc/.test(n)) return 16;
  if (/ingla|england|british|reino.*unido/.test(n)) return 17;
  if (/ital/.test(n)) return 18;
  if (/suiz|swiss/.test(n)) return 19;
  if (/holand|neerland|dutch|netherlands/.test(n)) return 20;
  if (/japon|japan/.test(n)) return 22;
  if (/israel/.test(n)) return 23;
  if (/oceani|australi|nueva.*zelan|zealand/.test(n)) return 25;
  if (/afric/.test(n)) return 26;
  if (/europ|austria|belgic|dinamar|finlan|greci|hungar|irland|norueg|polon|portug|ruman|rusia|serbi|sueci|turqu|croaci|eslov|chec/.test(n)) return 21;
  if (/asia|chin|corean|india|pakistan|vietn|filipin|tailand|iran|irak|arabi|afghan|bangla|myanmar|mongol|nepal|sri/.test(n)) return 24;
  return 11; // Otros Amer. as fallback
}

export default function ReportesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [fromDate,  setFromDate]  = useState(mondayStr());
  const [toDate,    setToDate]    = useState(todayStr());
  const [rows,      setRows]      = useState<GuestRow[] | null>(null);
  const [rawRes,    setRawRes]    = useState<RawRes[]>([]);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [pdfLoad,   setPdfLoad]   = useState(false);
  const [pyPdfLoad, setPyPdfLoad] = useState(false);
  const [sendLoad,  setSendLoad]  = useState(false);
  const [xlsLoad,   setXlsLoad]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [sendMsg,   setSendMsg]   = useState<string | null>(null);

  // Parte Mensual
  const [mensualMonth, setMensualMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [mensualLoad, setMensualLoad]   = useState(false);
  const [mensualError, setMensualError] = useState<string | null>(null);

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
        .neq('room_id', 'SALON')
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
        for (const ag of (r.additional_guests ?? []) as any[]) {
          if (ag.role === 'babies') continue; // bebés son un conteo, no fila individual
          // Niños heredan procedencia/vía/destino/motivo del padre (huésped 1)
          const enriched = ag.role === 'child' ? {
            ...ag,
            marital_status: 'S',
            origin:    ag.origin    || r.guest_origin    || '',
            next_dest: ag.next_dest || r.guest_next_dest || '',
            transport: ag.transport || r.guest_transport || '',
            purpose:   ag.purpose   || r.guest_purpose   || '',
          } : ag;
          push(enriched, r.room_id);
        }
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

  // ── Parte Mensual PDF ────────────────────────────────────────────────────────
  async function handleGenerarMensual() {
    setMensualLoad(true); setMensualError(null);
    try {
      const [yearS, monthS] = mensualMonth.split('-');
      const year  = parseInt(yearS);
      const month = parseInt(monthS);
      const firstDay     = `${yearS}-${monthS}-01`;
      const daysInMonth  = new Date(year, month, 0).getDate();
      const lastDay      = `${yearS}-${monthS}-${String(daysInMonth).padStart(2, '0')}`;

      const { data, error: err } = await supabase
        .from('reservations')
        .select('check_in, check_out, guest_country, additional_guests')
        .in('status', ['ocupado', 'limpieza'])
        .lte('check_in', lastDay)
        .gt('check_out', firstDay);
      if (err) throw err;

      // dayStats[1..31]: I and P arrays of length N_NATS
      type DS = { I: number[]; P: number[] };
      const dayStats: DS[] = Array.from({ length: 32 }, () => ({
        I: Array(N_NATS).fill(0),
        P: Array(N_NATS).fill(0),
      }));

      for (const res of (data ?? [])) {
        const ci = res.check_in as string;
        const co = res.check_out as string;
        const mainNat = res.guest_country ?? '';
        const nats: string[] = [mainNat];
        for (const ag of (res.additional_guests ?? []) as any[]) {
          if (ag.role === 'babies') continue;
          // Inherit main guest's nationality when additional guest has none
          const agNat = ag.nationality ?? ag.guest_nationality ?? '';
          nats.push(agNat || mainNat);
        }
        for (const nat of nats) {
          const idx = mapNatIdx(nat);
          for (let d = 1; d <= daysInMonth; d++) {
            const dd = `${yearS}-${monthS}-${String(d).padStart(2, '0')}`;
            if (ci === dd) { dayStats[d].I[idx]++; }
            else if (ci < dd && co > dd) { dayStats[d].P[idx]++; }
          }
        }
      }

      const pm   = await loadPdfMake();
      const base = window.location.origin;
      const logoIzq = await imgToBase64(`${base}/escudo-bolivia.png`).catch(() => '');
      const logoDer = await imgToBase64(`${base}/escudo-chuquisaca.jpg`).catch(() =>
                      imgToBase64(`${base}/escudo-chuquisaca.png`).catch(() => ''));

      // Column widths: 1 day + 27*2 nat cols + 1 total (no I/P split)
      const DAY_W = 18;
      const COL_W = 11;
      const TOT_W = 16;
      const tableWidths: (number|string)[] = [
        DAY_W,
        ...Array.from({ length: N_NATS }, () => [COL_W, COL_W]).flat(),
        TOT_W,
      ];

      // Header row 1: "Nacio" + nationality names horizontal (colSpan 2 each)
      const headerRow1: any[] = [
        { text: 'Nacio', fontSize: 5.5, bold: true, alignment: 'center', fillColor: '#d8d8d8' },
      ];
      for (let i = 0; i < N_NATS; i++) {
        headerRow1.push({
          text: NAT_LABELS[i], fontSize: 5, bold: true, alignment: 'center',
          colSpan: 2, fillColor: '#e8e8e8', margin: [0, 1, 0, 1],
        });
        headerRow1.push({});
      }
      headerRow1.push({ text: 'Total', fontSize: 5.5, bold: true, alignment: 'center', fillColor: '#b0b0b0' });

      // Header row 2: "Dias" + I/P per nationality
      const headerRow2: any[] = [
        { text: 'Dias', fontSize: 5.5, bold: true, alignment: 'center', fillColor: '#d8d8d8' },
      ];
      for (let i = 0; i < N_NATS; i++) {
        const bg = i % 2 === 0 ? '#eeeeee' : '#e4e4e4';
        headerRow2.push({ text: 'I', fontSize: 6, alignment: 'center', bold: true, fillColor: bg });
        headerRow2.push({ text: 'P', fontSize: 6, alignment: 'center', fillColor: bg });
      }
      headerRow2.push({ text: 'I+P', fontSize: 5, bold: true, alignment: 'center', fillColor: '#b0b0b0' });

      // Totals accumulation
      const totI = Array(N_NATS).fill(0);
      const totP = Array(N_NATS).fill(0);

      // Day data rows
      const dataRows: any[][] = [];
      for (let d = 1; d <= 31; d++) {
        if (d > daysInMonth) {
          dataRows.push([
            { text: String(d), alignment: 'center', fontSize: 6, fillColor: '#f0f0f0', color: '#bbb' },
            ...Array(N_NATS * 2 + 1).fill({ text: '', fillColor: '#f8f8f8' }),
          ]);
          continue;
        }
        const ds = dayStats[d];
        const tI = ds.I.reduce((a, b) => a + b, 0);
        const tP = ds.P.reduce((a, b) => a + b, 0);
        const dayTotal = tI + tP;
        const row: any[] = [{ text: String(d), alignment: 'center', fontSize: 7, bold: true }];
        for (let n = 0; n < N_NATS; n++) {
          const bg = n % 2 === 0 ? '#ffffff' : '#f8f8f8';
          row.push({ text: ds.I[n] || '', alignment: 'center', fontSize: 7, fillColor: bg });
          row.push({ text: ds.P[n] || '', alignment: 'center', fontSize: 7, fillColor: bg });
          totI[n] += ds.I[n]; totP[n] += ds.P[n];
        }
        // Total col: bold, no right border
        row.push({ text: dayTotal || '', alignment: 'center', fontSize: 7, bold: true, fillColor: '#f0f0f0' });
        dataRows.push(row);
      }

      const grandI = totI.reduce((a, b) => a + b, 0);
      const grandP = totP.reduce((a, b) => a + b, 0);

      // Totales row
      const totalesRow: any[] = [
        { text: 'Totales', alignment: 'center', fontSize: 6, bold: true, fillColor: '#d8d8d8' },
      ];
      for (let n = 0; n < N_NATS; n++) {
        totalesRow.push({ text: totI[n] || '', alignment: 'center', fontSize: 6, bold: true, fillColor: '#e4e4e4' });
        totalesRow.push({ text: totP[n] || '', alignment: 'center', fontSize: 6, bold: true, fillColor: '#e4e4e4' });
      }
      totalesRow.push({ text: grandI + grandP || '', alignment: 'center', fontSize: 6, bold: true, fillColor: '#c0c0c0' });

      // Summary helper
      function summaryVals(type: 0|1|2) {
        let sI = 0, sP = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const ds = dayStats[d];
          if (type === 0) { sI += ds.I[0]; sP += ds.P[0]; }
          else if (type === 1) {
            sI += ds.I.slice(1).reduce((a: number, b: number) => a + b, 0);
            sP += ds.P.slice(1).reduce((a: number, b: number) => a + b, 0);
          } else {
            sI += ds.I.reduce((a, b) => a + b, 0);
            sP += ds.P.reduce((a, b) => a + b, 0);
          }
        }
        return { sI, sP, tot: sI + sP };
      }
      const [nals, extr, total] = [summaryVals(0), summaryVals(1), summaryVals(2)];
      const monthName = MONTHS_ES[month];

      const c7 = (t: any, opts: any = {}) => ({ text: t, fontSize: 7, ...opts });
      const c7b = (t: any, opts: any = {}) => ({ text: t, fontSize: 7, bold: true, ...opts });

      const docDef: any = {
        pageSize: 'A4',
        pageOrientation: 'landscape',
        pageMargins: [8, 6, 8, 6],
        content: [
          // ── TOP HEADER ────────────────────────────────────────────────────
          {
            table: {
              widths: [58, '*', 95],
              body: [[
                // Left: logo + viceministerio
                {
                  stack: [
                    logoIzq ? { image: logoIzq, fit: [38, 32], alignment: 'center' } : { text: '' },
                    c7b('VICEMINISTERIO\nDE TURISMO', { alignment: 'center', margin: [0, 2, 0, 0], lineHeight: 1.1 }),
                  ],
                  border: [true, true, true, true],
                  margin: [2, 4, 2, 2],
                },
                // Center: big title
                {
                  stack: [
                    c7b('ESTADISTICAS HOTELERAS', { fontSize: 13, alignment: 'center', margin: [0, 4, 0, 0] }),
                    {
                      columns: [
                        { text: '', width: '*' },
                        c7b('PARTE MENSUAL', { width: 'auto', margin: [0, 2, 30, 0] }),
                        c7b('FORM. N° 6', { width: 'auto', margin: [0, 2, 0, 0] }),
                      ],
                    },
                  ],
                  border: [true, true, true, true],
                },
                // Right: gobierno text + logo
                {
                  stack: [
                    c7b('GOBIERNO AUTÓNOMO DE CHUQUISACA', { alignment: 'center' }),
                    c7('DIRECCIÓN DE TURISMO', { alignment: 'center' }),
                    logoDer ? { image: logoDer, fit: [36, 30], alignment: 'center', margin: [0, 2, 0, 0] } : { text: '' },
                  ],
                  border: [true, true, true, true],
                  margin: [2, 2, 2, 2],
                },
              ]],
            },
            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#555', vLineColor: () => '#555', paddingTop: () => 2, paddingBottom: () => 2, paddingLeft: () => 3, paddingRight: () => 3 },
            margin: [0, 0, 0, 0],
          },
          // ── INFO SECTION (A / B / rooms) ──────────────────────────────────
          {
            table: {
              widths: [10, 120, 5, 80, 100, 60, 50, '*'],
              body: [[
                // A label
                { text: 'A', fontSize: 8, bold: true, rowSpan: 3, alignment: 'center', margin: [0, 10, 0, 0] },
                // A data
                {
                  stack: [
                    { columns: [c7b('Mes  '), c7(monthName.toUpperCase()), c7b('   Año  '), c7(String(year))], margin: [0, 0, 0, 1] },
                    { columns: [c7b('Ciudad o Localid.  '), c7('SUCRE')], margin: [0, 0, 0, 1] },
                    { columns: [c7b('Establecimiento  '), c7('HOTEL BASTILLE')], margin: [0, 0, 0, 1] },
                  ],
                  rowSpan: 3,
                },
                // B label
                { text: 'B', fontSize: 8, bold: true, rowSpan: 3, alignment: 'center', margin: [0, 10, 0, 0] },
                // B data
                {
                  stack: [
                    { columns: [c7('Empleados Permanentes  '), c7b('3')], margin: [0, 0, 0, 1] },
                    { columns: [c7('Empleados Eventuales  '), c7b('3')], margin: [0, 0, 0, 1] },
                    { columns: [c7('Total Número Empleados  '), c7b('6')], margin: [0, 0, 0, 1] },
                  ],
                  rowSpan: 3,
                },
                // Hab types
                {
                  stack: [
                    c7('Hab. Matrimonial', { margin: [0, 0, 0, 1] }),
                    c7('Hab. Simples', { margin: [0, 0, 0, 1] }),
                    c7('Hab. Dobles', { margin: [0, 0, 0, 1] }),
                  ],
                  rowSpan: 3,
                },
                // Hab counts
                {
                  stack: [
                    c7b('', { margin: [0, 0, 0, 1] }),
                    c7b('', { margin: [0, 0, 0, 1] }),
                    c7b('', { margin: [0, 0, 0, 1] }),
                  ],
                  rowSpan: 3,
                },
                // Totals
                {
                  stack: [
                    { columns: [c7b('Total N° Hab.  '), c7b('21')], margin: [0, 0, 0, 1] },
                    { columns: [c7b('Total N° Plazas.  '), c7b('34')], margin: [0, 0, 0, 1] },
                  ],
                  rowSpan: 3,
                },
                // FRR
                { text: 'FRR 03', fontSize: 8, bold: true, alignment: 'center', rowSpan: 3, margin: [0, 10, 0, 0] },
              ], [
                {}, {}, {}, {}, {}, {}, {}, {},
              ], [
                { text: '', border: [true, false, false, true] },
                {
                  stack: [
                    { columns: [c7b('Categoría  '), c7('****')], margin: [0, 0, 0, 1] },
                    { columns: [c7b('Dirección  '), c7('A. Arce 247')], margin: [0, 0, 0, 1] },
                  ],
                },
                { text: '', border: [true, false, false, true] },
                { text: '', border: [false, false, true, true] },
                { text: '', border: [true, false, false, true] },
                { text: '', border: [true, false, false, true] },
                { text: '', border: [true, false, false, true] },
                { text: '', border: [true, false, false, true] },
              ]],
            },
            layout: {
              hLineWidth: () => 0.4, vLineWidth: () => 0.4,
              hLineColor: () => '#666', vLineColor: () => '#666',
              paddingTop: () => 2, paddingBottom: () => 2,
              paddingLeft: () => 3, paddingRight: () => 3,
            },
            margin: [0, 0, 0, 0],
          },
          // ── MAIN TABLE ────────────────────────────────────────────────────
          {
            table: {
              headerRows: 2,
              widths: tableWidths,
              body: [headerRow1, headerRow2, ...dataRows, totalesRow],
            },
            layout: {
              hLineWidth: (i: number, node: any) => (i === 0 || i === 2 || i === node.table.body.length) ? 0.6 : 0.2,
              vLineWidth: (i: number, node: any) => {
                if (i === 0) return 0.6;
                if (i === node.table.widths.length) return 0; // no right border on TOTAL col
                return 0.2;
              },
              hLineColor: () => '#777',
              vLineColor: () => '#999',
              paddingLeft: () => 1, paddingRight: () => 1,
              paddingTop: () => 1, paddingBottom: () => 1,
            },
            margin: [0, 0, 0, 4],
          },
          // ── FOOTER ────────────────────────────────────────────────────────
          {
            columns: [
              // Referencia
              {
                width: 120,
                stack: [
                  c7b('Referencia:'),
                  c7('I: Ingreso (Entradas)'),
                  c7('P: Permanentes (Pernoctación)'),
                ],
                margin: [0, 2, 0, 0],
              },
              // Nota
              {
                width: '*',
                stack: [
                  { text: 'Nota: Este Formulario debe ser entregado a la\nrepresentación regional de la secretaria Nacional\nde Turismo antes del día 8 del mes siguiente.', fontSize: 6, color: '#444' },
                ],
                margin: [4, 2, 4, 0],
              },
              // Sello
              {
                width: 80,
                stack: [
                  c7('Sello del Establecimiento', { alignment: 'center' }),
                  { text: '\n\n', fontSize: 14 },
                ],
                margin: [0, 2, 0, 0],
              },
              // Persona responsable
              {
                width: 85,
                stack: [
                  c7('Persona responsable', { alignment: 'center' }),
                  c7('Nombre', { alignment: 'center', color: '#888' }),
                  c7b('Guido Dávalos', { alignment: 'center' }),
                ],
                margin: [0, 2, 0, 0],
              },
              // Fecha
              {
                width: 80,
                stack: [
                  c7b('FECHA DE RECEPCION Y SELLO', { alignment: 'center', fontSize: 6 }),
                ],
                margin: [0, 2, 4, 0],
              },
              // Summary table
              {
                width: 'auto',
                table: {
                  widths: [42, 22, 22, 28],
                  body: [
                    [
                      c7b('Resumen', { fillColor: '#e0e0e0' }),
                      c7b('Nals', { alignment: 'center', fillColor: '#e0e0e0' }),
                      c7b('Extr', { alignment: 'center', fillColor: '#e0e0e0' }),
                      c7b('Total', { alignment: 'center', fillColor: '#e0e0e0' }),
                    ],
                    [
                      c7('Ingreso'),
                      { text: nals.sI || '', fontSize: 7, alignment: 'center' },
                      { text: extr.sI || '', fontSize: 7, alignment: 'center' },
                      { text: total.sI || '', fontSize: 7, alignment: 'center' },
                    ],
                    [
                      c7('Permanen.'),
                      { text: nals.sP || '', fontSize: 7, alignment: 'center' },
                      { text: extr.sP || '', fontSize: 7, alignment: 'center' },
                      { text: total.sP || '', fontSize: 7, alignment: 'center' },
                    ],
                    [
                      c7b('Total', { fillColor: '#e8e8e8' }),
                      { text: nals.tot || '', fontSize: 7, bold: true, alignment: 'center', fillColor: '#e8e8e8' },
                      { text: extr.tot || '', fontSize: 7, bold: true, alignment: 'center', fillColor: '#e8e8e8' },
                      { text: total.tot || '', fontSize: 7, bold: true, alignment: 'center', fillColor: '#e8e8e8' },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 0.4, vLineWidth: () => 0.4,
                  hLineColor: () => '#888', vLineColor: () => '#888',
                  paddingLeft: () => 2, paddingRight: () => 2,
                  paddingTop: () => 1, paddingBottom: () => 1,
                },
              },
            ],
          },
        ],
      };

      pm.createPdf(docDef).download(`PARTE_MENSUAL_${yearS}_${String(month).padStart(2,'0')}.pdf`);
    } catch (e: any) {
      setMensualError(e.message ?? 'Error generando PDF');
    } finally {
      setMensualLoad(false);
    }
  }

  // ── Reporte Familiar PDF ─────────────────────────────────────────────────────
  const [familiarMonth, setFamiliarMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [familiarLoad,  setFamiliarLoad]  = useState(false);
  const [familiarError, setFamiliarError] = useState<string | null>(null);

  async function handleGenerarFamiliar() {
    setFamiliarLoad(true); setFamiliarError(null);
    try {
      const [yearS, monthS] = familiarMonth.split('-');
      const year  = parseInt(yearS);
      const month = parseInt(monthS);
      const firstDay    = `${yearS}-${monthS}-01`;
      const daysInMonth = new Date(year, month, 0).getDate();
      const lastDay     = `${yearS}-${monthS}-${String(daysInMonth).padStart(2,'0')}`;
      const monthLabel  = `${MONTHS_ES[month]} ${year}`;

      // ── Fetch data ───────────────────────────────────────────────────────────
      const [txRes, resRes, limpRes, empRes, mktRes] = await Promise.all([
        supabase.from('transactions').select('type,amount,caja,category,description')
          .gte('date', firstDay).lte('date', lastDay),
        supabase.from('reservations').select('has_pet,guest_country,num_guests,additional_guests,status,guest_name')
          .in('status',['ocupado','limpieza']).lte('check_in', lastDay).gt('check_out', firstDay),
        supabase.from('limpiezas').select('cleaner,task_type')
          .gte('date', firstDay).lte('date', lastDay),
        supabase.from('reservations').select('guest_name,wants_invoice,is_empresa,siaat_number,price_per_night,num_nights')
          .eq('wants_invoice', true).lte('check_in', lastDay).gt('check_out', firstDay),
        supabase.from('marketing_posts').select('date,account_name,networks,likes,comments,views,category,notes')
          .gte('date', firstDay).lte('date', lastDay).order('date', { ascending: true }),
      ]);
      // Exclude INICIO/FINAL DE CAJA shift refs (they inflate totals)
      const allTxs = (txRes.data ?? []) as any[];
      const txs    = allTxs.filter((t:any) => t.description !== 'INICIO DE CAJA' && t.description !== 'FINAL DE CAJA');
      const ress   = (resRes.data  ?? []) as any[];
      const limps  = (limpRes.data ?? []) as any[];
      const emps   = (empRes.data  ?? []) as any[];
      const mkts   = (mktRes.data  ?? []) as any[];

      // ── Compute stats ────────────────────────────────────────────────────────
      const ingresos = txs.filter((t:any) => t.type === 'ingreso');
      // Retiros Doña Sonia = money she collected → treat as special positive row, exclude from expense totals
      const egresos  = txs.filter((t:any) => t.type === 'egreso' && t.category !== 'RETIROS DOÑA SONIA');
      const soniaTx  = txs.filter((t:any) => t.category === 'RETIROS DOÑA SONIA');
      const soniaTotal = soniaTx.reduce((s:number,t:any) => s+t.amount, 0);

      const totalInc = ingresos.reduce((s: number, t: any) => s + t.amount, 0);
      const totalEgr = egresos.reduce((s: number, t: any)  => s + t.amount, 0);
      const net      = totalInc - totalEgr;

      // Income by caja
      const incByCaja: Record<string,number> = {};
      for (const t of ingresos) incByCaja[t.caja] = (incByCaja[t.caja]||0) + t.amount;

      // Expense by category (top 12, excluding Doña Sonia)
      const egrByCat: Record<string,number> = {};
      for (const t of egresos) egrByCat[t.category||'OTROS'] = (egrByCat[t.category||'OTROS']||0) + t.amount;
      const egrCatSorted = Object.entries(egrByCat).sort((a,b) => b[1]-a[1]);

      // Sueldos & Servicios
      const sueldos   = egresos.filter((t:any) => t.category === 'B05-SUELDOS Y SALARIOS').reduce((s:number,t:any) => s+t.amount, 0);
      const servicios = egresos.filter((t:any) => t.category === 'B03-SERVICIOS BÁSICOS').reduce((s:number,t:any) => s+t.amount, 0);
      const vitrina   = ingresos.filter((t:any) => t.category === 'H03-VENTA DE VITRINAS').reduce((s:number,t:any) => s+t.amount, 0);

      // Empresas / facturas
      const totalFacturado = emps.reduce((s:number,r:any) => s + (r.price_per_night||0)*(r.num_nights||1), 0);
      const empresas = emps.filter((r:any) => r.is_empresa); void empresas;

      // Income by category
      const incByCat: Record<string,number> = {};
      for (const t of ingresos) incByCat[t.category||'OTROS'] = (incByCat[t.category||'OTROS']||0) + t.amount;
      const incCatSorted = Object.entries(incByCat).sort((a,b) => b[1]-a[1]);

      // Guests
      let totalGuests = 0, foreignGuests = 0, pets = 0;
      for (const r of ress) {
        const isBolivian = (r.guest_country||'').toLowerCase().includes('boliv');
        totalGuests++;
        if (!isBolivian) foreignGuests++;
        if (r.has_pet) pets++;
        for (const ag of (r.additional_guests||[]) as any[]) {
          if (ag.role === 'babies') continue;
          totalGuests++;
          if (!(ag.nationality||ag.guest_nationality||'').toLowerCase().includes('boliv')) foreignGuests++;
        }
      }

      // Limpiezas by cleaner
      const limpByCleaner: Record<string,number> = {};
      for (const l of limps) limpByCleaner[l.cleaner||'?'] = (limpByCleaner[l.cleaner||'?']||0) + 1;
      const limpSorted = Object.entries(limpByCleaner).sort((a,b) => b[1]-a[1]);

      // ── SVG chart helpers ────────────────────────────────────────────────────
      const fmtN = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');

      function hBar(entries: [string,number][], maxVal: number, barColor: string, h: number): string {
        const rowH = 22, pad = 4, labelW = 160, barMaxW = 280, valW = 80;
        const W = labelW + barMaxW + valW + pad*3;
        const H = entries.length * rowH + pad*2;
        let rows = '';
        entries.forEach(([label, val], i) => {
          const y = pad + i * rowH;
          const bw = maxVal > 0 ? (val / maxVal) * barMaxW : 0;
          const truncLabel = label.length > 24 ? label.slice(0,22)+'…' : label;
          rows += `<rect x="${labelW+pad}" y="${y+3}" width="${bw.toFixed(1)}" height="${rowH-8}" fill="${barColor}" rx="3"/>`;
          rows += `<text x="${labelW}" y="${y+rowH/2+4}" text-anchor="end" font-size="9" fill="#555" font-family="Helvetica">${truncLabel}</text>`;
          rows += `<text x="${labelW+pad+bw+4}" y="${y+rowH/2+4}" font-size="9" fill="#333" font-family="Helvetica">Bs. ${fmtN(val)}</text>`;
        });
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Math.max(H,h)}">${rows}</svg>`;
      }

      function pieChart(slices: {label:string;val:number;color:string}[], size=120): string {
        const total = slices.reduce((s,x) => s+x.val, 0);
        if (!total) return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"></svg>`;
        const cx=size/2, cy=size/2, r=size/2-4;
        let paths=''; let angle=-Math.PI/2;
        for (const s of slices) {
          const sweep = (s.val/total)*Math.PI*2;
          const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
          const x2=cx+r*Math.cos(angle+sweep), y2=cy+r*Math.sin(angle+sweep);
          const large = sweep > Math.PI ? 1 : 0;
          paths += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${s.color}"/>`;
          angle += sweep;
        }
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${paths}</svg>`;
      }

      // ── pdfmake doc ──────────────────────────────────────────────────────────
      const pm = await loadPdfMake();

      void { fontSize: 13, bold: true, color: '#1a1a1a', margin: [0,0,0,2] as any }; // titleStyle unused
      const sectionHdr  = { fontSize: 10, bold: true, color: '#444', margin: [0,10,0,4] as any, decoration: 'underline' as any };
      const small       = { fontSize: 8, color: '#666' };
      const COLORS_CAJA = { 'CAJA MAYOR':'#22c55e','CAJA CHICA':'#f59e0b','CUENTA BNB':'#6366f1','TARJETA':'#06b6d4' };
      const CAT_COLORS: string[]  = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899','#14b8a6','#84cc16']; void CAT_COLORS;

      const cajaSlices = Object.entries(incByCaja).map(([k,v]) => ({
        label: k, val: v, color: (COLORS_CAJA as any)[k]||'#999',
      }));

      // Helper: category breakdown table
      function catDetail(cat: string): any {
        const rows = egresos.filter((t:any) => (t.category||'OTROS') === cat);
        if (!rows.length) return null;
        const total = rows.reduce((s:number,t:any) => s+t.amount, 0);
        return {
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: cat, fontSize:8, bold:true, color:'#dc2626', colSpan:2 }, {}],
              ...rows.map((t:any) => ([
                { text: t.description||'—', fontSize:7.5, color:'#555' },
                { text: `Bs. ${fmtN(t.amount)}`, fontSize:7.5, color:'#333', alignment:'right' },
              ])),
              [{ text:'SUBTOTAL', fontSize:8, bold:true }, { text:`Bs. ${fmtN(total)}`, fontSize:8, bold:true, color:'#dc2626', alignment:'right' }],
            ],
          },
          layout: { hLineWidth:(i:number,n:any)=>i===0||i===1||i===n.table.body.length?0.5:0.2, vLineWidth:()=>0, hLineColor:()=>'#ddd', paddingLeft:()=>2, paddingRight:()=>2, paddingTop:()=>2, paddingBottom:()=>2 },
          margin:[0,4,0,8],
        };
      }

      const limpPieSlices = limpSorted.map(([name,cnt],i) => ({
        label:name, val:cnt,
        color:['#8b5cf6','#ec4899','#06b6d4','#22c55e','#f59e0b','#ef4444'][i%6],
      }));

      const content: any[] = [
        // ── Header ──────────────────────────────────────────────────────────────
        { text: '🏨 HOTEL BASTILLE — REPORTE FAMILIAR', fontSize:15, bold:true, color:'#1a1a1a', margin:[0,0,0,2] },
        { text: `📅 ${monthLabel.toUpperCase()}`, fontSize:10, color:'#666', margin:[0,0,0,12] },

        // ── 1. Resumen financiero ────────────────────────────────────────────────
        { text: '📊 RESUMEN FINANCIERO', ...sectionHdr },
        {
          columns: [
            {
              width: '*',
              table: {
                widths: ['*','auto'],
                body: [
                  [{ text:'✅ INGRESOS TOTALES', fontSize:9, bold:true, color:'#16a34a' },{ text:`Bs. ${fmtN(totalInc)}`, fontSize:9, bold:true, color:'#16a34a', alignment:'right' }],
                  [{ text:'❌ EGRESOS TOTALES',  fontSize:9, bold:true, color:'#dc2626' },{ text:`Bs. ${fmtN(totalEgr)}`, fontSize:9, bold:true, color:'#dc2626', alignment:'right' }],
                  ...(soniaTotal>0?[[{ text:'💚 Recaudado Doña Sonia', fontSize:9, bold:true, color:'#16a34a' },{ text:`+ Bs. ${fmtN(soniaTotal)}`, fontSize:9, bold:true, color:'#16a34a', alignment:'right' }]]:[]),
                  [{ text:'💰 BALANCE NETO', fontSize:11, bold:true },{ text:`Bs. ${fmtN(net)}`, fontSize:11, bold:true, color:net>=0?'#1d4ed8':'#dc2626', alignment:'right' }],
                  [{ text:'👷 Sueldos',           ...small },{ text:`Bs. ${fmtN(sueldos)}`,   ...small, alignment:'right' }],
                  [{ text:'⚡ Servicios básicos',  ...small },{ text:`Bs. ${fmtN(servicios)}`, ...small, alignment:'right' }],
                  [{ text:'🛍️ Ventas vitrina',    ...small },{ text:`Bs. ${fmtN(vitrina)}`,   ...small, alignment:'right' }],
                  [{ text:'🧾 Facturado',          ...small },{ text:`Bs. ${fmtN(totalFacturado)}`, ...small, alignment:'right' }],
                ],
              },
              layout:'lightHorizontalLines',
            },
            {
              width:130,
              stack:[
                { text:'💵 Ingresos por caja', fontSize:8, color:'#555', alignment:'center', margin:[0,0,0,4] },
                cajaSlices.length ? { svg:pieChart(cajaSlices,110), width:110, alignment:'center' } : { text:'Sin datos', fontSize:8, color:'#aaa', alignment:'center' },
                ...cajaSlices.map(s=>({ text:`■ ${s.label.replace('CAJA MAYOR','Efectivo').replace('CAJA CHICA','Caja Chica').replace('CUENTA BNB','QR')}: Bs. ${fmtN(s.val)}`, fontSize:7, color:s.color, margin:[0,1,0,0] })),
              ],
            },
          ],
          columnGap:16, margin:[0,0,0,8],
        },

        // ── 2. Ingresos por categoría ────────────────────────────────────────────
        { text: '💚 INGRESOS POR CATEGORÍA', ...sectionHdr },
        incCatSorted.length
          ? { svg:hBar(incCatSorted.slice(0,10), incCatSorted[0]?.[1]||1, '#22c55e', 60), margin:[0,0,0,10] }
          : { text:'Sin ingresos.', fontSize:9, color:'#aaa', margin:[0,0,0,8] },

        // ── 3. Egresos por categoría + desglose ──────────────────────────────────
        { text: '💸 EGRESOS POR CATEGORÍA', ...sectionHdr },
        egrCatSorted.length
          ? { svg:hBar(egrCatSorted.slice(0,14), egrCatSorted[0]?.[1]||1, '#ef4444', 60), margin:[0,0,0,6] }
          : { text:'Sin egresos.', fontSize:9, color:'#aaa', margin:[0,0,0,8] },
        { text:'📋 Detalle por categoría:', fontSize:9, bold:true, color:'#444', margin:[0,4,0,4] },
        ...egrCatSorted.map(([cat]) => catDetail(cat)).filter(Boolean),

        // ── 4. Huéspedes ─────────────────────────────────────────────────────────
        { text: '🧳 HUÉSPEDES DEL MES', ...sectionHdr },
        {
          table:{
            widths:['*','*','*','*'],
            body:[[
              { text:`${totalGuests}\n🧑 Huéspedes`,          fontSize:12,bold:true,alignment:'center',margin:[0,6,0,6] },
              { text:`${totalGuests-foreignGuests}\n🇧🇴 Nacionales`,fontSize:12,bold:true,color:'#2563eb',alignment:'center',margin:[0,6,0,6] },
              { text:`${foreignGuests}\n✈️ Extranjeros`,       fontSize:12,bold:true,color:'#7c3aed',alignment:'center',margin:[0,6,0,6] },
              { text:`${pets}\n🐾 Mascotas`,                  fontSize:12,bold:true,color:'#d97706',alignment:'center',margin:[0,6,0,6] },
            ]],
          },
          layout:{ hLineWidth:()=>0.4,vLineWidth:()=>0.4,hLineColor:()=>'#ddd',vLineColor:()=>'#ddd' },
          margin:[0,0,0,10],
        },

        // ── 5. Empresas y Facturas ───────────────────────────────────────────────
        { text: '🧾 FACTURAS Y EMPRESAS', ...sectionHdr },
        {
          table:{
            widths:['*','auto','auto'],
            body:[
              [{ text:'Cliente', fontSize:8,bold:true },{ text:'SIAAT', fontSize:8,bold:true,alignment:'center' },{ text:'Monto', fontSize:8,bold:true,alignment:'right' }],
              ...(emps.length ? emps.map((r:any)=>([
                { text:(r.is_empresa?'🏢 ':'👤 ')+(r.guest_name||'—'), fontSize:8 },
                { text:r.siaat_number||'—', fontSize:8, alignment:'center', color:'#666' },
                { text:`Bs. ${fmtN((r.price_per_night||0)*(r.num_nights||1))}`, fontSize:8, alignment:'right' },
              ])) : [[{ text:'Sin facturas este mes.', fontSize:8, color:'#aaa', colSpan:3 },{},{}]]),
              emps.length ? [
                { text:`TOTAL (${emps.length} factura${emps.length!==1?'s':''})`, fontSize:8, bold:true },
                {},
                { text:`Bs. ${fmtN(totalFacturado)}`, fontSize:8, bold:true, color:'#1d4ed8', alignment:'right' },
              ] : null,
            ].filter(Boolean) as any[],
          },
          layout:'lightHorizontalLines',
          margin:[0,0,0,10],
        },

        // ── 6. Limpiezas ─────────────────────────────────────────────────────────
        { text: '🧹 LIMPIEZAS POR PERSONA', ...sectionHdr },
        {
          columns:[
            limpSorted.length
              ? { svg:hBar(limpSorted, limpSorted[0]?.[1]||1,'#8b5cf6',40), width:'*' }
              : { text:'Sin limpiezas.', fontSize:9, color:'#aaa', width:'*' },
            limpPieSlices.length
              ? { stack:[
                  { svg:pieChart(limpPieSlices,100), width:100, alignment:'center' },
                  ...limpPieSlices.map(s=>({ text:`■ ${s.label}: ${s.val}`, fontSize:7, color:s.color, margin:[0,1,0,0], alignment:'center' })),
                ], width:120 }
              : { text:'', width:120 },
          ],
          columnGap:12, margin:[0,0,0,6],
        },
        limpSorted.length ? {
          table:{
            widths:['*','auto','auto'],
            body:[
              [{ text:'👩 Persona',fontSize:8,bold:true },{ text:'Limpiezas',fontSize:8,bold:true,alignment:'center' },{ text:'%',fontSize:8,bold:true,alignment:'center' }],
              ...limpSorted.map(([name,cnt])=>([
                { text:name, fontSize:8 },
                { text:String(cnt), fontSize:8, alignment:'center' },
                { text:`${((cnt/limps.length)*100).toFixed(0)}%`, fontSize:8, alignment:'center' },
              ])),
              [{ text:'TOTAL',fontSize:8,bold:true },{ text:String(limps.length),fontSize:8,bold:true,alignment:'center' },{ text:'100%',fontSize:8,bold:true,alignment:'center' }],
            ],
          },
          layout:'lightHorizontalLines',
          margin:[0,0,0,10],
        } : {},

        // ── 7. Sueldos & Servicios básicos ──────────────────────────────────────
        { text: '⚡ SUELDOS Y SERVICIOS BÁSICOS', ...sectionHdr },
        {
          table:{
            widths:['*','auto'],
            body:[
              [{ text:'👷 B05 — Sueldos y Salarios',fontSize:9,bold:true },{ text:`Bs. ${fmtN(sueldos)}`,fontSize:9,bold:true,color:'#dc2626',alignment:'right' }],
              ...egresos.filter((t:any)=>t.category==='B05-SUELDOS Y SALARIOS').map((t:any)=>([
                { text:`  · ${t.description||'—'}`, fontSize:8, color:'#666' },
                { text:`Bs. ${fmtN(t.amount)}`, fontSize:8, color:'#666', alignment:'right' },
              ])),
              [{ text:'⚡ B03 — Servicios Básicos',fontSize:9,bold:true },{ text:`Bs. ${fmtN(servicios)}`,fontSize:9,bold:true,color:'#dc2626',alignment:'right' }],
              ...egresos.filter((t:any)=>t.category==='B03-SERVICIOS BÁSICOS').map((t:any)=>([
                { text:`  · ${t.description||'—'}`, fontSize:8, color:'#666' },
                { text:`Bs. ${fmtN(t.amount)}`, fontSize:8, color:'#666', alignment:'right' },
              ])),
            ],
          },
          layout:'lightHorizontalLines',
          margin:[0,0,0,4],
        },

        // ── 8. Marketing ────────────────────────────────────────────────────────
        ...(mkts.length > 0 ? (() => {
          const mktLikes    = mkts.reduce((s:number,p:any) => s + (p.likes||0), 0);
          const mktComments = mkts.reduce((s:number,p:any) => s + (p.comments||0), 0);
          const mktViews    = mkts.reduce((s:number,p:any) => s + (p.views||0), 0);
          // By network
          const byNet: Record<string,number> = {};
          for (const p of mkts) for (const n of (p.networks||[])) byNet[n] = (byNet[n]||0)+1;
          // By category
          const byCat: Record<string,number> = {};
          for (const p of mkts) byCat[p.category||'Otros'] = (byCat[p.category||'Otros']||0)+1;
          return [
            { text: '📱 MARKETING — REDES SOCIALES', ...sectionHdr },
            {
              columns: [
                { text: `📸 Publicaciones: ${mkts.length}`, fontSize:9, bold:true },
                { text: `❤️ Likes: ${mktLikes.toLocaleString()}`, fontSize:9 },
                { text: `💬 Comentarios: ${mktComments.toLocaleString()}`, fontSize:9 },
                { text: `👁 Vistas: ${mktViews.toLocaleString()}`, fontSize:9 },
              ],
              margin: [0,0,0,6],
            },
            {
              columns: [
                {
                  width: '50%',
                  stack: [
                    { text: 'Por red social:', fontSize:8, bold:true, color:'#555', margin:[0,0,0,2] },
                    ...Object.entries(byNet).map(([net,cnt]) => ({ text: `• ${net}: ${cnt}`, fontSize:8, color:'#666' })),
                  ],
                },
                {
                  width: '50%',
                  stack: [
                    { text: 'Por categoría:', fontSize:8, bold:true, color:'#555', margin:[0,0,0,2] },
                    ...Object.entries(byCat).map(([cat,cnt]) => ({ text: `• ${cat}: ${cnt}`, fontSize:8, color:'#666' })),
                  ],
                },
              ],
              margin: [0,0,0,6],
            },
            {
              table: {
                widths: [50, 80, 80, 40, 40, 50],
                headerRows: 1,
                body: [
                  [
                    { text:'Fecha',    fontSize:8, bold:true, fillColor:'#f9fafb' },
                    { text:'Cuenta',   fontSize:8, bold:true, fillColor:'#f9fafb' },
                    { text:'Redes',    fontSize:8, bold:true, fillColor:'#f9fafb' },
                    { text:'Likes',    fontSize:8, bold:true, fillColor:'#f9fafb', alignment:'right' },
                    { text:'Com.',     fontSize:8, bold:true, fillColor:'#f9fafb', alignment:'right' },
                    { text:'Vistas',   fontSize:8, bold:true, fillColor:'#f9fafb', alignment:'right' },
                  ],
                  ...mkts.map((p:any) => ([
                    { text: p.date?.slice(5) ?? '', fontSize:7, color:'#555' },
                    { text: `@${p.account_name||''}`, fontSize:7, color:'#555' },
                    { text: (p.networks||[]).join(', '), fontSize:7, color:'#555' },
                    { text: (p.likes||0).toLocaleString(), fontSize:7, color:'#555', alignment:'right' },
                    { text: (p.comments||0).toLocaleString(), fontSize:7, color:'#555', alignment:'right' },
                    { text: (p.views||0).toLocaleString(), fontSize:7, color:'#555', alignment:'right' },
                  ])),
                ],
              },
              layout: 'lightHorizontalLines',
              margin: [0,0,0,4],
            },
          ];
        })() : [{ text: '📱 MARKETING — Sin publicaciones registradas este mes', ...sectionHdr }]),

        { text:`✍️ Generado: ${new Date().toLocaleDateString('es-BO',{timeZone:'America/La_Paz',day:'2-digit',month:'long',year:'numeric'})}`, fontSize:7, color:'#999', margin:[0,14,0,0], alignment:'right' },
      ];

      const docDef: any = {
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 40],
        content,
        defaultStyle: { font: 'Roboto' },
      };

      pm.createPdf(docDef).download(`REPORTE_FAMILIAR_${yearS}_${String(month).padStart(2,'0')}.pdf`);
    } catch (e: any) {
      setFamiliarError(e.message ?? 'Error generando PDF');
    } finally {
      setFamiliarLoad(false);
    }
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
        // Age: prefer stored value, fall back to computing from birthdate
        const age = r.guest_age ?? r.age
          ?? ageFromBirthdate(r.guest_birthdate ?? r.birthdate ?? null)
          ?? '';
        return [
          g('guest_name','name'), g('guest_gender','gender'),
          String(age),            ms ? ms[0].toUpperCase() : '',
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
          for (const ag of (r.additional_guests || []) as any[]) {
            if (ag.role === 'babies') continue; // bebés son un conteo, no fila individual
            // Niños heredan procedencia/vía/destino/motivo del padre (huésped 1)
            const enriched = ag.role === 'child' ? {
              ...ag,
              marital_status: 'S',
              origin:    ag.origin    || r.guest_origin    || '',
              next_dest: ag.next_dest || r.guest_next_dest || '',
              transport: ag.transport || r.guest_transport || '',
              purpose:   ag.purpose   || r.guest_purpose   || '',
            } : ag;
            out.push(getRow(enriched, r.room_id));
          }
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

          {rows && (() => {
            // Fields considered required for the official form
            const REQUIRED_FIELDS: (keyof GuestRow)[] = ['gender','age','marital','document','purpose','origin','next_dest','transport'];
            const isMissing = (r: GuestRow, f: keyof GuestRow) => {
              const v = r[f];
              return v === null || v === undefined || String(v).trim() === '';
            };
            const isIncomplete = (r: GuestRow) => REQUIRED_FIELDS.some(f => isMissing(r, f));
            const incompleteCount = rows.filter(isIncomplete).length;
            const displayRows = onlyIncomplete ? rows.filter(isIncomplete) : rows;

            // Cell style: red bg if value is missing
            const cell = (r: GuestRow, f: keyof GuestRow, cls = '') =>
              isMissing(r, f)
                ? `px-3 py-2 bg-red-50 text-red-400 ${cls}`
                : `px-3 py-2 text-gray-600 ${cls}`;

            return (
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
                {incompleteCount > 0 && (
                  <button
                    onClick={() => setOnlyIncomplete(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      onlyIncomplete
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                    }`}
                  >
                    ⚠️ {incompleteCount} incompleto{incompleteCount !== 1 ? 's' : ''}
                    {onlyIncomplete ? ' — ver todos' : ' — filtrar'}
                  </button>
                )}
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
                      <th className="px-3 py-3 text-left font-semibold">Proced.</th>
                      <th className="px-3 py-3 text-left font-semibold">Destino</th>
                      <th className="px-3 py-3 text-center font-semibold">Vía</th>
                      <th className="px-3 py-3 text-left font-semibold">Ingreso</th>
                      <th className="px-3 py-3 text-left font-semibold">Salida</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayRows.length === 0 ? (
                      <tr><td colSpan={13} className="px-3 py-8 text-center text-gray-400 text-sm">Sin huéspedes {onlyIncomplete ? 'incompletos' : 'facturados'}</td></tr>
                    ) : displayRows.map((r, i) => {
                      const incomplete = isIncomplete(r);
                      return (
                        <tr key={i} className={incomplete ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}>
                          <td className={`px-3 py-2 font-medium ${incomplete ? 'text-gray-800' : 'text-gray-800'}`}>{r.name}</td>
                          <td className={cell(r, 'gender', 'text-center')}>{r.gender || '—'}</td>
                          <td className={`px-3 py-2 text-center ${r.age === null || r.age === undefined ? 'bg-red-50 text-red-400' : 'text-gray-600'}`}>{r.age ?? '—'}</td>
                          <td className={cell(r, 'marital', 'text-center')}>{r.marital || '—'}</td>
                          <td className={`px-3 py-2 text-gray-600`}>{r.country}</td>
                          <td className={cell(r, 'document', 'font-mono text-xs')}>{r.document || '—'}</td>
                          <td className={cell(r, 'purpose')}>{r.purpose || '—'}</td>
                          <td className="px-3 py-2 text-center font-semibold text-gray-900">{r.room}</td>
                          <td className={cell(r, 'origin')}>{r.origin || '—'}</td>
                          <td className={cell(r, 'next_dest')}>{r.next_dest || '—'}</td>
                          <td className={cell(r, 'transport', 'text-center')}>{r.transport || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{fmt(r.check_in)}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{fmt(r.check_out)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}
        </div>
      </div>

      {/* ── Parte Mensual ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
            <FileText size={18} className="text-green-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Parte Mensual</h2>
            <p className="text-xs text-gray-400">Formulario N° 6 — Viceministerio de Turismo</p>
          </div>
        </div>
        <div className="px-6 py-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mes y Año</label>
            <input
              type="month"
              value={mensualMonth}
              onChange={e => setMensualMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>
          <button
            onClick={handleGenerarMensual}
            disabled={mensualLoad}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {mensualLoad
              ? <RefreshCw size={14} className="animate-spin" />
              : <Download size={14} />}
            {mensualLoad ? 'Generando…' : 'Descargar PDF'}
          </button>
          {mensualError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={14} /> {mensualError}
            </div>
          )}
        </div>
      </div>

      {/* ── Reporte Familiar — admin only ────────────────────────────────────── */}
      {isAdmin && <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
            <FileText size={18} className="text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Reporte Familiar</h2>
            <p className="text-xs text-gray-400">Estadísticas del mes — ingresos, egresos, huéspedes, limpiezas</p>
          </div>
        </div>
        <div className="px-6 py-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mes y Año</label>
            <input
              type="month"
              value={familiarMonth}
              onChange={e => setFamiliarMonth(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <button
            onClick={handleGenerarFamiliar}
            disabled={familiarLoad}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {familiarLoad
              ? <RefreshCw size={14} className="animate-spin" />
              : <Download size={14} />}
            {familiarLoad ? 'Generando…' : 'Descargar PDF'}
          </button>
          {familiarError && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle size={14} /> {familiarError}
            </div>
          )}
        </div>
      </div>}
    </div>
  );
}
