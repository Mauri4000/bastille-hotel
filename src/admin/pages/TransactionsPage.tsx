import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Filter, Trash2, Pencil, CalendarDays, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Transaction, TransactionType, CajaType } from '../types';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, MONTH_NAMES } from '../constants';
import CustomSelect from '../components/CustomSelect';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import { logActivity } from '../../lib/logActivity';
import VitrinaProductPicker from '../components/VitrinaProductPicker';

const CAJAS: CajaType[] = ['CAJA MAYOR', 'CAJA CHICA', 'CUENTA BNB', 'TARJETA'];
const CAJA_LABEL: Record<CajaType, string> = {
  'CAJA MAYOR': 'Efectivo',
  'CAJA CHICA': 'Caja Chica',
  'CUENTA BNB': 'QR',
  'TARJETA':    'Tarjeta',
};

type Tab = 'all' | 'mayor' | 'chica' | 'bnb' | 'bnb_eg' | 'bnb_personal';

// ── BNB Import ────────────────────────────────────────────────────────────────
interface BnbRow {
  fecha: string;       // DD/MM/YYYY
  hora: string;        // HH:MM:SS
  referencia: string;  // truncated 10-char BNB reference
  codigo: string;      // unique BNB transaction code (e.g. 4P40924038)
  monto: number;
  cuentaDestino: string;
  nombreDestino: string;
  category: string;    // inferred or ''
  manualCategory: string;
  needsReview: boolean;
}

// Keyword → category map. Keywords are lowercase, matched against the referencia field.
// Keywords matched as whole words (or exact phrase) to avoid "pan" matching "panel"
const BNB_CAT_MAP: Array<{ kw: string[]; cat: string }> = [
  // Mantenimiento — BEFORE desayunos so "panel sol" wins over "pan"
  { kw: ['panel sol', 'fuga', 'soldador', 'chapa puer', 'plomero', 'electric', 'pintura', 'cemento', 'ladrillo', 'manten', 'reparac', 'instalac', 'carpinter', 'gasfiter', 'techado', 'grifo', 'tuberia', 'tubería', 'pintor', 'yeso', 'ceramica', 'cerámica', 'candado', 'chapa', 'llave'], cat: 'B09-MANTENIMIENTO DE HOTEL' },
  // Escuela Español
  { kw: ['escuela', 'español', 'juegos de', 'jazmine', 'jazmin'], cat: 'ESCUELA ESPAÑOL' },
  // Halloween
  { kw: ['halloween', 'disfraz', 'calavera', 'yurex'], cat: 'HALLOWEEN' },
  // Navidad
  { kw: ['navidad', 'arbol navid', 'adorno navid', 'villancico'], cat: 'NAVIDAD' },
  // Desayunos / alimentos — "pan" matched as word boundary to avoid "panel"
  { kw: ['pan molde', 'pan de', ' pan ', 'platano', 'plátano', 'naranja', 'queso', 'yogurt', 'frutilla', 'leche', 'huevo', 'hierba bue', 'cafe pab', 'café', 'verdura', 'fruta', 'tomate', 'cebolla', 'zanahoria', 'mantequi', 'mermelad', 'compra mer', 'mercado', 'canasta', 'avena', 'gelatina', 'azucar', 'azúcar', 'aceite', 'arroz', 'harina', 'papa', 'carne', 'pollo', 'durazno', 'manzana', 'piña', 'sandia', 'sandía', 'mango', 'uva'], cat: 'B01-DESAYUNOS DE HOTEL' },
  // Suministros hotel
  { kw: ['sabana', 'sábana', 'toalla', 'almohad', 'edredon', 'edredón', 'frazada', 'colchon', 'colchón', 'cortina', 'cojin', 'cojín', 'suministro', 'vajilla', 'plato', 'vaso', 'taza', 'cubierto'], cat: 'B02-SUMINISTROS DE HOTEL' },
  // Servicios básicos
  { kw: ['elapas', 'elfec', 'agua potabl', 'internet', 'entel', 'tigo', 'viva', 'telefono', 'teléfono', 'gas domici'], cat: 'B03-SERVICIOS BÁSICOS' },
  // Insumos limpieza
  { kw: ['shampoo', 'papel higi', 'ambientad', 'detergente', 'cloro', 'escoba', 'trapeador', 'desinfect', 'jabon', 'jabón', 'limpiador', 'bolsa basur', 'guante', 'esponja', 'virutilla'], cat: 'B04-INSUMOS DE LIMPIEZA' },
  // Sueldos
  { kw: ['camarera', 'adelanto', 'sueldo', 'salario', 'jornal', 'pago trabaj', 'brayan', 'romina'], cat: 'B05-SUELDOS Y SALARIOS' },
  // Publicidad
  { kw: ['publicidad', 'facebook', 'meta', 'google', 'instagram', 'marketing', 'anuncio'], cat: 'B07-PUBLICIDAD Y MARKETING' },
  // Gastos varios
  { kw: ['gastos var', 'varios', 'miscelaneo'], cat: 'B08-GASTOS VARIOS' },
  // Refrigerios personal
  { kw: ['refriger', 'snack person', 'almuerzo pers'], cat: 'B10-REFRIGERIOS AL PERSONAL' },
  // Suministros vitrinas
  { kw: ['venta al p', 'vitrina', 'memphis', 'menphis', 'distribuid', 'gaseosa', 'agua mineral', 'chocolat', 'dulce', 'caramelo', 'chicle', 'galeta', 'galleta'], cat: 'B11-SUMINISTROS DE VITRINAS' },
  // Servicios extra
  { kw: ['servicio ext', 'lavander', 'tintorer'], cat: 'B12-SERVICIOS EXTRA DE HOTEL' },
  // Gastos fiscales / Compra factura
  { kw: ['compra de fac', 'factura fiscal', 'impuesto', 'siat', 'nit', 'iva ret'], cat: 'B13-GASTOS FISCALES' },
  { kw: ['compra factur', 'factura'], cat: 'B16-COMPRA DE FACTURA' },
  // Gastos familiares
  { kw: ['familiar', 'familia', 'davalos', 'pobreza', 'compras la'], cat: 'GASTOS FAMILIARES' },
  // Retiros Doña Sonia
  { kw: ['retiro sonia', 'doña sonia', 'sonia'], cat: 'RETIROS DOÑA SONIA' },
];

function inferCategory(ref: string, nombreDestino: string): string {
  // Pad with spaces so word-boundary tricks work on short words like "pan"
  const haystack = (' ' + ref + ' ' + nombreDestino + ' ').toLowerCase();
  for (const { kw, cat } of BNB_CAT_MAP) {
    if (kw.some(k => haystack.includes(k))) return cat;
  }
  return '';
}

function parseBnbWorkbook(ab: ArrayBuffer): BnbRow[] {
  const wb = XLSX.read(ab, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];

  // First pass: collect all debits with their raw amount (signed)
  type RawEntry = { idx: number; ref: string; codigo: string; monto: number; fecha: string; hora: string; adicional: string };
  const allDebits: RawEntry[] = [];
  for (let i = 2; i < raw.length; i++) {
    const r = raw[i];
    if (!r || r.length < 8) continue;
    const debitoRaw = String(r[7] ?? '').replace(/,/g, '').trim();
    const monto = parseFloat(debitoRaw);
    if (!debitoRaw || isNaN(monto)) continue;
    allDebits.push({ idx: i, ref: String(r[4] ?? '').trim(), codigo: String(r[5] ?? '').trim(), monto, fecha: String(r[0] ?? '').trim(), hora: String(r[1] ?? '').trim(), adicional: String(r[10] ?? '') });
  }

  // Detect reversals: same ref, same |amount|, one positive one negative → exclude both
  const reversedCodigos = new Set<string>();
  for (const a of allDebits) {
    if (a.monto < 0) {
      const pair = allDebits.find(b => b.monto === -a.monto && b.ref === a.ref && b.codigo !== a.codigo);
      if (pair) { reversedCodigos.add(a.codigo); reversedCodigos.add(pair.codigo); }
    }
  }

  const rows: BnbRow[] = [];
  for (const entry of allDebits) {
    if (entry.monto <= 0) continue;           // skip negative (reversal side)
    if (reversedCodigos.has(entry.codigo)) continue; // skip reversed pairs
    const { ref, codigo, monto, fecha: fechaRaw, hora: horaRaw, adicional } = entry;
    const nombreMatch = adicional.match(/Nombre[:\s]+([^.]+)/i);
    const nombreDestino = nombreMatch ? nombreMatch[1].trim() : '';
    const cuentaMatch = adicional.match(/Cuenta\s+Destino[:\s]+([0-9]+)/i) ?? adicional.match(/Cuenta[:\s]+([0-9]+)/i);
    const cuentaDestino = cuentaMatch ? cuentaMatch[1].trim() : '';
    // "Dato Adicional: FUGA DE AGUA" — full reference text the user typed
    const datoMatch = adicional.match(/Dato\s+Adicional[:\s]+([^.]+)/i);
    const datoAdicional = datoMatch ? datoMatch[1].trim() : '';
    // Use full text for display and category inference; fall back to truncated ref
    const refDisplay = datoAdicional || ref;
    const category = inferCategory(refDisplay, nombreDestino);
    const [d, m, y] = fechaRaw.split('/');
    const fecha = y && m && d ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : fechaRaw;
    const hora = horaRaw.length >= 5 ? horaRaw.slice(0, 5) : horaRaw;
    rows.push({ fecha, hora, referencia: refDisplay, codigo, monto, cuentaDestino, nombreDestino, category, manualCategory: '', needsReview: !category });
  }
  return rows;
}

const emptyForm = {
  date:        '',
  time:        '',
  description: '',
  amount:      '',
  type:        'ingreso' as TransactionType,
  category:    '',
  caja:        'CAJA MAYOR' as CajaType,
  room_id:     '',
  notes:       '',
};

export default function TransactionsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [,             setBalances]      = useState<Record<CajaType, number>>({ 'CAJA MAYOR': 0, 'CAJA CHICA': 0, 'CUENTA BNB': 0, 'TARJETA': 0 });
  const [loading,      setLoading]      = useState(true);
  // room_id → siaat_number map (from reservations that have wants_invoice + siaat)
  const [siaatMap, setSiaatMap] = useState<Record<string, string>>({});

  const isAdmin = profile?.role === 'admin';
  const isLizz  = profile?.name?.toLowerCase() === 'lizz';
  const canSeeAllTab = isAdmin && !isLizz;
  const [activeTab, setActiveTab] = useState<Tab>('mayor');
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (canSeeAllTab) setActiveTab(t => t === 'mayor' ? 'all' : t);
  }, [canSeeAllTab]);

  // ── Manual "sticky" header (title/tabs/balance) via IntersectionObserver + fixed positioning.
  // CSS position:sticky was fighting with the admin layout's scroll container, so this pins the
  // block with JS instead: a 0-height sentinel just above it tells us when it has scrolled to the
  // top of the page, at which point we switch it to position:fixed with a matching spacer below.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stickyRef   = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [stickyRect, setStickyRect] = useState<{ left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const io = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), { threshold: 0 });
    io.observe(sentinel);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    function measure() {
      if (!stickyRef.current) return;
      const r = stickyRef.current.getBoundingClientRect();
      setStickyRect({ left: r.left, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    if (stickyRef.current) ro.observe(stickyRef.current);
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, [activeTab, isAdmin]);

  // Scroll to today's row whenever tab or data changes
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
  useEffect(() => {
    if (!tableBodyRef.current) return;
    // Find first row whose date matches today
    const rows = tableBodyRef.current.querySelectorAll('tr[data-date]');
    let target: Element | null = null;
    rows.forEach(row => {
      if (!target && row.getAttribute('data-date') === todayStr) target = row;
    });
    if (target) {
      (target as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'center' });
    } else {
      // No today row — scroll to bottom (most recent)
      tableBodyRef.current.lastElementChild?.scrollIntoView({ behavior: 'instant', block: 'end' });
    }
  }, [activeTab, transactions]);

  // filters
  const [filterType,   setFilterType]  = useState<'all' | TransactionType>('all');
  const [filterCaja,   setFilterCaja]  = useState<'all' | CajaType>('all');
  const [filterCat,    setFilterCat]   = useState('all');
  const [filterB03Sub, setFilterB03Sub] = useState('');

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [keepOpen,  setKeepOpen]  = useState(false);
  const [form,      setForm]      = useState({ ...emptyForm });
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [editingTxId,  setEditingTxId]  = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; body: string; onConfirm: () => void }>({
    open: false, title: '', body: '', onConfirm: () => {},
  });

  // Hospedaje room picker
  const [occupiedRooms,  setOccupiedRooms]  = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [paidSoFar,      setPaidSoFar]      = useState(0);

  // Vitrina product picker
  const [showVitrinaPicker,    setShowVitrinaPicker]    = useState(false);
  const [vitrinaSaleProductId, setVitrinaSaleProductId] = useState<string | null>(null);
  const [vitrinaSellQty,       setVitrinaSellQty]       = useState(1);

  // Traspaso de caja
  const TRASPASO_CAJAS = ['CAJA MAYOR', 'CAJA CHICA'] as const;
  type TraspasoType = 'CAJA MAYOR' | 'CAJA CHICA';
  const TRASPASO_AUTORIZA = ['Don Guido', 'Doña Sonia', 'Don Mauri'] as const;
  const [isTraspaso,      setIsTraspaso]      = useState(false);
  const [traspasoFrom,    setTraspasoFrom]    = useState<TraspasoType>('CAJA MAYOR');
  const [traspasoTo,      setTraspasoTo]      = useState<TraspasoType>('CAJA CHICA');
  const [traspasoAutoriza,setTraspasoAutoriza]= useState<string>('Don Guido');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-${new Date(year, month + 1, 0).getDate()}`;

    const [{ data }, { data: reservData }] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, profiles(name)')
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('reservations')
        .select('id, siaat_number')
        .eq('wants_invoice', true)
        .not('siaat_number', 'is', null),
    ]);

    setTransactions(data ?? []);

    // Build reservation_id → siaat_number map
    const map: Record<string, string> = {};
    for (const r of reservData ?? []) {
      if (r.id && r.siaat_number) {
        map[r.id] = r.siaat_number;
      }
    }
    setSiaatMap(map);

    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time sync — use ref so channel never needs to re-subscribe when month changes
  const fetchDataRef = useRef(fetchData);
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    const channel = supabase
      .channel('transactions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => { fetchDataRef.current(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  // Fetch occupied/reserved rooms when HOSPEDAJE is selected
  useEffect(() => {
    if (form.category !== 'H01-HOSPEDAJE') { setOccupiedRooms([]); setSelectedRoomId(''); return; }
    const todayStr = new Date().toISOString().split('T')[0];
    supabase.from('reservations')
      .select('id, room_id, guest_name, check_in, check_out, price_per_night, adelanto, num_guests, status')
      .in('status', ['ocupado', 'reserva'])
      .gte('check_out', todayStr)
      .order('check_in')
      .then(({ data }) => setOccupiedRooms(data ?? []));
  }, [form.category]);

  // All-time caja running balances (desde apertura del hotel)
  useEffect(() => {
    async function fetchBalances() {
      const { data } = await supabase
        .from('transactions')
        .select('type, amount, caja')
        .gte('date', '2024-01-01');
      if (!data) return;
      const totals: Record<CajaType, number> = { 'CAJA MAYOR': 0, 'CAJA CHICA': 0, 'CUENTA BNB': 0, 'TARJETA': 0 };
      for (const t of data) {
        if (!(t.caja in totals)) continue;
        totals[t.caja as CajaType] += t.type === 'ingreso' ? t.amount : -t.amount;
      }
      setBalances(totals);
    }
    fetchBalances();
  }, []);

  // ── computed ──
  const isShiftRef = (t: Transaction) =>
    t.description === 'INICIO DE CAJA' || t.description === 'FINAL DE CAJA';

  const { filtered, totalIncome, totalExpense, balance, monthBalances } = useMemo(() => {
    const filt = transactions.filter(t => {
      if (activeTab === 'all'   && isShiftRef(t))                                                   return false;
      if (activeTab === 'mayor' && t.caja === 'CAJA CHICA')                                        return false;
      if (activeTab === 'chica' && t.caja !== 'CAJA CHICA')                                        return false;
      if (activeTab === 'bnb'   && t.caja !== 'CUENTA BNB')                                        return false;
      if (activeTab === 'bnb_eg' && (t.caja !== 'CUENTA BNB' || t.type !== 'egreso' || t.category === 'B05-SUELDOS Y SALARIOS')) return false;
      if (activeTab === 'bnb_personal' && (t.caja !== 'CUENTA BNB' || t.type !== 'egreso' || t.category !== 'B05-SUELDOS Y SALARIOS')) return false;
      if (activeTab !== 'bnb' && activeTab !== 'bnb_eg' && t.caja === 'CUENTA BNB' && t.type === 'egreso') return false;
      if (!isAdmin && t.category === 'SALDO QR')                                                    return false;
      if (filterType !== 'all' && t.type !== filterType)                                            return false;
      if (activeTab === 'all' && filterCaja !== 'all' && t.caja !== filterCaja)      return false;
      if (filterCat  !== 'all' && t.category !== filterCat)                          return false;
      if (filterCat === 'B03-SERVICIOS BÁSICOS' && filterB03Sub && !t.description?.includes(filterB03Sub)) return false;
      return true;
    });

    const filtCash = (activeTab === 'mayor'
      ? filt.filter(t => t.caja === 'CAJA MAYOR')
      : filt
    ).filter(t => !isShiftRef(t));

    const excTraspaso = activeTab === 'all';
    const inc  = filtCash.filter(t => t.type === 'ingreso' && (!excTraspaso || t.category !== 'TRASPASO DE CAJA')).reduce((s, t) => s + t.amount, 0);
    const exp  = filtCash.filter(t => t.type === 'egreso'  && (!excTraspaso || t.category !== 'TRASPASO DE CAJA')).reduce((s, t) => s + t.amount, 0);

    const mb = CAJAS.reduce((acc, caja) => {
      const cajaTxs = transactions.filter(t => t.caja === caja && !isShiftRef(t));
      acc[caja] = cajaTxs.reduce((s, t) => s + (t.type === 'ingreso' ? t.amount : -t.amount), 0);
      return acc;
    }, {} as Record<CajaType, number>);

    return { filtered: filt, filteredCash: filtCash, totalIncome: inc, totalExpense: exp, balance: inc - exp, monthBalances: mb };
  }, [transactions, activeTab, isAdmin, filterType, filterCaja, filterCat, filterB03Sub]); // eslint-disable-line

  // Running balance map — memoized so it doesn't recompute on unrelated state changes
  const balanceMap = useMemo(() => {
    const sortedAsc = [...filtered].sort((a, b) => {
      const da = a.date + (a.time ?? '');
      const db = b.date + (b.time ?? '');
      return da < db ? -1 : da > db ? 1 : 0;
    });
    let run = 0;
    const bm: Record<string, number> = {};
    for (const t of sortedAsc) {
      if (!isShiftRef(t) && (activeTab === 'bnb' || activeTab === 'bnb_eg' || activeTab === 'bnb_personal' || (t.caja !== 'CUENTA BNB' && t.caja !== 'TARJETA'))) {
        run += t.type === 'ingreso' ? t.amount : -t.amount;
      }
      bm[t.id] = run;
    }
    return bm;
  }, [filtered, activeTab]); // eslint-disable-line

  const categories = form.type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // ── BNB import handlers ──
  async function handleBnbFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ab = await file.arrayBuffer();
    try {
      const rows = parseBnbWorkbook(ab);
      if (!rows.length) { setBnbError('No se encontraron débitos en el archivo.'); return; }
      // Fetch existing BNB transactions to detect duplicates
      const { data: existing } = await supabase
        .from('transactions')
        .select('notes')
        .eq('caja', 'CUENTA BNB')
        .eq('type', 'egreso');
      const existingCodes = new Set((existing ?? []).map(t => t.notes ?? '').filter(Boolean));
      const filtered = rows.filter(r => !existingCodes.has(r.codigo));
      if (!filtered.length) { setBnbError('Todos los movimientos de este extracto ya están registrados.'); return; }
      setBnbRows(filtered);
      setBnbError('');
      setBnbModalOpen(true);
    } catch {
      setBnbError('Error al leer el archivo. Asegúrate de subir el .xls del BNB.');
    }
  }

  async function handleBnbImport() {
    const unresolved = bnbRows.filter(r => r.needsReview && !r.manualCategory);
    if (unresolved.length) {
      setBnbError(`Faltan ${unresolved.length} categoría(s) marcadas en rojo.`);
      return;
    }
    setBnbImporting(true); setBnbError('');
    const payload = bnbRows.map(r => ({
      date:           r.fecha,
      time:           r.hora || null,
      description:    r.referencia + (r.nombreDestino ? ` — ${r.nombreDestino}` : ''),
      amount:         r.monto,
      type:           'egreso' as const,
      category:       r.manualCategory || r.category,
      caja:           'CUENTA BNB' as CajaType,
      notes:          r.codigo,
      responsible_id: profile?.id ?? null,
    }));
    const { error } = await supabase.from('transactions').insert(payload);
    setBnbImporting(false);
    if (error) { setBnbError('Error al importar: ' + error.message); return; }
    logActivity(profile?.id, profile?.name, 'Importación BNB', 'transaction', undefined, `${payload.length} egresos importados`);
    setBnbModalOpen(false);
    setBnbRows([]);
    fetchData();
  }

  // ── BNB import state ──
  const [bnbRows,        setBnbRows]        = useState<BnbRow[]>([]);
  const [bnbModalOpen,   setBnbModalOpen]   = useState(false);
  const [bnbImporting,   setBnbImporting]   = useState(false);
  const [bnbError,       setBnbError]       = useState('');
  const bnbFileRef = useRef<HTMLInputElement>(null);

  // ── close modal (always resets keepOpen) ──
  function closeModal() { setModalOpen(false); setKeepOpen(false); }

  // ── open modal (new) ──
  function openNew() {
    const now = new Date();
    setEditingTxId(null);
    setForm({
      ...emptyForm,
      date: now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' }),
      time: now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false }),
      category: '',
    });
    setFormError('');
    setSelectedRoomId('');
    setPaidSoFar(0);
    setOccupiedRooms([]);
    setVitrinaSaleProductId(null);
    setVitrinaSellQty(1);
    setIsTraspaso(false);
    setTraspasoFrom('CAJA MAYOR');
    setTraspasoTo('CAJA CHICA');
    setTraspasoAutoriza('Don Guido');
    setModalOpen(true);
  }

  // ── open modal (edit) ──
  function openEdit(t: Transaction) {
    setEditingTxId(t.id);
    setForm({
      date:        t.date,
      time:        t.time ? t.time.slice(0,5) : '',
      description: t.description || '',
      amount:      String(t.amount),
      type:        t.type,
      category:    t.category,
      caja:        t.caja as CajaType,
      room_id:     t.room_id || '',
      notes:       t.notes || '',
    });
    setFormError('');
    setSelectedRoomId(t.room_id || '');
    setPaidSoFar(0);
    setOccupiedRooms([]);
    setVitrinaSaleProductId(null);
    setVitrinaSellQty(1);
    setModalOpen(true);
  }

  // ── save ──
  async function handleSave() {
    // ── Traspaso de caja ──
    if (isTraspaso) {
      if (!form.amount || parseFloat(form.amount) <= 0) { setFormError('Ingresa un monto válido.'); return; }
      if (traspasoFrom === traspasoTo) { setFormError('Origen y destino no pueden ser iguales.'); return; }
      setSaving(true); setFormError('');
      const amt = parseFloat(form.amount);
      const dateVal = form.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
      const autDesc = traspasoAutoriza ? ` Aut. ${traspasoAutoriza}` : '';
      const descFrom = form.description?.trim()
        ? `${form.description} - ${CAJA_LABEL[traspasoTo]}${autDesc}`
        : `Traspaso a ${CAJA_LABEL[traspasoTo]}${autDesc}`;
      const descTo = form.description?.trim()
        ? `${form.description} - desde ${CAJA_LABEL[traspasoFrom]}${autDesc}`
        : `Traspaso desde ${CAJA_LABEL[traspasoFrom]}${autDesc}`;
      const { error } = await supabase.from('transactions').insert([
        { date: dateVal, time: form.time||null, type: 'egreso',  amount: amt, category: 'TRASPASO DE CAJA', caja: traspasoFrom, description: descFrom, responsible_id: profile?.id ?? null },
        { date: dateVal, time: form.time||null, type: 'ingreso', amount: amt, category: 'TRASPASO DE CAJA', caja: traspasoTo,   description: descTo,   responsible_id: profile?.id ?? null },
      ]);
      setSaving(false);
      if (error) { setFormError('Error: ' + error.message); return; }
      await logActivity(profile?.id, profile?.name, 'Traspaso de caja', 'transaction', undefined, `Bs. ${amt} de ${CAJA_LABEL[traspasoFrom]} → ${CAJA_LABEL[traspasoTo]}`);
      if (keepOpen) {
        setForm(f => ({ ...emptyForm, date: f.date, time: f.time, caja: f.caja, type: f.type }));
        setFormError('');
      } else {
        closeModal();
      }
      fetchData();
      return;
    }

    if (!form.amount || parseFloat(form.amount) <= 0) { setFormError('Ingresa un monto válido.'); return; }
    if (!form.category) { setFormError('Selecciona una categoría.'); return; }

    setSaving(true);
    setFormError('');

    const payload = {
      date:        form.date || new Date().toISOString().split('T')[0],
      time:        form.time || null,
      description: form.description || null,
      amount:      parseFloat(form.amount),
      type:        form.type,
      category:    form.category,
      caja:        form.caja,
      room_id:     form.room_id || null,
      notes:       form.notes || null,
    };

    let error;
    if (editingTxId) {
      ({ error } = await supabase.from('transactions').update(payload).eq('id', editingTxId));
    } else {
      ({ error } = await supabase.from('transactions').insert({ ...payload, responsible_id: profile?.id ?? null }));
    }

    setSaving(false);
    if (error) { setFormError('Error: ' + error.message); return; }

    // If vitrina sale (new only), decrement product stock
    if (!editingTxId && form.category === 'H03-VENTA DE VITRINAS' && vitrinaSaleProductId) {
      const { data: prod } = await supabase
        .from('vitrina_products').select('quantity').eq('id', vitrinaSaleProductId).single();
      if (prod) {
        await supabase.from('vitrina_products')
          .update({ quantity: Math.max(0, prod.quantity - vitrinaSellQty), updated_at: new Date().toISOString() })
          .eq('id', vitrinaSaleProductId);
      }
      setVitrinaSaleProductId(null);
      setVitrinaSellQty(1);
    }

    const logAction = editingTxId
      ? (form.type === 'ingreso' ? 'Ingreso editado' : 'Egreso editado')
      : (form.type === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado');
    logActivity(profile?.id, profile?.name, logAction, 'transaction', editingTxId ?? undefined, `${form.category} — Bs. ${form.amount} (${form.caja})`);
    setEditingTxId(null);
    if (keepOpen && !editingTxId) {
      // Reset form but keep date, time, caja and type so the user can add another quickly
      setForm(f => ({ ...emptyForm, date: f.date, time: f.time, caja: f.caja, type: f.type }));
      setFormError('');
      setSelectedRoomId('');
      setPaidSoFar(0);
      setOccupiedRooms([]);
      setVitrinaSaleProductId(null);
      setVitrinaSellQty(1);
    } else {
      closeModal();
    }
    fetchData();
    // refresh running balances
    const { data: allTx } = await supabase.from('transactions').select('type, amount, caja');
    if (allTx) {
      const totals: Record<CajaType, number> = { 'CAJA MAYOR': 0, 'CAJA CHICA': 0, 'CUENTA BNB': 0, 'TARJETA': 0 };
      for (const t of allTx) {
        if (!(t.caja in totals)) continue;
        totals[t.caja as CajaType] += t.type === 'ingreso' ? t.amount : -t.amount;
      }
      setBalances(totals);
    }
  }

  // ── month nav ──
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  /** 1.234,56 — miles con punto, decimales con coma */
  const fmt = (n: number): string => {
    const [int, dec] = Math.abs(n).toFixed(2).split('.');
    return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };
  const fmtAmount = (n: number) => `Bs. ${fmt(n)}`;

  return (
    <div className="space-y-5">
      {/* Sentinel: 0-height marker; when it scrolls above the viewport, the header block "sticks" */}
      <div ref={sentinelRef} />
      {/* Spacer to preserve layout height while the header block is position:fixed */}
      {isStuck && stickyRect && <div style={{ height: stickyRect.height }} />}

      {/* ── Header block: title/nav, tabs, balance — pinned via JS once scrolled to top ── */}
      <div
        ref={stickyRef}
        style={isStuck && stickyRect ? { position: 'fixed', top: 0, left: stickyRect.left, width: stickyRect.width, zIndex: 30 } : undefined}
        className="bg-gray-50 pb-3 space-y-3"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base sm:text-xl font-bold text-gray-900 shrink-0">Ingresos & Egresos</h1>
          <div className="flex items-center gap-1 sm:gap-2">
            <button data-testid="btn-prev-month" onClick={prevMonth} className="p-1.5 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600">‹</button>
            <span className="text-xs sm:text-sm font-semibold text-gray-700 w-24 sm:w-36 text-center">{MONTH_NAMES[month]} {year}</span>
            <button data-testid="btn-next-month" onClick={nextMonth} className="p-1.5 sm:p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600">›</button>
            <button
              data-testid="btn-add-transaction"
              onClick={openNew}
              className="flex items-center gap-1 ml-1 sm:ml-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-colors"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Nuevo</span>
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center border-b-2 border-gray-200 overflow-x-auto scrollbar-none">
          {([
            ...(canSeeAllTab ? [{ id: 'all' as Tab, emoji: '📊', label: `${MONTH_NAMES[month]} ${year}` }] : []),
            { id: 'mayor' as Tab, emoji: '💵', label: 'Caja Mayor' },
            { id: 'chica' as Tab, emoji: '🪙', label: 'Caja Chica' },
            { id: 'bnb_eg' as Tab, emoji: '💳', label: 'Egresos BNB' },
            ...(isAdmin ? [
              { id: 'bnb' as Tab, emoji: '🏦', label: 'BNB Mauri' },
              { id: 'bnb_personal' as Tab, emoji: '👥', label: 'Personal BNB' },
            ] : []),
          ]).map(({ id, emoji, label }) => (
            <button
              key={id}
              onClick={() => { setActiveTab(id); setFilterCaja('all'); }}
              className={`flex items-center gap-1 sm:gap-1.5 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold border-b-2 -mb-0.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === id
                  ? 'border-amber-400 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* Summary cards — only on "Todos" tab */}
        {activeTab === 'all' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-green-500" />
                <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Ingresos</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{fmtAmount(totalIncome)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown size={16} className="text-red-500" />
                <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Egresos</span>
              </div>
              <p className="text-2xl font-bold text-red-500">{fmtAmount(totalExpense)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={16} className="text-amber-500" />
                <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Balance</span>
              </div>
              <p className={`text-2xl font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
                {fmtAmount(balance)}
              </p>
            </div>
          </div>
        )}

        {/* Per-caja monthly balances — only on "Todos" tab */}
        {activeTab === 'all' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CAJAS.map(caja => {
              const bal = monthBalances[caja];
              const isPos = bal >= 0;
              const emoji = caja === 'CAJA MAYOR' ? '💵' : caja === 'CAJA CHICA' ? '🪙' : caja === 'CUENTA BNB' ? '📱' : '💳';
              return (
                <div key={caja} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{emoji}</span>
                    <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">{CAJA_LABEL[caja]}</span>
                  </div>
                  <p className={`text-xl font-bold ${isPos ? 'text-gray-900' : 'text-red-500'}`}>
                    {fmtAmount(bal)}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">Balance del mes</p>
                </div>
              );
            })}
          </div>
        )}

        {/* BNB Import button — only on BNB Mauri tab */}
        {activeTab === 'bnb' && (
          <div className="flex justify-end">
            <input ref={bnbFileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleBnbFile} />
            {bnbError && <p className="text-red-500 text-xs mr-3 self-center">{bnbError}</p>}
            <button
              onClick={() => { setBnbError(''); bnbFileRef.current?.click(); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow transition-colors"
            >
              <Upload size={15} />
              Importar Excel QR
            </button>
          </div>
        )}

        {/* Balance card — all tabs */}
        <div className="flex justify-center">
          <div className="bg-white rounded-2xl px-4 sm:px-12 py-4 sm:py-5 border border-gray-100 shadow-sm text-center w-full max-w-md">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
              {activeTab === 'bnb' ? `BNB Mauri · ${MONTH_NAMES[month]} ${year}` : activeTab === 'bnb_eg' ? `Egresos BNB · ${MONTH_NAMES[month]} ${year}` : activeTab === 'bnb_personal' ? `Personal BNB · ${MONTH_NAMES[month]} ${year}` : `Balance ${MONTH_NAMES[month]} ${year}`}
            </p>
            <p className={`text-3xl sm:text-5xl font-bold tracking-tight ${balance >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
              {balance < 0 && '−'}Bs. {fmt(Math.abs(balance))}
            </p>
          </div>
        </div>
      </div>

      {/* Filters + Table — hidden on 'all' (resumen) tab */}
      {activeTab !== 'all' && <>
      <div className="flex flex-wrap gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500 font-medium">Filtros:</span>
        </div>
        <CustomSelect size="sm" value={filterType} onChange={v => setFilterType(v as any)}
          options={[{ value:'all', label:'Todos' },{ value:'ingreso', label:'Ingresos' },{ value:'egreso', label:'Egresos' }]}
          placeholder="Todos" />
        <CustomSelect size="sm" value={filterCaja} onChange={v => setFilterCaja(v as any)}
          options={[{ value:'all', label:'Todas las cajas' }, ...CAJAS.map(c => ({ value: c, label: CAJA_LABEL[c] }))]}
          placeholder="Todas las cajas" />
        <CustomSelect size="sm" value={filterCat} onChange={v => { setFilterCat(v); setFilterB03Sub(''); }}
          options={[
            { value:'all', label:'Todas las categorías' },
            ...INCOME_CATEGORIES.map(c => ({ value: c, label: `↑ ${c}` })),
            ...EXPENSE_CATEGORIES.map(c => ({ value: c, label: `↓ ${c}` })),
          ]}
          placeholder="Todas las categorías" />
      </div>

      {/* B03 Subcategory filter */}
      {filterCat === 'B03-SERVICIOS BÁSICOS' && (
        <div className="flex flex-wrap gap-2 bg-white rounded-xl px-4 py-3 border border-blue-100 shadow-sm">
          <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider self-center mr-1">Servicio:</span>
          {['Wifi salon','Wifi recepcion','Wifi Mauri','Gas','Agua Doméstica','Agua Comercial','Luz Domiciliar 1','Luz Domiciliar 2','Luz Domiciliar 3','Luz Comercial'].map(svc => {
            const count = filtered.filter(t => t.description?.includes(svc)).length;
            const total = filtered.filter(t => t.description?.includes(svc)).reduce((s,t) => s + t.amount, 0);
            const active = filterB03Sub === svc;
            return (
              <button key={svc} type="button"
                onClick={() => setFilterB03Sub(active ? '' : svc)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-blue-600 border-blue-700 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                }`}>
                {svc}
                {count > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1 ${active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {count} · Bs.{total}
                  </span>
                )}
              </button>
            );
          })}
          {filterB03Sub && (
            <button onClick={() => setFilterB03Sub('')}
              className="text-xs text-gray-400 hover:text-gray-600 underline self-center ml-1">
              Ver todo
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {(() => {
        const thCls = 'px-3 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider whitespace-nowrap border-r border-gray-200 last:border-r-0';
        const tdCls = 'px-3 py-2.5 whitespace-nowrap border-r border-gray-200 last:border-r-0';

        return (
          <div className="bg-white rounded-xl border border-gray-300 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                <DollarSign size={32} className="mb-2 opacity-30" />
                <p className="text-sm">Sin movimientos para este período</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-gray-50 border-b-2 border-gray-300">
                    <tr>
                      <th className={`${thCls} text-left`}>Fecha</th>
                      <th className={`${thCls} text-left`}>Responsable</th>
                      <th className={`${thCls} text-right`}>Ingreso</th>
                      <th className={`${thCls} text-right`}>Egreso</th>
                      <th className={`${thCls} text-right`}>Saldo</th>
                      {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && <th className={`${thCls} text-right`}>Ingreso QR/Tarjeta</th>}
                      {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && <th className={`${thCls} text-center`}>Tarj/QR</th>}
                      {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && <th className={`${thCls} text-left`}>Habitación</th>}
                      {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && <th className={`${thCls} text-left`}>N° Factura</th>}
                      <th className={`${thCls} text-left w-full`}>Descripción</th>
                      <th className="px-2 py-3 border-r-0" />
                    </tr>
                  </thead>
                  <tbody ref={tableBodyRef} className="divide-y divide-gray-200">
                    {filtered.map(t => {
                      const saldo = balanceMap[t.id] ?? 0;
                      return (
                        <tr key={t.id} data-date={t.date} className="hover:bg-amber-50/40 transition-colors group">
                          {/* Fecha */}
                          <td className={`${tdCls} text-gray-600 text-xs`}>
                            <div className="font-medium">{t.date}</div>
                            {t.time && <div className="text-gray-400">{t.time.slice(0,5)}</div>}
                          </td>
                          {/* Responsable */}
                          <td className={`${tdCls} text-gray-600 text-xs`}>
                            {(t.profiles as any)?.name ?? '—'}
                          </td>
                          {/* Ingreso */}
                          <td className={`${tdCls} text-right font-semibold ${activeTab === 'bnb' ? 'text-indigo-600' : 'text-green-600'}`}>
                            {!isShiftRef(t) && t.type === 'ingreso' && (activeTab === 'bnb' || activeTab === 'bnb_eg' || activeTab === 'bnb_personal' || (t.caja !== 'CUENTA BNB' && t.caja !== 'TARJETA'))
                              ? `Bs. ${fmt(t.amount)}`
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          {/* Egreso */}
                          <td className={`${tdCls} text-right font-semibold text-red-500`}>
                            {!isShiftRef(t) && t.type === 'egreso' && (activeTab === 'bnb' || activeTab === 'bnb_eg' || activeTab === 'bnb_personal' || (t.caja !== 'CUENTA BNB' && t.caja !== 'TARJETA'))
                              ? `Bs. ${fmt(t.amount)}`
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          {/* Saldo: shift-ref rows show their own amount as reference; others show running balance */}
                          <td className={`${tdCls} text-right font-bold text-xs`}>
                            {isShiftRef(t)
                              ? <span className="text-red-400 italic">Bs. {fmt(t.amount)}</span>
                              : (t.caja === 'CUENTA BNB' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal') || t.caja === 'TARJETA'
                                ? <span className="text-gray-300">—</span>
                                : <span className={saldo >= 0 ? 'text-gray-800' : 'text-red-600'}>{saldo >= 0 ? '' : '−'}Bs. {fmt(Math.abs(saldo))}</span>
                            }
                          </td>
                          {/* Ingreso QR/Tarjeta (mayor + all tabs only) */}
                          {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && (
                            <td className={`${tdCls} text-right font-semibold text-indigo-600`}>
                              {(t.caja === 'CUENTA BNB' || t.caja === 'TARJETA') && t.type === 'ingreso'
                                ? `Bs. ${fmt(t.amount)}`
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                          )}
                          {/* Tarj/QR label (mayor + all tabs only) */}
                          {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && (
                            <td className={`${tdCls} text-center`}>
                              {t.caja === 'CUENTA BNB'
                                ? <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">QR</span>
                                : t.caja === 'TARJETA'
                                ? <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded">Tarj</span>
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                          )}
                          {/* Habitación (mayor + all tabs only) */}
                          {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && (
                            <td className={`${tdCls}`}>
                              {t.room_id
                                ? <span className="font-semibold text-gray-800 bg-gray-100 px-2 py-0.5 rounded text-xs">{t.room_id}</span>
                                : <span className="text-gray-300 text-xs">—</span>
                              }
                            </td>
                          )}
                          {/* N° Factura (mayor + all tabs only) */}
                          {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && (
                            <td className={`${tdCls}`}>
                              {t.reservation_id && siaatMap[t.reservation_id]
                                ? <span className="font-mono text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">{siaatMap[t.reservation_id]}</span>
                                : <span className="text-gray-300 text-xs">—</span>
                              }
                            </td>
                          )}
                          {/* Descripción — wide */}
                          <td className="px-3 py-2.5 text-gray-700 text-xs min-w-[260px] max-w-xs border-r border-gray-200">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="truncate">{t.description || <span className="text-gray-300">—</span>}</span>
                              {t.date && t.room_id && (
                                <button
                                  onClick={() => {
                                    const [y, m] = t.date.split('-').map(Number);
                                    navigate('/admin/calendar', { state: { year: y, month: m - 1, roomId: t.room_id ?? undefined, date: t.date } });
                                  }}
                                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-amber-500 hover:text-amber-700 hover:bg-amber-50 transition-all"
                                  title={`Ver ${t.date} en calendario`}
                                >
                                  <CalendarDays size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                          {/* Actions */}
                          <td className="px-2 py-2.5 min-w-[72px]">
                            <div className="flex items-center gap-1">
                              {!isShiftRef(t) && <button
                                onClick={() => openEdit(t)}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
                                title="Editar"
                              >
                                <Pencil size={13} />
                              </button>}
                              {/* Anyone can delete non-shift entries */}
                              {!isShiftRef(t) && (
                                <button
                                  onClick={() => setConfirmDialog({
                                    open: true,
                                    title: 'Eliminar movimiento',
                                    body: `¿Eliminar "${t.description || t.category}" de Bs. ${fmt(t.amount)}? Esta acción no se puede deshacer.`,
                                    onConfirm: async () => {
                                      const { error: delErr } = await supabase.from('transactions').delete().eq('id', t.id);
                                      if (delErr) {
                                        setConfirmDialog(d => ({ ...d, open: false }));
                                        alert('Error al eliminar: ' + delErr.message);
                                        return;
                                      }
                                      logActivity(profile?.id, profile?.name, t.type === 'ingreso' ? 'Ingreso eliminado' : 'Egreso eliminado', 'transaction', t.id, `${t.category} — Bs. ${t.amount} (${t.caja})`);
                                      setConfirmDialog(d => ({ ...d, open: false }));
                                      fetchData();
                                    },
                                  })}
                                  className="p-1.5 rounded-lg text-red-300 hover:text-red-600 hover:bg-red-50 transition-all"
                                  title="Eliminar"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Footer totals */}
                  <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan={2} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-gray-200">
                        Total ({filtered.length})
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-green-600 text-sm border-r border-gray-200">
                        Bs. {fmt(totalIncome)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-red-500 text-sm border-r border-gray-200">
                        Bs. {fmt(totalExpense)}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-bold text-sm border-r border-gray-200 ${balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>
                        {balance >= 0 ? '' : '−'}Bs. {fmt(Math.abs(balance))}
                      </td>
                      {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && isAdmin && (
                        <td className="px-3 py-2.5 text-right font-bold text-indigo-600 text-sm border-r border-gray-200">
                          Bs. {fmt(filtered.filter(t => (t.caja === 'CUENTA BNB' || t.caja === 'TARJETA') && t.type === 'ingreso').reduce((s, t) => s + t.amount, 0))}
                        </td>
                      )}
                      {activeTab !== 'chica' && activeTab !== 'bnb' && activeTab !== 'bnb_eg' && activeTab !== 'bnb_personal' && isAdmin && <td className="border-r border-gray-200" />}
                      <td colSpan={activeTab === 'chica' || activeTab === 'bnb' || activeTab === 'bnb_eg' || activeTab === 'bnb_personal' ? 2 : 4} className="border-r border-gray-200" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}
      </>}

      {/* ── Modal ── */}
      {modalOpen && (
        <div data-testid="transaction-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{editingTxId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h3>
              <button onClick={() => closeModal()} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Type toggle */}
              <div className="flex rounded-lg border border-gray-200 p-1 gap-1">
                {(['ingreso', 'egreso'] as TransactionType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => { setIsTraspaso(false); setForm(f => ({ ...f, type: t, category: '' })); }}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors capitalize ${
                      !isTraspaso && form.type === t
                        ? t === 'ingreso'
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                  </button>
                ))}
                {!editingTxId && (
                  <button
                    onClick={() => setIsTraspaso(true)}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
                      isTraspaso ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    ⇄ Traspaso
                  </button>
                )}
              </div>

              {/* Traspaso form */}
              {isTraspaso && (
                <div className="space-y-3 bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-xs text-blue-700 font-medium">Mueve dinero entre cajas. Se crea un egreso en origen y un ingreso en destino automáticamente.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">De (origen)</label>
                      <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        value={traspasoFrom} onChange={e => setTraspasoFrom(e.target.value as TraspasoType)}>
                        {TRASPASO_CAJAS.map(c => <option key={c} value={c}>{CAJA_LABEL[c]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">A (destino)</label>
                      <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        value={traspasoTo} onChange={e => setTraspasoTo(e.target.value as TraspasoType)}>
                        {TRASPASO_CAJAS.map(c => <option key={c} value={c}>{CAJA_LABEL[c]}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Autorizó</label>
                    <div className="flex gap-2">
                      {TRASPASO_AUTORIZA.map(name => (
                        <button key={name} type="button"
                          onClick={() => setTraspasoAutoriza(name)}
                          className={`flex-1 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                            traspasoAutoriza === name
                              ? 'bg-blue-500 border-blue-500 text-white'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Date + time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                  <DatePicker value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} placeholder="Seleccionar fecha" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <TimePicker value={form.time} onChange={v => setForm(f => ({ ...f, time: v }))} />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Bs.) *</label>
                <input data-testid="input-amount" type="number" min={0} step={0.01} value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="0.00"
                />
              </div>

              {/* Category — hidden in traspaso mode */}
              {!isTraspaso && <div data-testid="section-category">
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                <CustomSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
                  options={categories.map(c => ({ value: c, label: c }))}
                  placeholder="— Seleccionar —" />
              </div>}

              {/* Servicios Básicos sub-selector */}
              {form.category === 'B03-SERVICIOS BÁSICOS' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Servicio *</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Wifi salon','Wifi recepcion','Wifi Mauri',
                      'Gas','Agua Doméstica','Agua Comercial',
                      'Luz Domiciliar 1','Luz Domiciliar 2','Luz Domiciliar 3','Luz Comercial',
                    ].map(svc => (
                      <button key={svc} type="button"
                        onClick={() => setForm(f => ({ ...f, description: svc }))}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                          form.description === svc
                            ? 'bg-red-500 border-red-600 text-white'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
                        }`}>
                        {svc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Room picker for HOSPEDAJE */}
              {form.category === 'H01-HOSPEDAJE' && occupiedRooms.length > 0 && (() => {
                const sel = occupiedRooms.find(r => r.room_id === selectedRoomId);
                const nights = sel ? Math.max(1, Math.round(
                  (new Date(sel.check_out + 'T00:00:00').getTime() - new Date(sel.check_in + 'T00:00:00').getTime()) / 86400000
                )) : 0;
                const total = sel ? (sel.price_per_night ?? 0) * nights : 0;
                const saldo = Math.max(0, total - paidSoFar);
                return (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Habitación
                    </label>
                    <CustomSelect
                      value={selectedRoomId}
                      onChange={async v => {
                        setSelectedRoomId(v);
                        setPaidSoFar(0);
                        const r = occupiedRooms.find(x => x.room_id === v);
                        if (r) {
                          const { data: txs } = await supabase
                            .from('transactions')
                            .select('amount')
                            .eq('room_id', r.room_id)
                            .eq('type', 'ingreso')
                            .eq('category', 'H01-HOSPEDAJE');
                          const paid = (txs ?? []).reduce((s: number, t: any) => s + t.amount, 0);
                          setPaidSoFar(paid);
                          const n = Math.max(1, Math.round((new Date(r.check_out+'T00:00:00').getTime()-new Date(r.check_in+'T00:00:00').getTime())/86400000));
                          const t = (r.price_per_night ?? 0) * n;
                          const s = Math.max(0, t - paid);
                          setForm(f => ({ ...f, amount: s.toFixed(2), description: `${r.room_id} — ${r.guest_name}`, room_id: r.room_id }));
                        }
                      }}
                      options={occupiedRooms.map(r => ({
                        value: r.room_id,
                        label: `${r.room_id} — ${r.guest_name}${r.status === 'reserva' ? ' 📅' : ''}`,
                      }))}
                      placeholder="— Seleccionar habitación —"
                    />
                    {sel && (
                      <div className="border rounded-xl px-4 py-3 text-xs space-y-1 bg-blue-50 border-blue-100">
                        <div className="flex justify-between text-gray-600">
                          <span>📅 {sel.check_in} → {sel.check_out}</span>
                          <span className="font-semibold">{nights} noche{nights !== 1 ? 's' : ''}</span>
                        </div>
                        {sel.price_per_night > 0 && <>
                          <div className="flex justify-between text-gray-600">
                            <span>Precio / noche</span><span>Bs. {fmt(sel.price_per_night)}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-gray-800 border-t border-blue-200 pt-1">
                            <span>Total</span><span>Bs. {fmt(total)}</span>
                          </div>
                          {paidSoFar > 0 && (
                            <div className="flex justify-between text-green-700">
                              <span>Ya pagado</span><span>− Bs. {fmt(paidSoFar)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-base border-t border-blue-200 pt-1 text-blue-700">
                            <span>Saldo pendiente</span><span>Bs. {fmt(saldo)}</span>
                          </div>
                        </>}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Vitrina product picker button */}
              {form.category === 'H03-VENTA DE VITRINAS' && form.type === 'ingreso' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Producto vendido</label>
                  <button
                    type="button"
                    onClick={() => setShowVitrinaPicker(true)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-amber-300 rounded-xl py-3 text-amber-700 hover:bg-amber-50 font-semibold text-sm transition-colors"
                  >
                    🛒 Seleccionar producto de vitrina
                  </button>
                  {form.description && vitrinaSaleProductId && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-800 flex items-center justify-between">
                      <span>✓ {form.description}</span>
                      <span className="font-bold">Bs. {form.amount}</span>
                    </div>
                  )}
                </div>
              )}


              {/* Caja — hidden in traspaso mode (from/to already chosen above) */}
              {!isTraspaso && <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Caja</label>
                <CustomSelect value={form.caja} onChange={v => setForm(f => ({ ...f, caja: v as CajaType }))}
                  options={CAJAS.map(c => ({ value: c, label: c }))}
                  placeholder="— Seleccionar —" />
                {isAdmin && form.type === 'egreso' && form.category === 'B05-SUELDOS Y SALARIOS' && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, caja: 'CUENTA BNB' }))}
                    className={`mt-2 w-full text-sm py-1.5 rounded-lg border transition-colors ${
                      form.caja === 'CUENTA BNB'
                        ? 'bg-indigo-100 border-indigo-400 text-indigo-700 font-semibold'
                        : 'border-dashed border-indigo-300 text-indigo-500 hover:bg-indigo-50'
                    }`}
                  >
                    🏦 Enviar a Personal BNB
                  </button>
                )}
              </div>}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input data-testid="input-description" type="text" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Detalle del movimiento..."
                />
              </div>

              {formError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setKeepOpen(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${keepOpen ? 'bg-amber-400' : 'bg-gray-200'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${keepOpen ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-gray-500 font-medium">Agregar otro</span>
              </label>
              <div className="flex gap-3">
                <button onClick={() => closeModal()}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button data-testid="btn-save-transaction" onClick={handleSave} disabled={saving}
                  className="px-5 py-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg transition-colors disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vitrina Product Picker */}
      {showVitrinaPicker && (
        <VitrinaProductPicker
          onClose={() => setShowVitrinaPicker(false)}
          onConfirm={(items) => {
            const first = items[0];
            if (!first) return;
            // Use the first selected product for stock-decrement tracking
            setVitrinaSaleProductId(first.product.id);
            setVitrinaSellQty(first.qty);
            const totalAmt = items.reduce((s, i) => s + i.total, 0);
            const desc = items.length === 1
              ? (first.qty > 1 ? `${first.product.name} x${first.qty}` : first.product.name)
              : items.map(i => i.qty > 1 ? `${i.product.name} x${i.qty}` : i.product.name).join(', ');
            setForm(f => ({ ...f, amount: totalAmt.toFixed(2), description: desc }));
            setShowVitrinaPicker(false);
          }}
        />
      )}

      {/* ── Confirm dialog ── */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <h3 className="font-bold text-gray-900 text-base mb-2">{confirmDialog.title}</h3>
              <p className="text-sm text-gray-500">{confirmDialog.body}</p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                data-testid="btn-confirm-delete"
                onClick={confirmDialog.onConfirm}
                className="px-5 py-2 text-sm font-semibold bg-red-500 hover:bg-red-400 text-white rounded-lg">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── BNB Import Preview Modal ── */}
      {bnbModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">📤 Importar egresos BNB</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="text-green-600 font-semibold">{bnbRows.filter(r => !r.needsReview).length} auto-categorizados</span>
                  {bnbRows.filter(r => r.needsReview).length > 0 && (
                    <> · <span className="text-red-500 font-semibold">{bnbRows.filter(r => r.needsReview).length} requieren categoría manual</span></>
                  )}
                </p>
              </div>
              <button onClick={() => { setBnbModalOpen(false); setBnbRows([]); setBnbError(''); }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {/* Table */}
            <div className="overflow-auto flex-1 px-2 py-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase text-[10px] tracking-wider">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Referencia</th>
                    <th className="px-3 py-2 text-left">Cuenta destino</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-left min-w-[200px]">Categoría</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bnbRows.map((row, idx) => (
                    <tr key={idx} className={`border-b border-gray-100 ${row.needsReview ? 'bg-red-50' : 'bg-white'}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.fecha}<br /><span className="text-gray-400">{row.hora}</span></td>
                      <td className="px-3 py-2 text-gray-800 font-medium whitespace-normal break-words max-w-[130px]">
                        {row.referencia}
                        <div className="text-gray-400 text-[10px] mt-0.5">{row.codigo}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 whitespace-normal break-words max-w-[160px] text-xs">{row.nombreDestino || row.cuentaDestino}</td>
                      <td className="px-3 py-2 text-right font-semibold text-red-600 whitespace-nowrap">Bs. {row.monto.toFixed(2)}</td>
                      <td className="px-3 py-2 min-w-[200px]">
                        <select
                          value={row.manualCategory || row.category}
                          onChange={e => setBnbRows(prev => prev.map((r, i) => i === idx ? { ...r, manualCategory: e.target.value, needsReview: !e.target.value } : r))}
                          className={`w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 ${row.needsReview && !row.manualCategory ? 'border-red-400 bg-red-50' : 'border-green-300 bg-green-50 text-green-800'}`}
                        >
                          {row.needsReview && !row.manualCategory && <option value="">— Seleccionar —</option>}
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => setBnbRows(prev => prev.filter((_, i) => i !== idx))}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                          title="Excluir este movimiento"
                        ><X size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              {bnbError && <p className="text-red-500 text-sm">{bnbError}</p>}
              {!bnbError && <p className="text-xs text-gray-400">Los duplicados ya registrados fueron omitidos automáticamente.</p>}
              <div className="flex gap-3 ml-auto">
                <button onClick={() => { setBnbModalOpen(false); setBnbRows([]); setBnbError(''); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleBnbImport} disabled={bnbImporting}
                  className="px-5 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50">
                  {bnbImporting ? 'Importando...' : `Importar ${bnbRows.length} movimientos`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
