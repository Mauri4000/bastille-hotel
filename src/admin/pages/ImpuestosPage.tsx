import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChevronLeft, ChevronRight, Pencil, Save, X } from 'lucide-react';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

interface TaxEntry {
  id?: string;
  year: number;
  month: number;
  iva: number;
  it: number;
  trabajo: number;
  impresiones: number;
  monto_factura: number;  // = Ventas
  compras: number;
  saldo_compras_anterior: number;
  notes: string;
}

function fmtN(n: number) {
  return n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emptyEntry = (year: number, month: number): TaxEntry => ({
  year, month, iva: 0, it: 0, trabajo: 80, impresiones: 0, monto_factura: 0, compras: 0, saldo_compras_anterior: 0, notes: '',
});

function computeTotal(e: TaxEntry) {
  return e.iva + e.it + e.trabajo + e.impresiones;
}

export default function ImpuestosPage() {
  const { profile } = useAuth();
  const today = new Date();
  const [year,    setYear]    = useState(today.getFullYear());
  const [month,   setMonth]   = useState(today.getMonth() + 1);
  const [entry,   setEntry]   = useState<TaxEntry | null>(null);
  const [form,    setForm]    = useState<TaxEntry>(emptyEntry(today.getFullYear(), today.getMonth()+1));
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [history, setHistory] = useState<(TaxEntry & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  if (profile?.role !== 'admin') return (
    <div className="flex items-center justify-center h-64 text-gray-400">Sin acceso</div>
  );

  async function load() {
    setLoading(true);
    // Current month entry
    const { data: cur } = await supabase.from('tax_entries')
      .select('*').eq('year', year).eq('month', month).maybeSingle();
    setEntry(cur as TaxEntry | null);
    setForm(cur ? { ...cur } : emptyEntry(year, month));
    setEditing(!cur); // auto-open form if no entry yet

    // History: last 12 months
    const { data: hist } = await supabase.from('tax_entries')
      .select('*').order('year', { ascending: false }).order('month', { ascending: false }).limit(12);
    setHistory((hist ?? []) as (TaxEntry & { id: string })[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [year, month]); // eslint-disable-line

  function set<K extends keyof TaxEntry>(k: K, v: TaxEntry[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    const { error } = await supabase.from('tax_entries').upsert(
      { year, month, iva: form.iva, it: form.it, trabajo: form.trabajo,
        impresiones: form.impresiones, monto_factura: form.monto_factura,
        compras: form.compras, saldo_compras_anterior: form.saldo_compras_anterior, notes: form.notes },
      { onConflict: 'year,month' }
    );
    setSaving(false);
    if (error) { setSaveErr(error.message); return; }
    setEditing(false);
    await load();
  }

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y+1); } else setMonth(m => m+1); }

  const total = computeTotal(form);
  const FIELDS: { key: keyof TaxEntry; label: string; color: string; readOnly?: boolean }[] = [
    { key: 'iva',          label: 'IVA',         color: '#ef4444' },
    { key: 'it',           label: 'IT',          color: '#f59e0b' },
    { key: 'trabajo',      label: 'Trabajo',     color: '#8b5cf6', readOnly: true },
    { key: 'impresiones',  label: 'Impresiones', color: '#06b6d4' },
    { key: 'monto_factura',          label: 'Ventas',                  color: '#22c55e' },
    { key: 'compras',                label: 'Compras',                 color: '#f97316' },
    { key: 'saldo_compras_anterior', label: 'Saldo Compras Mes Ant.', color: '#a855f7' },
  ];

  const lbl = 'text-xs font-semibold text-gray-600 mb-1 block';
  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Impuestos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Registro mensual de obligaciones tributarias</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold text-gray-800 w-40 text-center">
            {MONTH_NAMES[month-1]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-40">
          <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Current month card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-800 text-base">
                {MONTH_NAMES[month-1]} {year}
                {entry ? (
                  <span className="ml-2 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Registrado</span>
                ) : (
                  <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Sin registro</span>
                )}
              </h2>
              {entry && !editing && (
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 font-medium">
                  <Pencil size={14} /> Editar
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {FIELDS.map(f => (
                    <div key={f.key}>
                      <label className={lbl}>
                        <span style={{ color: f.color }}>■</span>{' '}{f.label} (Bs.)
                        {f.readOnly && <span className="ml-1 text-gray-400 font-normal">(auto)</span>}
                      </label>
                      <input
                        className={`${inp} ${f.readOnly ? 'bg-gray-100 text-gray-500 cursor-default' : ''}`}
                        type="number" step="0.01" min="0"
                        readOnly={f.readOnly}
                        value={(form[f.key] as number) ?? ''}
                        onChange={e => !f.readOnly && set(f.key, parseFloat(e.target.value)||0)} />
                    </div>
                  ))}
                  <div className="sm:col-span-3">
                    <label className={lbl}>Notas</label>
                    <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={form.notes} onChange={e => set('notes', e.target.value)}
                      placeholder="Observaciones opcionales..." />
                  </div>
                </div>

                {/* Live totals */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-600">TOTAL IMPUESTOS</span>
                    <span className="text-xl font-bold text-red-600">Bs. {fmtN(total)}</span>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-orange-700">TOTAL COMPRAS</span>
                    <span className="text-xl font-bold text-orange-600">Bs. {fmtN(form.compras + form.saldo_compras_anterior)}</span>
                  </div>
                </div>

                {saveErr && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    <strong>Error al guardar:</strong> {saveErr}
                    {saveErr.includes('compras') && (
                      <div className="mt-1 text-xs text-red-500">
                        Corre este SQL en Supabase: <code className="bg-red-100 px-1 rounded">ALTER TABLE tax_entries ADD COLUMN compras numeric(10,2) DEFAULT 0;</code>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  {entry && (
                    <button onClick={() => { setEditing(false); setSaveErr(null); setForm({ ...entry }); }}
                      className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                      <X size={14} /> Cancelar
                    </button>
                  )}
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 px-5 py-2 bg-amber-400 hover:bg-amber-500 text-gray-900 font-semibold text-sm rounded-xl disabled:opacity-50">
                    <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : entry ? (
              <div className="space-y-3">
                {/* Display rows */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {FIELDS.map(f => (
                    <div key={f.key} className="bg-gray-50 rounded-xl p-3">
                      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{f.label}</div>
                      <div className="text-lg font-bold" style={{ color: f.color }}>Bs. {fmtN((entry as any)[f.key] || 0)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-red-700 uppercase tracking-wide">Total Impuestos</span>
                    <span className="text-xl font-bold text-red-600">Bs. {fmtN(computeTotal(entry))}</span>
                  </div>
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-orange-700 uppercase tracking-wide">Total Compras</span>
                    <span className="text-xl font-bold text-orange-600">Bs. {fmtN((entry.compras||0) + (entry.saldo_compras_anterior||0))}</span>
                  </div>
                </div>
                {entry.notes && (
                  <div className="text-sm text-gray-500 italic px-1">{entry.notes}</div>
                )}
              </div>
            ) : null}
          </div>

          {/* History table */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm">Historial</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Mes</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">IVA</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">IT</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Trabajo</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Impresiones</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Ventas</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Compras</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Saldo Mes Ant.</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-orange-500 uppercase">Total Compras</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase text-red-500">Total Impuestos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {history.map(h => (
                      <tr key={h.id}
                        className={`hover:bg-gray-50 transition-colors ${h.year===year && h.month===month ? 'bg-amber-50' : ''}`}>
                        <td className="px-4 py-2.5 text-sm font-semibold text-gray-800">
                          {MONTH_NAMES[h.month-1]} {h.year}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">Bs. {fmtN(h.iva)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">Bs. {fmtN(h.it)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">Bs. {fmtN(h.trabajo)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-gray-700">Bs. {fmtN(h.impresiones)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-green-700 font-medium">Bs. {fmtN(h.monto_factura)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-orange-600 font-medium">Bs. {fmtN(h.compras ?? 0)}</td>
                        <td className="px-4 py-2.5 text-sm text-right text-purple-600 font-medium">Bs. {fmtN(h.saldo_compras_anterior ?? 0)}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-bold text-orange-700">Bs. {fmtN((h.compras ?? 0) + (h.saldo_compras_anterior ?? 0))}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-bold text-red-600">Bs. {fmtN(computeTotal(h))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
