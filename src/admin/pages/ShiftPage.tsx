import { useEffect, useState, useCallback } from 'react';
import { Plus, X, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ShiftHandover, ShiftType } from '../types';
import { MONTH_NAMES } from '../constants';

const SHIFTS: ShiftType[] = ['MAÑANA', 'TARDE', 'NOCHE'];

const emptyForm = {
  date:                    '',
  shift:                   'MAÑANA' as ShiftType,
  keys_count:              '0',
  billing_initial:         '0',
  billing_final:           '0',
  cash_register_initial:   '0',
  cash_register_final:     '0',
  petty_cash_initial:      '0',
  petty_cash_final:        '0',
  observations:            '',
};

export default function ShiftPage() {
  const { profile } = useAuth();
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [rows,    setRows]    = useState<ShiftHandover[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState({ ...emptyForm });
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-${new Date(year, month + 1, 0).getDate()}`;
    const { data } = await supabase
      .from('shift_handover')
      .select('*, profiles(name)')
      .gte('date', firstDay)
      .lte('date', lastDay)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    setRows(data ?? []);
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
    setForm({
      ...emptyForm,
      date: today.toISOString().split('T')[0],
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError('');
    const n = (v: string) => parseFloat(v) || 0;
    const { error } = await supabase.from('shift_handover').insert({
      date:                    form.date,
      shift:                   form.shift,
      responsible_id:          profile?.id ?? null,
      keys_count:              n(form.keys_count),
      billing_initial:         n(form.billing_initial),
      billing_final:           n(form.billing_final),
      cash_register_initial:   n(form.cash_register_initial),
      cash_register_final:     n(form.cash_register_final),
      petty_cash_initial:      n(form.petty_cash_initial),
      petty_cash_final:        n(form.petty_cash_final),
      observations:            form.observations || null,
    });
    setSaving(false);
    if (error) { setFormError('Error: ' + error.message); return; }
    setModalOpen(false);
    fetchData();
  }

  const shiftColor: Record<ShiftType, string> = {
    'MAÑANA': 'bg-amber-100 text-amber-800',
    'TARDE':  'bg-blue-100 text-blue-800',
    'NOCHE':  'bg-indigo-100 text-indigo-800',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cambio de Turno</h1>
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
            Registrar turno
          </button>
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
            <ClipboardList size={32} className="mb-2 opacity-30" />
            <p className="text-sm">Sin registros este mes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Turno</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Responsable</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Llaves</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Fact. Ini</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Fact. Fin</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Caja Ini</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Caja Fin</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">CC Ini</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">CC Fin</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.date}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${shiftColor[r.shift]}`}>
                        {r.shift}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{(r.profiles as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{r.keys_count}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${r.billing_initial.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${r.billing_final.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${r.cash_register_initial.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${r.cash_register_final.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${r.petty_cash_initial.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${r.petty_cash_final.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[200px] truncate">{r.observations ?? '—'}</td>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Registrar Cambio de Turno</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Date + Shift */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
                  <select value={form.shift}
                    onChange={e => setForm(f => ({ ...f, shift: e.target.value as ShiftType }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Keys */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Llaves entregadas</label>
                <input type="number" min={0} value={form.keys_count}
                  onChange={e => setForm(f => ({ ...f, keys_count: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Billing */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Facturación</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Inicial</label>
                    <input type="number" min={0} step={0.01} value={form.billing_initial}
                      onChange={e => setForm(f => ({ ...f, billing_initial: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Final</label>
                    <input type="number" min={0} step={0.01} value={form.billing_final}
                      onChange={e => setForm(f => ({ ...f, billing_final: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Cash register */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Caja Mayor</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Inicial</label>
                    <input type="number" min={0} step={0.01} value={form.cash_register_initial}
                      onChange={e => setForm(f => ({ ...f, cash_register_initial: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Final</label>
                    <input type="number" min={0} step={0.01} value={form.cash_register_final}
                      onChange={e => setForm(f => ({ ...f, cash_register_final: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Petty cash */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Caja Chica</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Inicial</label>
                    <input type="number" min={0} step={0.01} value={form.petty_cash_initial}
                      onChange={e => setForm(f => ({ ...f, petty_cash_initial: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Final</label>
                    <input type="number" min={0} step={0.01} value={form.petty_cash_final}
                      onChange={e => setForm(f => ({ ...f, petty_cash_final: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Observations */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea value={form.observations}
                  onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                  placeholder="Novedades del turno..."
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
