import { useEffect, useState, useCallback } from 'react';
import { Plus, X, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PettyCash } from '../types';
import { MONTH_NAMES } from '../constants';

const emptyForm = {
  date:        '',
  time:        '',
  description: '',
  income:      '',
  expense:     '',
  notes:       '',
};

export default function PettyCashPage() {
  const { profile } = useAuth();
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [rows,     setRows]     = useState<PettyCash[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [balance,  setBalance]  = useState(0);  // current balance from last record

  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState({ ...emptyForm });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-${new Date(year, month + 1, 0).getDate()}`;
    const { data } = await supabase
      .from('petty_cash')
      .select('*, profiles(name)')
      .gte('date', firstDay)
      .lte('date', lastDay)
      .order('date')
      .order('created_at');

    setRows(data ?? []);
    // get last balance overall (not filtered)
    const { data: last } = await supabase
      .from('petty_cash')
      .select('balance')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setBalance(last?.balance ?? 0);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function openNew() {
    const now = new Date();
    setForm({
      ...emptyForm,
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().slice(0,5),
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave() {
    const inc = parseFloat(form.income)  || 0;
    const exp = parseFloat(form.expense) || 0;
    if (inc === 0 && exp === 0) { setFormError('Ingresa un monto de ingreso o egreso.'); return; }
    if (!form.description.trim()) { setFormError('El detalle es obligatorio.'); return; }

    setSaving(true);
    setFormError('');

    // Fetch last balance to compute new running balance
    const { data: last } = await supabase
      .from('petty_cash')
      .select('balance')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const prevBalance = last?.balance ?? 0;
    const newBalance  = prevBalance + inc - exp;

    const { error } = await supabase.from('petty_cash').insert({
      date:           form.date,
      time:           form.time || null,
      description:    form.description.trim(),
      income:         inc,
      expense:        exp,
      balance:        newBalance,
      responsible_id: profile?.id ?? null,
    });

    setSaving(false);
    if (error) { setFormError('Error: ' + error.message); return; }
    setModalOpen(false);
    fetchData();
  }

  const totalIncome  = rows.reduce((s, r) => s + r.income, 0);
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Caja Chica</h1>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={16} className="text-amber-500" />
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Saldo Actual</span>
          </div>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-gray-900' : 'text-red-500'}`}>{fmt(balance)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">Ingresos del mes</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totalIncome)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">Egresos del mes</p>
          <p className="text-2xl font-bold text-red-500">{fmt(totalExpense)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Wallet size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Sin movimientos este mes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Detalle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Responsable</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider text-green-600">Ingreso</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider text-red-500">Egreso</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {r.date}
                      {r.time && <span className="text-gray-400 text-xs ml-1">{r.time.slice(0,5)}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.description}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{(r.profiles as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">
                      {r.income > 0 ? fmt(r.income) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-500">
                      {r.expense > 0 ? fmt(r.expense) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${r.balance >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                      {fmt(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Nuevo Movimiento — Caja Chica</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detalle *</label>
                <input type="text" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Descripción del movimiento..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-1">Ingreso ($)</label>
                  <input type="number" min={0} step={0.01} value={form.income}
                    onChange={e => setForm(f => ({ ...f, income: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-red-600 mb-1">Egreso ($)</label>
                  <input type="number" min={0} step={0.01} value={form.expense}
                    onChange={e => setForm(f => ({ ...f, expense: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    placeholder="0.00"
                  />
                </div>
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
