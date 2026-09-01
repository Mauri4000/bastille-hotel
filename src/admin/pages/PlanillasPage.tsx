import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface Entry {
  id: string;
  year: number;
  month: number;
  ordering: number;
  name: string;
  occupation: string;
  salary_type: 'por_dia' | 'por_mes';
  rate_main: number;
  rate_sunday: number;
  rate_extra: number;
  days_main: number;
  days_sunday: number;
  days_extra: number;
  total_earned: number;
  advances: number;
  total_to_pay: number;
  notes: string;
  status: 'pendiente' | 'pagado';
}

const empty = (): Omit<Entry,'id'> => ({
  year: new Date().getFullYear(), month: new Date().getMonth() + 1,
  ordering: 0, name: '', occupation: '', salary_type: 'por_dia',
  rate_main: 0, rate_sunday: 0, rate_extra: 0,
  days_main: 0, days_sunday: 0, days_extra: 0,
  total_earned: 0, advances: 0, total_to_pay: 0,
  notes: '', status: 'pendiente',
});

function fmtN(n: number) {
  return n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeTotals(f: Omit<Entry,'id'>) {
  const earned = f.rate_main * f.days_main + f.rate_sunday * f.days_sunday + f.rate_extra * f.days_extra;
  return { total_earned: earned, total_to_pay: Math.max(0, earned - f.advances) };
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function EntryModal({ entry, onClose, onSave }: {
  entry: Partial<Entry> | null;
  onClose: () => void;
  onSave: (data: Omit<Entry,'id'>, id?: string) => void;
}) {
  const isNew = !entry?.id;
  const today = new Date();
  const [form, setForm] = useState<Omit<Entry,'id'>>(
    entry ? { ...empty(), ...entry } : empty()
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => {
      const next = { ...f, [k]: v };
      const { total_earned, total_to_pay } = computeTotals(next);
      return { ...next, total_earned, total_to_pay };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    onSave(form, entry?.id);
  }

  const lbl = 'text-xs font-semibold text-gray-600 mb-1 block';
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';
  const num = `${inp} text-right`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-800 text-lg">{isNew ? 'Nueva entrada' : 'Editar entrada'}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Nombre + Ocupación */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Nombre completo</label>
              <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Apellidos y Nombre" />
            </div>
            <div>
              <label className={lbl}>Ocupación</label>
              <input className={inp} value={form.occupation} onChange={e => set('occupation', e.target.value)} placeholder="ej. Limpieza, Recepcionista..." />
            </div>
          </div>

          {/* Mes */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Mes correspondiente</label>
              <select className={inp} value={form.month} onChange={e => set('month', +e.target.value)}>
                {MONTH_NAMES.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Año</label>
              <input className={inp} type="number" value={form.year} onChange={e => set('year', +e.target.value)} />
            </div>
          </div>

          {/* Tipo salario */}
          <div>
            <label className={lbl}>Tipo de salario</label>
            <div className="flex gap-3">
              {(['por_dia','por_mes'] as const).map(t => (
                <button key={t} onClick={() => set('salary_type', t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.salary_type === t ? 'bg-amber-400 border-amber-400 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {t === 'por_dia' ? 'Por Día' : 'Por Mes'}
                </button>
              ))}
            </div>
          </div>

          {/* Salarios */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>{form.salary_type === 'por_dia' ? 'Bs. por día' : 'Salario mensual'}</label>
                <input className={num} type="number" step="0.5" value={form.rate_main || ''} onChange={e => set('rate_main', +e.target.value)} />
              </div>
              <div>
                <label className={lbl}>{form.salary_type === 'por_dia' ? 'Días trabajados' : 'Días (de 30)'}</label>
                <input className={num} type="number" value={form.days_main || ''} onChange={e => set('days_main', +e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Subtotal</label>
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right bg-white text-gray-500">
                  Bs. {fmtN(form.rate_main * form.days_main)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Bs. domingos</label>
                <input className={num} type="number" step="0.5" value={form.rate_sunday || ''} onChange={e => set('rate_sunday', +e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Domingos trabajados</label>
                <input className={num} type="number" value={form.days_sunday || ''} onChange={e => set('days_sunday', +e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Subtotal</label>
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right bg-white text-gray-500">
                  Bs. {fmtN(form.rate_sunday * form.days_sunday)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Bs. extras / feriados</label>
                <input className={num} type="number" step="0.5" value={form.rate_extra || ''} onChange={e => set('rate_extra', +e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Cantidad extras</label>
                <input className={num} type="number" value={form.days_extra || ''} onChange={e => set('days_extra', +e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Subtotal</label>
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-right bg-white text-gray-500">
                  Bs. {fmtN(form.rate_extra * form.days_extra)}
                </div>
              </div>
            </div>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Total ganado</label>
              <div className="border-2 border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm text-right font-bold text-gray-800">
                Bs. {fmtN(form.total_earned)}
              </div>
            </div>
            <div>
              <label className={lbl}>Adelantos</label>
              <input className={num} type="number" step="0.5" value={form.advances || ''} onChange={e => set('advances', +e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={lbl}>Total a pagar</label>
              <div className="border-2 border-green-400 bg-green-50 rounded-lg px-3 py-2 text-right font-bold text-green-800 text-lg">
                Bs. {fmtN(form.total_to_pay)}
              </div>
            </div>
          </div>

          {/* Notas + Estado */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Notas</label>
              <input className={inp} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="ej. 2 feriados / 80 Bs. añadido" />
            </div>
            <div>
              <label className={lbl}>Estado</label>
              <div className="flex gap-2">
                {(['pendiente','pagado'] as const).map(s => (
                  <button key={s} onClick={() => set('status', s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.status === s
                      ? s === 'pagado' ? 'bg-green-500 border-green-500 text-white' : 'bg-amber-400 border-amber-400 text-gray-900'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="px-5 py-2 rounded-lg bg-amber-400 text-gray-900 font-semibold text-sm hover:bg-amber-500 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PlanillasPage() {
  const { profile } = useAuth();
  const today = new Date();
  const [year,    setYear]    = useState(today.getFullYear());
  const [month,   setMonth]   = useState(today.getMonth() + 1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState<Partial<Entry> | null | false>(false);
  const [delId,   setDelId]   = useState<string | null>(null);

  if (profile?.role !== 'admin') return (
    <div className="flex items-center justify-center h-64 text-gray-400">Sin acceso</div>
  );

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('payroll_entries')
      .select('*').eq('year', year).eq('month', month)
      .order('ordering').order('created_at');
    setEntries((data ?? []) as Entry[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line

  async function handleSave(form: Omit<Entry,'id'>, id?: string) {
    if (id) {
      await supabase.from('payroll_entries').update(form).eq('id', id);
    } else {
      const maxOrd = entries.length > 0 ? Math.max(...entries.map(e => e.ordering)) + 1 : 1;
      await supabase.from('payroll_entries').insert({ ...form, ordering: maxOrd, year, month });
    }
    setModal(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('payroll_entries').delete().eq('id', id);
    setDelId(null);
    load();
  }

  async function toggleStatus(e: Entry) {
    const next = e.status === 'pendiente' ? 'pagado' : 'pendiente';
    await supabase.from('payroll_entries').update({ status: next }).eq('id', e.id);
    setEntries(prev => prev.map(x => x.id === e.id ? { ...x, status: next } : x));
  }

  // Summaries
  const totalSueldos  = entries.reduce((s,e) => s + e.total_earned, 0);
  const totalAdelantos = entries.reduce((s,e) => s + e.advances, 0);
  const totalAPagar   = entries.reduce((s,e) => s + e.total_to_pay, 0);

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y+1); } else setMonth(m => m+1); }

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';
  const td = 'px-3 py-2.5 text-sm';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planilla de Sueldos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestión de sueldos y pagos del personal</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-gray-800 w-36 text-center">
              {MONTH_NAMES[month-1]} {year}
            </span>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setModal({})}
            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-gray-900 font-semibold text-sm px-4 py-2.5 rounded-xl">
            <Plus size={16} /> Nueva entrada
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total Sueldos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">Bs. {fmtN(totalSueldos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Adelantos</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">Bs. {fmtN(totalAdelantos)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Total a Pagar</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">Bs. {fmtN(totalAPagar)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">Sin entradas para {MONTH_NAMES[month-1]} {year}</p>
            <button onClick={() => setModal({})} className="mt-3 text-amber-500 text-sm font-medium hover:underline">+ Agregar primera entrada</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className={th}>Nº</th>
                  <th className={th}>Nombre</th>
                  <th className={th}>Ocupación</th>
                  <th className={th}>Salario/día</th>
                  <th className={`${th} text-center`}>Días</th>
                  <th className={th}>Domingos</th>
                  <th className={`${th} text-center`}>Dom.</th>
                  <th className={`${th} text-right`}>Total Ganado</th>
                  <th className={`${th} text-right`}>Adelantos</th>
                  <th className={`${th} text-right`}>Total a Pagar</th>
                  <th className={`${th} text-center`}>Estado</th>
                  <th className={th}>Notas</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e, idx) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className={`${td} text-gray-400 font-medium`}>{idx + 1}</td>
                    <td className={`${td} font-semibold text-gray-800`}>{e.name}</td>
                    <td className={`${td} text-gray-500`}>{e.occupation || '—'}</td>
                    <td className={`${td} text-gray-700`}>
                      {e.salary_type === 'por_mes'
                        ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Mes: Bs.{fmtN(e.rate_main)}</span>
                        : <span>Bs. {fmtN(e.rate_main)}</span>}
                    </td>
                    <td className={`${td} text-center text-gray-700`}>{e.days_main}</td>
                    <td className={`${td} text-gray-500`}>{e.rate_sunday > 0 ? `Bs. ${fmtN(e.rate_sunday)}` : '—'}</td>
                    <td className={`${td} text-center text-gray-500`}>{e.days_sunday || '—'}</td>
                    <td className={`${td} text-right font-semibold text-gray-800`}>Bs. {fmtN(e.total_earned)}</td>
                    <td className={`${td} text-right text-orange-500`}>{e.advances > 0 ? `Bs. ${fmtN(e.advances)}` : '—'}</td>
                    <td className={`${td} text-right font-bold text-gray-900`}>Bs. {fmtN(e.total_to_pay)}</td>
                    <td className={`${td} text-center`}>
                      <button onClick={() => toggleStatus(e)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          e.status === 'pagado'
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        }`}>
                        {e.status === 'pagado' ? '✓ Pagado' : 'Pendiente'}
                      </button>
                    </td>
                    <td className={`${td} text-gray-400 text-xs max-w-[160px] truncate`}>{e.notes || '—'}</td>
                    <td className={`${td}`}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal(e)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => setDelId(e.id)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={7} className={`${td} font-bold text-gray-700 uppercase tracking-wide text-xs`}>
                    TOTAL — {entries.length} persona{entries.length !== 1 ? 's' : ''}
                  </td>
                  <td className={`${td} text-right font-bold text-gray-900`}>Bs. {fmtN(totalSueldos)}</td>
                  <td className={`${td} text-right font-bold text-orange-500`}>Bs. {fmtN(totalAdelantos)}</td>
                  <td className={`${td} text-right font-bold text-amber-600 text-base`}>Bs. {fmtN(totalAPagar)}</td>
                  <td colSpan={3} className={`${td} text-xs text-gray-400`}>
                    {entries.filter(e=>e.status==='pagado').length}/{entries.length} pagados
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal !== false && (
        <EntryModal
          entry={modal && Object.keys(modal).length > 0 ? modal as Entry : null}
          onClose={() => setModal(false)}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm */}
      {delId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="font-bold text-gray-800 mb-2">¿Eliminar entrada?</h3>
            <p className="text-sm text-gray-500 mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button onClick={() => setDelId(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => handleDelete(delId)} className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
