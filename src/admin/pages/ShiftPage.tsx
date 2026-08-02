import { useEffect, useState, useCallback } from 'react';
import { Plus, X, ClipboardList, Pencil, Trash2, CheckCircle2, Circle, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { ShiftHandover, ShiftType } from '../types';
import { MONTH_NAMES } from '../constants';
import CustomSelect from '../components/CustomSelect';

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

const emptyFinalForm = {
  billing_final:       '0',
  cash_register_final: '0',
  petty_cash_final:    '0',
};

/** Accept DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD and return YYYY-MM-DD */
function parseDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

/** Format a JS Date as DD/MM/YYYY */
function toDisplayDate(d: Date): string {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

/** Convert YYYY-MM-DD to DD/MM/YYYY */
function isoToDisplay(s: string): string {
  const [y, mo, d] = s.split('-');
  return `${d}/${mo}/${y}`;
}

/** Extract HH:MM from an ISO timestamp in local time */
function createdAtTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function nowTime(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}

export default function ShiftPage() {
  const { profile } = useAuth();
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [rows,    setRows]    = useState<ShiftHandover[]>([]);
  const [loading, setLoading] = useState(true);

  // Dates that have INICIO DE CAJA / FINAL DE CAJA transactions
  const [inicioSet, setInicioSet] = useState<Set<string>>(new Set());
  const [finalSet,  setFinalSet]  = useState<Set<string>>(new Set());

  // Main modal (new / edit)
  const [modalOpen,     setModalOpen]     = useState(false);
  const [editId,        setEditId]        = useState<string | null>(null);
  const [form,          setForm]          = useState({ ...emptyForm });
  const [saving,        setSaving]        = useState(false);
  const [formError,     setFormError]     = useState('');
  const [savingInitial, setSavingInitial] = useState(false);
  const [savingFinal,   setSavingFinal]   = useState(false);
  const [initialSaved,  setInitialSaved]  = useState(false);
  const [finalSaved,    setFinalSaved]    = useState(false);

  // Final-de-Caja row modal
  const [finalModal,     setFinalModal]     = useState<{ open: boolean; row: ShiftHandover | null }>({ open: false, row: null });
  const [finalForm,      setFinalForm]      = useState({ ...emptyFinalForm });
  const [finalRowSaving, setFinalRowSaving] = useState(false);
  const [finalRowError,  setFinalRowError]  = useState('');

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; row: ShiftHandover | null }>({ open: false, row: null });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-${new Date(year, month + 1, 0).getDate()}`;

    const [{ data }, { data: txData }] = await Promise.all([
      supabase
        .from('shift_handover')
        .select('*, profiles(name)')
        .gte('date', firstDay)
        .lte('date', lastDay)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('transactions')
        .select('date, description')
        .in('description', ['INICIO DE CAJA', 'FINAL DE CAJA'])
        .gte('date', firstDay)
        .lte('date', lastDay),
    ]);

    setRows(data ?? []);

    const ini = new Set<string>();
    const fin = new Set<string>();
    for (const tx of txData ?? []) {
      if (tx.description === 'INICIO DE CAJA') ini.add(tx.date);
      if (tx.description === 'FINAL DE CAJA')  fin.add(tx.date);
    }
    setInicioSet(ini);
    setFinalSet(fin);
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

  // ── Main modal ──
  function openNew() {
    setEditId(null);
    setForm({ ...emptyForm, date: toDisplayDate(today) });
    setFormError('');
    setInitialSaved(false);
    setFinalSaved(false);
    setModalOpen(true);
  }

  function openEdit(r: ShiftHandover) {
    setEditId(r.id);
    setForm({
      date:                    isoToDisplay(r.date),
      shift:                   r.shift,
      keys_count:              String(r.keys_count),
      billing_initial:         String(r.billing_initial),
      billing_final:           String(r.billing_final),
      cash_register_initial:   String(r.cash_register_initial),
      cash_register_final:     String(r.cash_register_final),
      petty_cash_initial:      String(r.petty_cash_initial),
      petty_cash_final:        String(r.petty_cash_final),
      observations:            r.observations ?? '',
    });
    setFormError('');
    setInitialSaved(false);
    setFinalSaved(false);
    setModalOpen(true);
  }

  async function handleDelete() {
    if (!deleteConfirm.row) return;
    const r = deleteConfirm.row;
    setDeleteConfirm({ open: false, row: null });
    // Cascade: remove INICIO/FINAL DE CAJA transactions for this date
    await supabase.from('transactions')
      .delete()
      .in('description', ['INICIO DE CAJA', 'FINAL DE CAJA'])
      .eq('date', r.date);
    await supabase.from('shift_handover').delete().eq('id', r.id);
    fetchData();
  }

  async function handleSaveInitial() {
    setSavingInitial(true);
    setFormError('');
    const n = (v: string) => parseFloat(v) || 0;
    const date = parseDate(form.date);
    const { error } = await supabase.from('transactions').insert([
      { date, time: nowTime(), type: 'egreso', amount: n(form.cash_register_initial), caja: 'CAJA MAYOR', description: 'INICIO DE CAJA', category: 'B08-GASTOS VARIOS', responsible_id: profile?.id ?? null },
      { date, time: nowTime(), type: 'egreso', amount: n(form.petty_cash_initial),    caja: 'CAJA CHICA', description: 'INICIO DE CAJA', category: 'B08-GASTOS VARIOS', responsible_id: profile?.id ?? null },
    ]);
    setSavingInitial(false);
    if (error) setFormError('Error al registrar inicial: ' + error.message);
    else setInitialSaved(true);
  }

  async function handleSaveFinal() {
    setSavingFinal(true);
    setFormError('');
    const n = (v: string) => parseFloat(v) || 0;
    const date = parseDate(form.date);
    const { error } = await supabase.from('transactions').insert([
      { date, time: nowTime(), type: 'egreso', amount: n(form.cash_register_final), caja: 'CAJA MAYOR', description: 'FINAL DE CAJA', category: 'B08-GASTOS VARIOS', responsible_id: profile?.id ?? null },
      { date, time: nowTime(), type: 'egreso', amount: n(form.petty_cash_final),    caja: 'CAJA CHICA', description: 'FINAL DE CAJA', category: 'B08-GASTOS VARIOS', responsible_id: profile?.id ?? null },
    ]);
    setSavingFinal(false);
    if (error) setFormError('Error al registrar cierre: ' + error.message);
    else setFinalSaved(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError('');
    if (!form.date || !parseDate(form.date).match(/^\d{4}-\d{2}-\d{2}$/)) {
      setFormError('Ingresa una fecha válida (DD/MM/YYYY).');
      setSaving(false); return;
    }
    if (!form.shift) {
      setFormError('Selecciona el turno.');
      setSaving(false); return;
    }
    const n = (v: string) => parseFloat(v) || 0;
    const payload = {
      date:                    parseDate(form.date),
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
    };
    const { error } = editId
      ? await supabase.from('shift_handover').update(payload).eq('id', editId)
      : await supabase.from('shift_handover').insert(payload);
    setSaving(false);
    if (error) { setFormError('Error: ' + error.message); return; }
    setModalOpen(false);
    fetchData();
  }

  // ── Final-de-Caja row modal ──
  function openFinalModal(r: ShiftHandover) {
    setFinalForm({
      billing_final:       String(r.billing_final ?? 0),
      cash_register_final: String(r.cash_register_final ?? 0),
      petty_cash_final:    String(r.petty_cash_final ?? 0),
    });
    setFinalRowError('');
    setFinalModal({ open: true, row: r });
  }

  async function handleSaveFinalRow() {
    if (!finalModal.row) return;
    setFinalRowSaving(true);
    setFinalRowError('');
    const n = (v: string) => parseFloat(v) || 0;
    const date = finalModal.row.date;
    const { error: txErr } = await supabase.from('transactions').insert([
      { date, time: nowTime(), type: 'egreso', amount: n(finalForm.cash_register_final), caja: 'CAJA MAYOR', description: 'FINAL DE CAJA', category: 'B08-GASTOS VARIOS', responsible_id: profile?.id ?? null },
      { date, time: nowTime(), type: 'egreso', amount: n(finalForm.petty_cash_final),    caja: 'CAJA CHICA', description: 'FINAL DE CAJA', category: 'B08-GASTOS VARIOS', responsible_id: profile?.id ?? null },
    ]);
    if (txErr) { setFinalRowError('Error: ' + txErr.message); setFinalRowSaving(false); return; }

    // Also update the shift_handover record's final fields
    await supabase.from('shift_handover').update({
      billing_final:       n(finalForm.billing_final),
      cash_register_final: n(finalForm.cash_register_final),
      petty_cash_final:    n(finalForm.petty_cash_final),
    }).eq('id', finalModal.row.id);

    setFinalRowSaving(false);
    setFinalModal({ open: false, row: null });
    fetchData();
  }

  const shiftColor: Record<ShiftType, string> = {
    'MAÑANA': 'bg-amber-100 text-amber-800',
    'TARDE':  'bg-blue-100 text-blue-800',
    'NOCHE':  'bg-indigo-100 text-indigo-800',
  };

  const thCls = 'px-3 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider whitespace-nowrap';
  const tdCls = 'px-3 py-3 text-sm text-gray-600 whitespace-nowrap';

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
                  <th className={`${thCls} text-left`}>Fecha</th>
                  <th className={`${thCls} text-left`}>Turno</th>
                  <th className={`${thCls} text-left`}>Responsable</th>
                  <th className={`${thCls} text-center`}>Llaves</th>
                  <th className={`${thCls} text-right`}>Fact. Ini</th>
                  <th className={`${thCls} text-right`}>Fact. Fin</th>
                  <th className={`${thCls} text-right`}>Caja Ini</th>
                  <th className={`${thCls} text-right`}>Caja Fin</th>
                  <th className={`${thCls} text-right`}>CC Ini</th>
                  <th className={`${thCls} text-right`}>CC Fin</th>
                  <th className={`${thCls} text-center`}>Estado</th>
                  <th className={`${thCls} text-left`}>Observaciones</th>
                  <th className={`${thCls}`} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => {
                  const hasInicio = inicioSet.has(r.date);
                  const hasFinal  = finalSet.has(r.date);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className={`${tdCls} text-gray-700 font-medium`}>
                        <div>{isoToDisplay(r.date)}</div>
                        <div className="text-xs text-gray-400 font-normal">{createdAtTime(r.created_at)}</div>
                      </td>
                      <td className={tdCls}>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${shiftColor[r.shift]}`}>
                          {r.shift}
                        </span>
                      </td>
                      <td className={tdCls}>{(r.profiles as any)?.name ?? '—'}</td>
                      <td className={`${tdCls} text-center`}>{r.keys_count}</td>
                      <td className={`${tdCls} text-right`}>{r.billing_initial.toFixed(2)}</td>
                      <td className={`${tdCls} text-right`}>{r.billing_final.toFixed(2)}</td>
                      <td className={`${tdCls} text-right`}>Bs. {r.cash_register_initial.toFixed(2)}</td>
                      <td className={`${tdCls} text-right`}>Bs. {r.cash_register_final.toFixed(2)}</td>
                      <td className={`${tdCls} text-right`}>Bs. {r.petty_cash_initial.toFixed(2)}</td>
                      <td className={`${tdCls} text-right`}>Bs. {r.petty_cash_final.toFixed(2)}</td>

                      {/* Estado */}
                      <td className={`${tdCls} text-center`}>
                        <div className="flex items-center justify-center gap-2">
                          <span title="Inicio de Caja">
                            {hasInicio
                              ? <CheckCircle2 size={16} className="text-green-500" />
                              : <Circle size={16} className="text-gray-300" />
                            }
                          </span>
                          <span title="Final de Caja">
                            {hasFinal
                              ? <CheckCircle2 size={16} className="text-green-500" />
                              : <Circle size={16} className="text-gray-300" />
                            }
                          </span>
                        </div>
                      </td>

                      <td className={`${tdCls} text-xs text-gray-400 max-w-[160px] truncate`}>{r.observations ?? '—'}</td>

                      {/* Acciones */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {!hasFinal && (
                            <button
                              onClick={() => openFinalModal(r)}
                              title="Añadir Final de Caja"
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              <LogOut size={12} />
                              Final de Caja
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(r)}
                            title="Editar"
                            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ open: true, row: r })}
                            title="Eliminar"
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Modal (New / Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">
                {editId ? 'Editar Turno' : 'Registrar Cambio de Turno'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">

              {/* Row 1: Date | Turno | Llaves */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fecha</label>
                  <input
                    type="text"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    placeholder="DD/MM/YYYY"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Turno</label>
                  <CustomSelect value={form.shift} onChange={v => setForm(f => ({ ...f, shift: v as ShiftType }))}
                    options={SHIFTS.map(s => ({ value: s, label: s }))}
                    placeholder="— Seleccionar —" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Llaves</label>
                  <input type="number" min={0} value={form.keys_count}
                    onChange={e => setForm(f => ({ ...f, keys_count: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Inicial section */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Inicial</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Facturación</p>
                    <input type="number" min={0} step={0.01} value={form.billing_initial}
                      onChange={e => setForm(f => ({ ...f, billing_initial: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Caja Mayor</p>
                    <input type="number" min={0} step={0.01} value={form.cash_register_initial}
                      onChange={e => setForm(f => ({ ...f, cash_register_initial: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Caja Chica</p>
                    <input type="number" min={0} step={0.01} value={form.petty_cash_initial}
                      onChange={e => setForm(f => ({ ...f, petty_cash_initial: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <button onClick={handleSaveInitial} disabled={savingInitial || initialSaved}
                  className={`w-full py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                    initialSaved
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
                  }`}>
                  {savingInitial ? 'Registrando...' : initialSaved ? '✓ Inicio de Caja registrado' : 'Guardar Inicio de Caja'}
                </button>
              </div>

              <div className="border-t border-gray-100" />

              {/* Final section */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Final</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Facturación</p>
                    <input type="number" min={0} step={0.01} value={form.billing_final}
                      onChange={e => setForm(f => ({ ...f, billing_final: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Caja Mayor</p>
                    <input type="number" min={0} step={0.01} value={form.cash_register_final}
                      onChange={e => setForm(f => ({ ...f, cash_register_final: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Caja Chica</p>
                    <input type="number" min={0} step={0.01} value={form.petty_cash_final}
                      onChange={e => setForm(f => ({ ...f, petty_cash_final: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
                <button onClick={handleSaveFinal} disabled={savingFinal || finalSaved}
                  className={`w-full py-1.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 ${
                    finalSaved
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-200'
                  }`}>
                  {savingFinal ? 'Registrando...' : finalSaved ? '✓ Final de Caja registrado' : 'Guardar Final de Caja'}
                </button>
              </div>

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observaciones</label>
                <textarea value={form.observations}
                  onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                  rows={2}
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
                {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Final de Caja row modal */}
      {finalModal.open && finalModal.row && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">Final de Caja</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {isoToDisplay(finalModal.row.date)} · {finalModal.row.shift}
                </p>
              </div>
              <button onClick={() => setFinalModal({ open: false, row: null })} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Facturación</p>
                  <input type="number" min={0} step={0.01} value={finalForm.billing_final}
                    onChange={e => setFinalForm(f => ({ ...f, billing_final: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Caja Mayor</p>
                  <input type="number" min={0} step={0.01} value={finalForm.cash_register_final}
                    onChange={e => setFinalForm(f => ({ ...f, cash_register_final: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Caja Chica</p>
                  <input type="number" min={0} step={0.01} value={finalForm.petty_cash_final}
                    onChange={e => setFinalForm(f => ({ ...f, petty_cash_final: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              {finalRowError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{finalRowError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setFinalModal({ open: false, row: null })}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSaveFinalRow} disabled={finalRowSaving}
                className="px-5 py-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg transition-colors disabled:opacity-50">
                {finalRowSaving ? 'Guardando...' : 'Guardar Final de Caja'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete confirm modal */}
      {deleteConfirm.open && deleteConfirm.row && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Eliminar turno</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {isoToDisplay(deleteConfirm.row.date)} · {deleteConfirm.row.shift}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Se eliminará el registro de turno y las transacciones de <strong>Inicio de Caja</strong> y <strong>Final de Caja</strong> de esa fecha. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setDeleteConfirm({ open: false, row: null })}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
