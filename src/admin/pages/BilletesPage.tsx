import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Trash2, X, Pencil } from 'lucide-react';
import DatePicker from '../components/DatePicker';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SERIE_OPTIONS = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

interface Billete {
  id: string;
  date: string;
  time: string | null;
  responsible_name: string | null;
  amount: number;
  currency: string;
  corte_number: string;
  serie: string;
  notes: string | null;
  created_at: string;
}

const emptyForm = {
  date:         '',
  currency:     'BOB' as 'BOB' | 'USD',
  amount:       100,
  usd_amount:   '',
  corte_number: '',
  serie:        'A',
  notes:        '',
};

export default function BilletesPage() {
  const { profile } = useAuth();
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [billetes, setBilletes] = useState<Billete[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [modalOpen,  setModalOpen]  = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState({ ...emptyForm });
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [deleteId,   setDeleteId]   = useState<string | null>(null); // custom confirm

  // ── open for new ──
  function openNew() {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    setForm({ ...emptyForm, date: todayStr });
    setEditingId(null);
    setError('');
    setModalOpen(true);
  }

  // ── open for edit ──
  function openEdit(b: Billete) {
    setForm({
      date:         b.date,
      currency:     (b.currency === 'USD' ? 'USD' : 'BOB') as 'BOB' | 'USD',
      amount:       b.currency !== 'USD' ? b.amount : 100,
      usd_amount:   b.currency === 'USD' ? String(b.amount) : '',
      corte_number: b.corte_number,
      serie:        b.serie,
      notes:        b.notes ?? '',
    });
    setEditingId(b.id);
    setError('');
    setModalOpen(true);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const to   = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
    const { data } = await supabase
      .from('billetes').select('*')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });
    setBilletes((data ?? []) as Billete[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSave() {
    const finalAmount = form.currency === 'USD'
      ? parseFloat(form.usd_amount) || 0
      : form.amount;
    if (!form.date || !form.corte_number.trim() || !form.serie || finalAmount <= 0) {
      setError('Fecha, monto, # de Corte y Serie son obligatorios.');
      return;
    }
    setSaving(true);
    setError('');
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    const payload = {
      date:             form.date,
      amount:           finalAmount,
      currency:         form.currency,
      corte_number:     form.corte_number.trim(),
      serie:            form.serie,
      notes:            form.notes.trim() || null,
    };

    let err;
    if (editingId) {
      ({ error: err } = await supabase.from('billetes').update(payload).eq('id', editingId));
    } else {
      ({ error: err } = await supabase.from('billetes').insert({
        ...payload,
        time:             timeStr,
        responsible_id:   profile?.id ?? null,
        responsible_name: profile?.name ?? null,
      }));
    }
    setSaving(false);
    if (err) { setError('Error al guardar: ' + err.message); return; }
    setModalOpen(false);
    fetchData();
  }

  async function handleDelete(id: string) {
    await supabase.from('billetes').delete().eq('id', id);
    setDeleteId(null);
    fetchData();
  }

  // ── Grouping ──
  const grouped: Record<string, Billete[]> = {};
  for (const b of billetes) {
    if (!grouped[b.date]) grouped[b.date] = [];
    grouped[b.date].push(b);
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const totalBOB = billetes.filter(b => b.currency !== 'USD').reduce((s, b) => s + b.amount, 0);
  const totalUSD = billetes.filter(b => b.currency === 'USD').reduce((s, b) => s + b.amount, 0);

  function fmtDate(d: string) {
    const [y, m, day] = d.split('-').map(Number);
    return `${String(day).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
  }
  function fmtAmount(b: Billete) {
    return b.currency === 'USD' ? `$ ${b.amount.toFixed(2)}` : `Bs. ${b.amount}`;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💵 Registro de Billetes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{MONTH_NAMES[month]} {year}</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-semibold rounded-xl text-sm shadow transition-colors">
          <Plus size={16} /> Registrar
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100">
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors text-lg">‹</button>
        <span className="flex-1 text-center text-sm font-semibold text-gray-700">{MONTH_NAMES[month]} {year}</span>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}
          className="p-1 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors text-lg">›</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Bolivianos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">Bs. {totalBOB.toLocaleString('es-BO')}</p>
          <p className="text-xs text-gray-400 mt-0.5">{billetes.filter(b => b.currency !== 'USD').length} billete{billetes.filter(b => b.currency !== 'USD').length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Total Dólares</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">$ {totalUSD.toFixed(2)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{billetes.filter(b => b.currency === 'USD').length} billete{billetes.filter(b => b.currency === 'USD').length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>
      ) : billetes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">Sin billetes registrados este mes.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Recep.</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider"># de Corte</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Serie</th>
                  <th className="px-3 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {sortedDates.map(date => (
                  <>
                    <tr key={`hdr-${date}`} className="bg-amber-50">
                      <td colSpan={7} className="px-4 py-1.5 text-xs font-bold text-amber-800 uppercase tracking-wide">
                        📅 {fmtDate(date)}
                        <span className="ml-2 font-normal text-amber-600">
                          ({grouped[date].length} billete{grouped[date].length !== 1 ? 's' : ''})
                        </span>
                      </td>
                    </tr>
                    {grouped[date].map(b => (
                      deleteId === b.id ? (
                        /* ── Inline delete confirmation row ── */
                        <tr key={b.id} className="bg-red-50 border-t border-red-100">
                          <td colSpan={5} className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-red-600 font-semibold text-sm">¿Eliminar este billete?</span>
                              <span className="text-red-400 text-xs font-mono">{b.corte_number} — {fmtAmount(b)}</span>
                            </div>
                          </td>
                          <td colSpan={2} className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setDeleteId(null)}
                                className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                                Cancelar
                              </button>
                              <button onClick={() => handleDelete(b.id)}
                                className="px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                                🗑 Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        /* ── Normal row ── */
                        <tr key={b.id} className="hover:bg-gray-50 transition-colors group border-t border-gray-50">
                          <td className="px-4 py-2.5 text-gray-600">{fmtDate(b.date)}</td>
                          <td className="px-4 py-2.5 text-gray-500">{b.time ?? '—'}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-800">{b.responsible_name ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`font-bold ${b.currency === 'USD' ? 'text-emerald-700' : 'text-gray-900'}`}>
                              {fmtAmount(b)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-gray-700">{b.corte_number}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-block bg-gray-100 text-gray-700 font-bold rounded px-2 py-0.5 text-xs">{b.serie}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button onClick={() => openEdit(b)}
                                className="p-1.5 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setDeleteId(b.id)}
                                className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal (new + edit) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                {editingId ? '✏️ Editar billete' : '💵 Registrar billete'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
              )}

              {/* Registrado por (read-only, only for new) */}
              {!editingId && (
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                    <span className="text-gray-900 font-bold text-xs">{profile?.name?.[0]?.toUpperCase() ?? '?'}</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wider leading-none">Registrado por</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{profile?.name ?? '—'}</p>
                  </div>
                </div>
              )}

              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <DatePicker
                  value={form.date}
                  onChange={v => setForm(f => ({ ...f, date: v }))}
                  placeholder="dd/mm/aaaa"
                  accentClass="border-amber-400 ring-amber-100"
                />
              </div>

              {/* Moneda */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Moneda *</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-200">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, currency: 'BOB', amount: 100 }))}
                    className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
                      form.currency === 'BOB' ? 'bg-amber-400 text-gray-900' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}>
                    Bs. Bolivianos
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, currency: 'USD', usd_amount: '' }))}
                    className={`flex-1 py-2.5 text-sm font-bold border-l border-gray-200 transition-colors ${
                      form.currency === 'USD' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}>
                    $ Dólares
                  </button>
                </div>
              </div>

              {/* Monto */}
              {form.currency === 'BOB' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Monto *</label>
                  <div className="flex gap-3">
                    {[100, 200].map(m => (
                      <button key={m} type="button"
                        onClick={() => setForm(f => ({ ...f, amount: m }))}
                        className={`flex-1 py-4 rounded-xl border-2 text-lg font-bold transition-all ${
                          form.amount === m
                            ? 'bg-amber-400 border-amber-500 text-gray-900 scale-105 shadow-md'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300'
                        }`}>
                        Bs. {m}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto (USD) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-sm">$</span>
                    <input type="number" min={0.01} step={0.01}
                      value={form.usd_amount}
                      onChange={e => setForm(f => ({ ...f, usd_amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              )}

              {/* # de Corte */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1"># de Corte *</label>
                <input type="text"
                  value={form.corte_number}
                  onChange={e => setForm(f => ({ ...f, corte_number: e.target.value }))}
                  placeholder="ej. 150242891"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Serie */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Serie *</label>
                <div className="grid grid-cols-9 gap-1">
                  {SERIE_OPTIONS.map(s => (
                    <button key={s} type="button"
                      onClick={() => setForm(f => ({ ...f, serie: s }))}
                      className={`h-8 rounded-lg border text-xs font-bold transition-colors ${
                        form.serie === s
                          ? 'bg-amber-400 border-amber-500 text-gray-900'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-amber-300'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <input type="text"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Observaciones..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0">
              <button onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-semibold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-lg disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : editingId ? '✏️ Actualizar' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
