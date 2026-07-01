import { useEffect, useState, useCallback } from 'react';
import { Plus, X, TrendingUp, TrendingDown, DollarSign, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Transaction, TransactionType, CajaType } from '../types';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES, MONTH_NAMES } from '../constants';

const CAJAS: CajaType[] = ['CAJA MAYOR', 'CAJA CHICA', 'CUENTA BNB'];

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
  const [loading,      setLoading]      = useState(true);

  // filters
  const [filterType,  setFilterType]  = useState<'all' | TransactionType>('all');
  const [filterCaja,  setFilterCaja]  = useState<'all' | CajaType>('all');
  const [filterCat,   setFilterCat]   = useState('all');

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState({ ...emptyForm });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-${new Date(year, month + 1, 0).getDate()}`;
    const { data } = await supabase
      .from('transactions')
      .select('*, profiles(name)')
      .gte('date', firstDay)
      .lte('date', lastDay)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    setTransactions(data ?? []);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── computed ──
  const filtered = transactions.filter(t => {
    if (filterType !== 'all' && t.type !== filterType)     return false;
    if (filterCaja !== 'all' && t.caja !== filterCaja)     return false;
    if (filterCat  !== 'all' && t.category !== filterCat)  return false;
    return true;
  });

  const totalIncome  = filtered.filter(t => t.type === 'ingreso').reduce((s, t) => s + t.amount, 0);
  const totalExpense = filtered.filter(t => t.type === 'egreso').reduce((s, t) => s + t.amount, 0);
  const balance      = totalIncome - totalExpense;

  const categories = form.type === 'ingreso' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // ── open modal ──
  function openNew() {
    const now = new Date();
    setForm({
      ...emptyForm,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0,5),
      category: '',
    });
    setFormError('');
    setModalOpen(true);
  }

  // ── save ──
  async function handleSave() {
    if (!form.amount || parseFloat(form.amount) <= 0) { setFormError('Ingresa un monto válido.'); return; }
    if (!form.category) { setFormError('Selecciona una categoría.'); return; }

    setSaving(true);
    setFormError('');

    const { error } = await supabase.from('transactions').insert({
      date:           form.date || new Date().toISOString().split('T')[0],
      time:           form.time || null,
      description:    form.description || null,
      amount:         parseFloat(form.amount),
      type:           form.type,
      category:       form.category,
      caja:           form.caja,
      room_id:        form.room_id || null,
      notes:          form.notes || null,
      responsible_id: profile?.id ?? null,
    });

    setSaving(false);
    if (error) { setFormError('Error: ' + error.message); return; }
    setModalOpen(false);
    fetchData();
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

  const fmtAmount = (n: number) => `$${n.toFixed(2)}`;

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

      {/* Summary cards */}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500 font-medium">Filtros:</span>
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
        <select
          value={filterCaja}
          onChange={e => setFilterCaja(e.target.value as any)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">Todas las cajas</option>
          {CAJAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="all">Todas las categorías</option>
          <optgroup label="Ingresos">
            {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </optgroup>
          <optgroup label="Egresos">
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </optgroup>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Descripción</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Caja</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Responsable</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {t.date}
                      {t.time && <span className="text-gray-400 text-xs ml-1">{t.time.slice(0,5)}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{t.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">{t.category}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{t.caja}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{(t.profiles as any)?.name ?? '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                      t.type === 'ingreso' ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {t.type === 'ingreso' ? '+' : '-'}{fmtAmount(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Nuevo Movimiento</h3>
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
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
                  <input type="time" value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto (USD) *</label>
                <input type="number" min={0} step={0.01} value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="0.00"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
                <select value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">— Seleccionar —</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Caja */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Caja</label>
                <select value={form.caja}
                  onChange={e => setForm(f => ({ ...f, caja: e.target.value as CajaType }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {CAJAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
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
    </div>
  );
}
