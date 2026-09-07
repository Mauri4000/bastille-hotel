import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, X, Plus, ExternalLink } from 'lucide-react';
import type { MarketingPost } from './MarketingPage';

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_NAMES   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const NETWORKS    = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'WhatsApp'] as const;
const ACCOUNTS    = ['Bastille Hotel', 'Cretassic Hostal'] as const;

type Network  = typeof NETWORKS[number];
type Account  = typeof ACCOUNTS[number];
type PostType = 'Post' | 'Video';

const NET_COLORS: Record<Network, { bg: string; dot: string }> = {
  TikTok:    { bg: 'bg-black text-white',      dot: '#000000' },
  Instagram: { bg: 'bg-pink-500 text-white',   dot: '#ec4899' },
  Facebook:  { bg: 'bg-blue-600 text-white',   dot: '#2563eb' },
  YouTube:   { bg: 'bg-red-500 text-white',    dot: '#ef4444' },
  WhatsApp:  { bg: 'bg-green-500 text-white',  dot: '#22c55e' },
};

const TYPE_STYLE: Record<PostType, string> = {
  Post:  'bg-pink-100 text-pink-700',
  Video: 'bg-purple-100 text-purple-700',
};

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function MarketingCalendarPage() {
  const navigate = useNavigate();
  const now   = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [posts,    setPosts]    = useState<MarketingPost[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<{ date: string; day: number } | null>(null);

  // Quick-add form
  const [qaTitle,    setQaTitle]    = useState('');
  const [qaType,     setQaType]     = useState<PostType>('Post');
  const [qaNetworks, setQaNetworks] = useState<Network[]>([]);
  const [qaAccount,  setQaAccount]  = useState<Account>('Bastille Hotel');
  const [qaPending,  setQaPending]  = useState(true);
  const [saving,     setSaving]     = useState(false);

  // ── Load posts for the month ────────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    setLoading(true);
    const firstDay = toDateStr(year, month, 1);
    const lastDay  = toDateStr(year, month, new Date(year, month + 1, 0).getDate());
    const { data } = await supabase
      .from('marketing_posts')
      .select('*')
      .gte('date', firstDay)
      .lte('date', lastDay)
      .order('date');
    setPosts((data ?? []) as MarketingPost[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ── Calendar layout ─────────────────────────────────────────────────────────
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Day of week of 1st (0=Sun…6=Sat) → convert to Mon-based (0=Mon…6=Sun)
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayStr = now.toISOString().split('T')[0];

  // Posts grouped by date
  const postsByDate: Record<string, MarketingPost[]> = {};
  for (const p of posts) {
    if (!postsByDate[p.date]) postsByDate[p.date] = [];
    postsByDate[p.date].push(p);
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); }

  // ── Open day ────────────────────────────────────────────────────────────────
  function openDay(day: number) {
    setSelected({ date: toDateStr(year, month, day), day });
    setQaTitle('');
    setQaType('Post');
    setQaNetworks([]);
    setQaAccount('Bastille Hotel');
    setQaPending(true);
  }

  function toggleNet(n: Network) {
    setQaNetworks(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }

  // ── Save quick-add ──────────────────────────────────────────────────────────
  async function saveQuickAdd() {
    if (!selected || saving) return;
    setSaving(true);
    const payload = {
      date:         selected.date,
      title:        qaTitle.trim() || null,
      post_type:    qaType,
      account_name: qaAccount,
      networks:     qaNetworks,
      network_stats: {},
      categories:   [],
      photo_position: '50% 50%',
      paid_ads: false,
      paid_ads_amount: 0,
      pending: qaPending,
      notes: null,
    };
    const { error } = await supabase.from('marketing_posts').insert(payload);
    if (error) { alert('Error: ' + error.message); setSaving(false); return; }
    await loadPosts();
    setSelected(null);
    setSaving(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📅 Calendario de Tareas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Planificación de publicaciones</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/marketing')}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors">
            <ExternalLink size={12} />
            Ver publicaciones
          </button>
          <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft size={18} /></button>
          <span className="text-base font-bold text-gray-800 min-w-[160px] text-center">{MONTH_NAMES[month]} {year}</span>
          <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Redes:</span>
        {NETWORKS.map(n => (
          <span key={n} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: NET_COLORS[n].dot }} />
            {n}
          </span>
        ))}
        <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-pink-100 text-pink-700">Post</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Video</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Pendiente</span>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Day names header */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_NAMES.map(d => (
            <div key={d} className={`py-2 text-center text-xs font-bold uppercase tracking-wider ${
              d === 'Sáb' || d === 'Dom' ? 'text-gray-400' : 'text-gray-500'
            }`}>{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7" style={{ gridAutoRows: '1fr' }}>
            {/* Empty cells before first day */}
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`empty-${i}`} className="border-r border-b border-gray-50 bg-gray-50/50 min-h-[110px]" />
            ))}

            {/* Day cells */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr  = toDateStr(year, month, day);
              const isToday  = dateStr === todayStr;
              const dayPosts = postsByDate[dateStr] ?? [];
              const dow      = (new Date(year, month, day).getDay() + 6) % 7; // Mon-based
              const isWeekend = dow >= 5;
              const isPast   = dateStr < todayStr;

              return (
                <div
                  key={day}
                  onClick={() => openDay(day)}
                  className={`border-r border-b border-gray-100 min-h-[110px] p-1.5 cursor-pointer transition-colors group ${
                    isToday ? 'bg-amber-50' : isWeekend ? 'bg-gray-50/60' : 'bg-white'
                  } hover:bg-amber-50/70`}>

                  {/* Day number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-amber-400 text-white'
                        : isWeekend
                        ? 'text-gray-400'
                        : isPast
                        ? 'text-gray-400'
                        : 'text-gray-700'
                    }`}>{day}</span>
                    <span className="text-gray-200 group-hover:text-gray-400 transition-colors">
                      <Plus size={12} />
                    </span>
                  </div>

                  {/* Posts for this day */}
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 4).map(p => (
                      <div
                        key={p.id}
                        onClick={e => { e.stopPropagation(); navigate('/admin/marketing'); }}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold truncate cursor-pointer hover:opacity-80 transition-opacity ${
                          p.pending ? 'bg-amber-100 text-amber-800' : TYPE_STYLE[p.post_type]
                        }`}
                        title={p.title ?? p.post_type}>
                        <span className="flex items-center gap-1">
                          {p.post_type === 'Video' ? '🎬' : '📸'}
                          <span className="truncate">{p.title ?? p.post_type}</span>
                        </span>
                      </div>
                    ))}
                    {dayPosts.length > 4 && (
                      <p className="text-[9px] text-gray-400 pl-1">+{dayPosts.length - 4} más</p>
                    )}
                  </div>

                  {/* Network dots */}
                  {dayPosts.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap">
                      {[...new Set(dayPosts.flatMap(p => p.networks))].map(n => (
                        <span key={n} className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                          style={{ background: NET_COLORS[n as Network]?.dot ?? '#888' }}
                          title={n} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Day modal ── */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelected(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-96 max-h-[90vh] overflow-y-auto">

              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900">
                    {new Date(selected.date + 'T12:00:00').toLocaleDateString('es-BO', {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(postsByDate[selected.date] ?? []).length} publicación{(postsByDate[selected.date] ?? []).length !== 1 ? 'es' : ''} registrada{(postsByDate[selected.date] ?? []).length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4">

                {/* Existing posts for this day */}
                {(postsByDate[selected.date] ?? []).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Publicaciones del día</p>
                    <div className="space-y-2">
                      {(postsByDate[selected.date] ?? []).map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl border border-gray-100 bg-gray-50">
                          <span className="text-lg">{p.post_type === 'Video' ? '🎬' : '📸'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{p.title ?? '(sin título)'}</p>
                            <p className="text-xs text-gray-400">{p.account_name} · {p.networks.join(', ')}</p>
                          </div>
                          {p.pending && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">PEND</span>}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => navigate('/admin/marketing')}
                      className="mt-2 w-full text-xs text-indigo-500 hover:text-indigo-700 font-semibold text-center py-1.5 border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1">
                      <ExternalLink size={11} /> Ver detalles en publicaciones
                    </button>
                  </div>
                )}

                {/* Divider if there are existing posts */}
                {(postsByDate[selected.date] ?? []).length > 0 && (
                  <div className="border-t border-gray-100 pt-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Agregar nueva tarea</p>
                  </div>
                )}

                {/* Quick-add form */}
                <div className="space-y-3">

                  {/* Title */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Título</p>
                    <input
                      type="text"
                      value={qaTitle}
                      onChange={e => setQaTitle(e.target.value)}
                      placeholder="Ej. Promo habitación matrimonial..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tipo</p>
                    <div className="flex gap-2">
                      {(['Post', 'Video'] as PostType[]).map(t => (
                        <button key={t} type="button"
                          onClick={() => setQaType(t)}
                          className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 transition-all ${
                            qaType === t
                              ? t === 'Video' ? 'border-purple-500 bg-purple-500 text-white' : 'border-pink-500 bg-pink-500 text-white'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {t === 'Video' ? '🎬 Video' : '📸 Post'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Account */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Cuenta</p>
                    <div className="flex gap-2">
                      {ACCOUNTS.map(a => (
                        <button key={a} type="button"
                          onClick={() => setQaAccount(a)}
                          className={`flex-1 py-1.5 text-[11px] font-bold rounded-xl border-2 transition-all ${
                            qaAccount === a
                              ? a === 'Bastille Hotel' ? 'border-amber-400 bg-amber-400 text-gray-900' : 'border-teal-500 bg-teal-500 text-white'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {a === 'Bastille Hotel' ? '🏨 Bastille' : '🦕 Cretassic'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Networks */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Redes sociales</p>
                    <div className="flex flex-wrap gap-1.5">
                      {NETWORKS.map(n => (
                        <button key={n} type="button"
                          onClick={() => toggleNet(n)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            qaNetworks.includes(n) ? NET_COLORS[n].bg : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pending toggle */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700 font-medium">Marcar como pendiente</p>
                    <button
                      type="button"
                      onClick={() => setQaPending(p => !p)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${qaPending ? 'bg-amber-400' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${qaPending ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={saveQuickAdd}
                  disabled={saving || !qaTitle.trim()}
                  className="w-full py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl disabled:opacity-50 transition-colors">
                  {saving ? 'Guardando...' : '+ Registrar tarea'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
