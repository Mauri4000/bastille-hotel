import { useEffect, useState, useCallback } from 'react';
import { History, ChevronLeft, ChevronRight, CalendarDays, ArrowLeftRight, ShoppingBag, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LogEntry {
  id: string;
  user_name: string;
  action: string;
  entity_type: string | null;
  details: string | null;
  created_at: string;
}

type FeatureTab = 'all' | 'reservation' | 'transaction' | 'vitrina' | 'report';

const TABS: { key: FeatureTab; label: string; icon: React.ReactNode }[] = [
  { key: 'all',         label: 'Todos',            icon: <History size={14} /> },
  { key: 'reservation', label: 'Calendario',        icon: <CalendarDays size={14} /> },
  { key: 'transaction', label: 'Ingresos/Egresos',  icon: <ArrowLeftRight size={14} /> },
  { key: 'vitrina',     label: 'Stock Vitrina',     icon: <ShoppingBag size={14} /> },
  { key: 'report',      label: 'Reportes',          icon: <BarChart2 size={14} /> },
];

const ACTION_COLORS: Record<string, string> = {
  'Reserva creada':     'bg-green-100 text-green-700',
  'Reserva editada':    'bg-amber-100 text-amber-700',
  'Reserva eliminada':  'bg-red-100 text-red-600',
  'Llegada confirmada': 'bg-emerald-100 text-emerald-700',
  'Salida registrada':  'bg-blue-100 text-blue-700',
  'Ingreso registrado': 'bg-purple-100 text-purple-700',
  'Ingreso editado':    'bg-indigo-100 text-indigo-700',
  'Ingreso eliminado':  'bg-red-100 text-red-600',
  'Egreso registrado':  'bg-orange-100 text-orange-700',
  'Egreso editado':     'bg-amber-100 text-amber-700',
  'Egreso eliminado':   'bg-red-100 text-red-600',
  'Pago registrado':    'bg-green-100 text-green-700',
  'Late Checkout':      'bg-purple-100 text-purple-700',
  'Stock actualizado':  'bg-gray-100 text-gray-600',
  'Reporte generado':   'bg-cyan-100 text-cyan-700',
};

function badge(action: string) {
  const cls = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-600';
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{action}</span>;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} días`;
}

const PAGE_SIZE = 30;

export default function HistorialPage() {
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(0);
  const [tab,     setTab]     = useState<FeatureTab>('all');
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('activity_log').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (tab !== 'all') q = q.eq('entity_type', tab);
    if (search) q = q.ilike('user_name', `%${search}%`);
    const { data, count } = await q;
    setLogs(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [page, tab, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  // reset page when tab/search changes
  useEffect(() => { setPage(0); }, [tab, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <History size={22} className="text-amber-500" /> Historial de actividad
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} registro{total !== 1 ? 's' : ''}</p>
        </div>
        <input
          type="text" placeholder="Filtrar por usuario..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"
        />
      </div>

      {/* Feature tabs */}
      <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <History size={32} className="mb-2 opacity-30" />
            <p className="text-sm">No hay registros para esta sección.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Fecha / Hora</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Acción</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className="font-medium text-gray-700">
                        {new Date(log.created_at).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-gray-400">
                        {new Date(log.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{timeAgo(log.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-800">{log.user_name}</span>
                    </td>
                    <td className="px-4 py-3">{badge(log.action)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{log.details ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Página {page + 1} de {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
