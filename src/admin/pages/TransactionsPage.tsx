import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Filter, Trash2, Pencil } from 'lucide-react';
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
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balances,     setBalances]     = useState<Record<CajaType, number>>({ 'CAJA MAYOR': 0, 'CAJA CHICA': 0, 'CUENTA BNB': 0, 'TARJETA': 0 });
  const [loading,      setLoading]      = useState(true);
  // room_id → siaat_number map (from reservations that have wants_invoice + siaat)
  const [siaatMap, setSiaatMap] = useState<Record<string, string>>({});

  const isAdmin = profile?.role === 'admin';
  const [activeTab, setActiveTab] = useState<Tab>('mayor');
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  useEffect(() => {
    if (isAdmin) setActiveTab(t => t === 'mayor' ? 'all' : t);
  }, [isAdmin]);

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

  // All-time caja running balances
  useEffect(() => {
    async function fetchBalances() {
      const { data } = await supabase
        .from('transactions')
        .select('type, amount, caja');
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
  // Shift-reference rows (Guardar Inicial / Final from ShiftPage) — shown only in mayor/chica tabs,
  // displayed in SALDO column as a reference value, excluded from all totals and running balance.
  const isShiftRef = (t: Transaction) =>
    t.description === 'INICIO DE CAJA' || t.description === 'FINAL DE CAJA';

  // mayor tab: shows Efectivo + QR + Tarjeta (excludes Caja Chica)
  // chica tab: shows only Caja Chica
  // all tab:   shows everything (with dropdown caja filter), excluding shift-ref rows
  const filtered = transactions.filter(t => {
    if (activeTab === 'all'   && isShiftRef(t))                                                   return false;
    if (activeTab === 'mayor' && t.caja === 'CAJA CHICA')                                        return false;
    if (activeTab === 'chica' && t.caja !== 'CAJA CHICA')                                        return false;
    if (activeTab === 'bnb'   && t.caja !== 'CUENTA BNB')                                        return false;
    // Egresos BNB (staff-visible): CUENTA BNB egresos excluding payroll
    if (activeTab === 'bnb_eg' && (t.caja !== 'CUENTA BNB' || t.type !== 'egreso' || t.category === 'B05-SUELDOS Y SALARIOS')) return false;
    // Personal BNB (admin-only): CUENTA BNB payroll egresos only
    if (activeTab === 'bnb_personal' && (t.caja !== 'CUENTA BNB' || t.type !== 'egreso' || t.category !== 'B05-SUELDOS Y SALARIOS')) return false;
    // CUENTA BNB egresos only appear in BNB tabs — never in Caja Mayor / Agosto 2026
    if (activeTab !== 'bnb' && activeTab !== 'bnb_eg' && t.caja === 'CUENTA BNB' && t.type === 'egreso') return false;
    // Hide balance-forward SALDO QR entries from receptionists (admin-only reference rows)
    if (!isAdmin && t.category === 'SALDO QR')                                                    return false;
    // CUENTA BNB payroll is admin-only (handled by bnb_personal tab) — receptionists see all cash payroll
    if (filterType !== 'all' && t.type !== filterType)                                            return false;
    if (activeTab === 'all' && filterCaja !== 'all' && t.caja !== filterCaja)      return false;
    if (filterCat  !== 'all' && t.category !== filterCat)                          return false;
    if (filterCat === 'B03-SERVICIOS BÁSICOS' && filterB03Sub && !t.description?.includes(filterB03Sub)) return false;
    return true;
  });

  // Balance card: mayor→CAJA MAYOR only; bnb→CUENTA BNB only; others→all — shift-ref excluded
  const filteredCash = (activeTab === 'mayor'
    ? filtered.filter(t => t.caja === 'CAJA MAYOR')
    : filtered
  ).filter(t => !isShiftRef(t));

  const totalIncome  = filteredCash.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filteredCash.filter(t => t.type === 'egreso').reduce((s, t) => s + t.amount, 0);
  const balance      = totalIncome - totalExpense;

  const categories = form.type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

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
    setModalOpen(false);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Ingresos & Egresos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{MONTH_NAMES[month]} {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100">‹</button>
          <span className="text-sm font-semibold text-gray-700 w-36 text-center">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100">›</button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 ml-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus size={16} />
            Nuevo
          </button>
        </div>
      </div>

      {/* ── Spreadsheet-style tabs ── */}
      <div className="flex items-center border-b-2 border-gray-200">
        {([
          ...(isAdmin ? [{ id: 'all' as Tab, emoji: '📊', label: `${MONTH_NAMES[month]} ${year}` }] : []),
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
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold border-b-2 -mb-0.5 transition-colors ${
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

      {/* All-time caja balances — only on "Todos" tab */}
      {activeTab === 'all' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CAJAS.map(caja => {
            const bal = balances[caja];
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
                <p className="text-[11px] text-gray-400 mt-1">Saldo acumulado</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Big balance card — only on Caja Mayor / Caja Chica / BNB tabs */}
      {activeTab !== 'all' && (
        <div className="flex justify-center">
          <div className="bg-white rounded-2xl px-12 py-8 border border-gray-100 shadow-sm text-center w-full max-w-md">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
              {activeTab === 'bnb' ? `BNB Mauri · ${MONTH_NAMES[month]} ${year}` : activeTab === 'bnb_eg' ? `Egresos BNB · ${MONTH_NAMES[month]} ${year}` : activeTab === 'bnb_personal' ? `Personal BNB · ${MONTH_NAMES[month]} ${year}` : `Balance ${MONTH_NAMES[month]} ${year}`}
            </p>
            <p className={`text-5xl font-bold tracking-tight ${balance >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
              {balance < 0 && '−'}Bs. {fmt(Math.abs(balance))}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500 font-medium">Filtros:</span>
        </div>
        <CustomSelect size="sm" value={filterType} onChange={v => setFilterType(v as any)}
          options={[{ value:'all', label:'Todos' },{ value:'ingreso', label:'Ingresos' },{ value:'egreso', label:'Egresos' }]}
          placeholder="Todos" />
        {activeTab === 'all' && (
          <CustomSelect size="sm" value={filterCaja} onChange={v => setFilterCaja(v as any)}
            options={[{ value:'all', label:'Todas las cajas' }, ...CAJAS.map(c => ({ value: c, label: CAJA_LABEL[c] }))]}
            placeholder="Todas las cajas" />
        )}
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
        // Running balance oldest → newest
        const sortedAsc = [...filtered].sort((a, b) => {
          const da = a.date + (a.time ?? '');
          const db = b.date + (b.time ?? '');
          return da < db ? -1 : da > db ? 1 : 0;
        });
        let run = 0;
        const balanceMap: Record<string, number> = {};
        for (const t of sortedAsc) {
          // Shift-ref rows don't affect running saldo
          // On BNB/bnb_eg tabs, include CUENTA BNB in the running balance; otherwise skip QR/Tarjeta
          if (!isShiftRef(t) && (activeTab === 'bnb' || activeTab === 'bnb_eg' || activeTab === 'bnb_personal' || (t.caja !== 'CUENTA BNB' && t.caja !== 'TARJETA'))) {
            run += t.type === 'ingreso' ? t.amount : -t.amount;
          }
          balanceMap[t.id] = run;
        }

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
                          <td className="px-3 py-2.5 text-gray-700 text-xs min-w-[260px] max-w-xs truncate border-r border-gray-200">
                            {t.description || <span className="text-gray-300">—</span>}
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

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">{editingTxId ? 'Editar Movimiento' : 'Nuevo Movimiento'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Type toggle */}
              <div className="flex rounded-lg border border-gray-200 p-1 gap-1">
                {(['ingreso', 'egreso'] as TransactionType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setForm(f => ({ ...f, type: t, category: '' }))}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors capitalize ${
                      form.type === t
                        ? t === 'ingreso'
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                        : 'text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                  </button>
                ))}
              </div>

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
                <input type="number" min={0} step={0.01} value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="0.00"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                <CustomSelect value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
                  options={categories.map(c => ({ value: c, label: c }))}
                  placeholder="— Seleccionar —" />
              </div>

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


              {/* Caja */}
              <div>
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
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <input type="text" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Detalle del movimiento..."
                />
              </div>

              {formError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
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
                onClick={confirmDialog.onConfirm}
                className="px-5 py-2 text-sm font-semibold bg-red-500 hover:bg-red-400 text-white rounded-lg">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
