import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, X, Plus, ExternalLink, Loader2, Lightbulb, CheckCircle2, Circle, Trash2 } from 'lucide-react';
import type { MarketingPost } from './MarketingPage';

// ── Idea types ────────────────────────────────────────────────────────────────
type IdeaAccount = 'Bastille Hotel' | 'Cretassic Hostal' | 'Ambos';

interface MarketingIdea {
  id: string;
  title: string;
  post_type: 'Post' | 'Video';
  account_name: IdeaAccount;
  networks: string[];
  notes: string | null;
  used: boolean;
  created_at: string;
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_NAMES   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const NETWORKS    = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'WhatsApp'] as const;
const ACCOUNTS    = ['Bastille Hotel', 'Cretassic Hostal'] as const;

type Network  = typeof NETWORKS[number];
type Account  = typeof ACCOUNTS[number];
type PostType = 'Post' | 'Video';

const NET_COLORS: Record<Network, { bg: string; dot: string }> = {
  TikTok:    { bg: 'bg-black text-white',     dot: '#000000' },
  Instagram: { bg: 'bg-pink-500 text-white',  dot: '#ec4899' },
  Facebook:  { bg: 'bg-blue-600 text-white',  dot: '#2563eb' },
  YouTube:   { bg: 'bg-red-500 text-white',   dot: '#ef4444' },
  WhatsApp:  { bg: 'bg-green-500 text-white', dot: '#22c55e' },
};

const TYPE_STYLE: Record<PostType, string> = {
  Post:  'bg-pink-100 text-pink-700',
  Video: 'bg-purple-100 text-purple-700',
};

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── Holidays ─────────────────────────────────────────────────────────────────
type HolidayType = 'feriado' | 'regional' | 'idea';
interface Holiday { label: string; emoji: string; type: HolidayType }

const FIXED_HOLIDAYS: Record<string, Holiday> = {
  '01-01': { label: 'Año Nuevo',                    emoji: '🎆', type: 'feriado' },
  '01-22': { label: 'Día del Estado Plurinacional',  emoji: '🇧🇴', type: 'feriado' },
  '02-14': { label: 'San Valentín',                  emoji: '❤️', type: 'idea' },
  '03-08': { label: 'Día de la Mujer',               emoji: '💜', type: 'idea' },
  '04-12': { label: 'Día del Niño',                  emoji: '🧒', type: 'idea' },
  '05-01': { label: 'Día del Trabajador',            emoji: '⚒️', type: 'feriado' },
  '06-21': { label: 'Año Nuevo Aymara / Willkakuti', emoji: '🌅', type: 'feriado' },
  '06-24': { label: 'San Juan',                      emoji: '🔥', type: 'idea' },
  '08-06': { label: 'Día de la Independencia',       emoji: '🇧🇴', type: 'feriado' },
  '08-15': { label: 'Virgen de Urkupiña',            emoji: '⛪', type: 'idea' },
  '09-14': { label: 'Día de Cochabamba',             emoji: '📍', type: 'regional' },
  '09-21': { label: 'Día del Estudiante / Primavera', emoji: '🌸', type: 'idea' },
  '10-12': { label: 'Día de la Descolonización',     emoji: '🇧🇴', type: 'feriado' },
  '10-31': { label: 'Halloween',                     emoji: '🎃', type: 'idea' },
  '11-02': { label: 'Día de Difuntos / Todos Santos', emoji: '💀', type: 'feriado' },
  '12-24': { label: 'Nochebuena',                    emoji: '🎄', type: 'idea' },
  '12-25': { label: 'Navidad',                       emoji: '🎄', type: 'feriado' },
  '12-31': { label: 'Nochevieja',                    emoji: '🥂', type: 'idea' },
};

// Easter using Anonymous Gregorian algorithm
function getEaster(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function getMovingHolidays(year: number): Record<string, Holiday> {
  const result: Record<string, Holiday> = {};
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const offset = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

  const easter = getEaster(year);
  result[fmt(offset(easter, -48))] = { label: 'Carnaval (Lunes)',  emoji: '🎭', type: 'feriado' };
  result[fmt(offset(easter, -47))] = { label: 'Carnaval (Martes)', emoji: '🎭', type: 'feriado' };
  result[fmt(offset(easter,  -2))] = { label: 'Viernes Santo',     emoji: '✝️', type: 'feriado' };
  result[fmt(offset(easter,  60))] = { label: 'Corpus Christi',    emoji: '✝️', type: 'feriado' };

  // Last Sunday of May → Día de la Madre
  const lastMay = new Date(year, 5, 0);
  while (lastMay.getDay() !== 0) lastMay.setDate(lastMay.getDate() - 1);
  result[fmt(lastMay)] = { label: 'Día de la Madre', emoji: '💐', type: 'idea' };

  // Third Sunday of June → Día del Padre
  const juneFst = new Date(year, 5, 1);
  while (juneFst.getDay() !== 0) juneFst.setDate(juneFst.getDate() + 1);
  juneFst.setDate(juneFst.getDate() + 14);
  result[fmt(juneFst)] = { label: 'Día del Padre', emoji: '👨‍👧', type: 'idea' };

  return result;
}

const HOLIDAY_STYLE: Record<HolidayType, string> = {
  feriado:  'bg-red-100 text-red-700',
  regional: 'bg-orange-100 text-orange-700',
  idea:     'bg-violet-100 text-violet-700',
};

// ── Main ─────────────────────────────────────────────────────────────────────
export default function MarketingCalendarPage() {
  const navigate = useNavigate();
  const now   = new Date();
  const [activeTab, setActiveTab] = useState<'calendario' | 'ideas'>('calendario');
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [posts,   setPosts]   = useState<MarketingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ date: string; day: number } | null>(null);

  // Quick-add form
  const [qaTitle,    setQaTitle]    = useState('');
  const [qaType,     setQaType]     = useState<PostType>('Video');
  const [qaNetworks, setQaNetworks] = useState<Network[]>([]);
  const [qaAccount,  setQaAccount]  = useState<Account>('Bastille Hotel');
  const [qaPending,  setQaPending]  = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);

  // Ideas tab
  const [ideas,        setIdeas]        = useState<MarketingIdea[]>([]);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [showIdeaForm, setShowIdeaForm] = useState(false);
  const [ideaTitle,    setIdeaTitle]    = useState('');
  const [ideaType,     setIdeaType]     = useState<'Post' | 'Video'>('Video');
  const [ideaAccount,  setIdeaAccount]  = useState<IdeaAccount>('Bastille Hotel');
  const [ideaNets,     setIdeaNets]     = useState<Network[]>([]);
  const [ideaNotes,    setIdeaNotes]    = useState('');
  const [ideaSaving,   setIdeaSaving]   = useState(false);
  const [filterUsed,    setFilterUsed]    = useState<'all' | 'pending' | 'used'>('pending');
  const [filterAccount, setFilterAccount] = useState<'all' | IdeaAccount>('all');

  const holidays = { ...FIXED_HOLIDAYS, ...getMovingHolidays(year) };
  const getHoliday = (dateStr: string): Holiday | null => holidays[dateStr.slice(5)] ?? null;

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('marketing_posts').select('*')
      .gte('date', toDateStr(year, month, 1))
      .lte('date', toDateStr(year, month, new Date(year, month + 1, 0).getDate()))
      .order('date');
    setPosts((data ?? []) as MarketingPost[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const loadIdeas = useCallback(async () => {
    setIdeasLoading(true);
    const { data } = await supabase.from('marketing_ideas').select('*').order('created_at', { ascending: false });
    setIdeas((data ?? []) as MarketingIdea[]);
    setIdeasLoading(false);
  }, []);

  useEffect(() => { if (activeTab === 'ideas') loadIdeas(); }, [activeTab, loadIdeas]);

  async function saveIdea() {
    if (!ideaTitle.trim() || ideaSaving) return;
    setIdeaSaving(true);
    const { data, error } = await supabase.from('marketing_ideas').insert({
      title: ideaTitle.trim(), post_type: ideaType, account_name: ideaAccount,
      networks: ideaNets, notes: ideaNotes.trim() || null, used: false,
    }).select('*').single();
    if (error) { alert('Error: ' + error.message); setIdeaSaving(false); return; }
    setIdeas(prev => [data as MarketingIdea, ...prev]);
    setIdeaTitle(''); setIdeaType('Video'); setIdeaAccount('Bastille Hotel'); setIdeaNets([]); setIdeaNotes('');
    setShowIdeaForm(false);
    setIdeaSaving(false);
  }

  async function toggleUsed(idea: MarketingIdea) {
    const newVal = !idea.used;
    await supabase.from('marketing_ideas').update({ used: newVal }).eq('id', idea.id);
    setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, used: newVal } : i));
  }

  async function deleteIdea(id: string) {
    await supabase.from('marketing_ideas').delete().eq('id', id);
    setIdeas(prev => prev.filter(i => i.id !== id));
  }

  function toggleIdeaNet(n: Network) {
    setIdeaNets(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }

  // ── Calendar layout ─────────────────────────────────────────────────────────
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow    = (new Date(year, month, 1).getDay() + 6) % 7;
  const todayStr    = now.toISOString().split('T')[0];

  const postsByDate: Record<string, MarketingPost[]> = {};
  for (const p of posts) {
    if (!postsByDate[p.date]) postsByDate[p.date] = [];
    postsByDate[p.date].push(p);
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 11) { setMonth(0);  setYear(y => y+1); } else setMonth(m => m+1); }

  function resetForm() {
    setQaTitle(''); setQaType('Video'); setQaNetworks([]);
    setQaAccount('Bastille Hotel'); setQaPending(true);
  }

  function openDay(day: number) {
    setSelected({ date: toDateStr(year, month, day), day });
    resetForm(); setSaved(false);
  }

  function toggleNet(n: Network) {
    setQaNetworks(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  }

  // ── Save — keeps modal open ─────────────────────────────────────────────────
  async function saveQuickAdd() {
    if (!selected || saving) return;
    setSaving(true);
    const payload = {
      date: selected.date, title: qaTitle.trim() || null,
      post_type: qaType, account_name: qaAccount,
      networks: qaNetworks, network_stats: {}, categories: [],
      photo_position: '50% 50%', paid_ads: false, paid_ads_amount: 0,
      pending: qaPending, notes: null,
    };
    const { error } = await supabase.from('marketing_posts').insert(payload);
    if (error) { alert('Error: ' + error.message); setSaving(false); return; }
    await loadPosts();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    resetForm();   // reset form but keep modal open for more posts
    setSaving(false);
  }

  const filteredIdeas = ideas.filter(i => {
    const byUsed = filterUsed === 'all' ? true : filterUsed === 'pending' ? !i.used : i.used;
    const byAccount = filterAccount === 'all' ? true : i.account_name === filterAccount;
    return byUsed && byAccount;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📅 Calendario de Tareas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Planificación de publicaciones</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/admin/marketing')}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors">
            <ExternalLink size={12} /> Ver publicaciones
          </button>
          {activeTab === 'calendario' && (
            <>
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronLeft size={18} /></button>
              <span className="text-base font-bold text-gray-800 min-w-[160px] text-center">{MONTH_NAMES[month]} {year}</span>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg"><ChevronRight size={18} /></button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        <button onClick={() => setActiveTab('calendario')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'calendario' ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          📅 Calendario
        </button>
        <button onClick={() => setActiveTab('ideas')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'ideas' ? 'border-amber-400 text-amber-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          <Lightbulb size={14} /> Ideas Mauri
          {ideas.filter(i => !i.used).length > 0 && (
            <span className="bg-amber-400 text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {ideas.filter(i => !i.used).length}
            </span>
          )}
        </button>
      </div>

      {/* Legend (calendar only) */}
      {activeTab === 'calendario' && (
        <div className="flex items-center gap-3 mb-3 flex-wrap text-[11px]">
          <span className="text-gray-400 font-semibold uppercase tracking-wider">Redes:</span>
          {NETWORKS.map(n => (
            <span key={n} className="flex items-center gap-1 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: NET_COLORS[n].dot }} />{n}
            </span>
          ))}
          <span className="ml-1 px-2 py-0.5 rounded font-bold bg-red-100 text-red-700">Feriado</span>
          <span className="px-2 py-0.5 rounded font-bold bg-orange-100 text-orange-700">Regional</span>
          <span className="px-2 py-0.5 rounded font-bold bg-violet-100 text-violet-700">💡 Idea</span>
        </div>
      )}

      {/* ══ IDEAS TAB ══ */}
      {activeTab === 'ideas' && (
        <div className="flex-1 overflow-y-auto">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex gap-1 flex-wrap">
              {(['pending','all','used'] as const).map(f => (
                <button key={f} onClick={() => setFilterUsed(f)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${filterUsed === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {f === 'pending' ? '⏳ Pendientes' : f === 'used' ? '✅ Usadas' : '📋 Todas'}
                </button>
              ))}
            </div>
            <button onClick={() => setShowIdeaForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold text-sm rounded-xl transition-colors">
              <Plus size={15} /> Nueva idea
            </button>
          </div>

          {/* Account filter */}
          <div className="flex gap-1.5 mb-4 flex-wrap">
            {(['all', 'Bastille Hotel', 'Cretassic Hostal', 'Ambos'] as const).map(a => (
              <button key={a} onClick={() => setFilterAccount(a)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${
                  filterAccount === a
                    ? a === 'Bastille Hotel' ? 'border-amber-400 bg-amber-400 text-gray-900'
                      : a === 'Cretassic Hostal' ? 'border-teal-500 bg-teal-500 text-white'
                      : a === 'Ambos' ? 'border-indigo-500 bg-indigo-500 text-white'
                      : 'border-gray-800 bg-gray-800 text-white'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}>
                {a === 'all' ? '🌐 Todas' : a === 'Bastille Hotel' ? '🏨 Bastille' : a === 'Cretassic Hostal' ? '🦕 Cretassic' : '🏨🦕 Ambos'}
              </button>
            ))}
          </div>

          {ideasLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredIdeas.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Lightbulb size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">{filterUsed === 'used' ? 'No hay ideas usadas aún.' : 'Ninguna idea registrada.'}</p>
              <p className="text-sm mt-1">Toca "Nueva idea" para agregar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIdeas.map(idea => (
                <div key={idea.id}
                  className={`bg-white rounded-2xl border shadow-sm p-4 transition-opacity ${idea.used ? 'opacity-60 border-gray-100' : 'border-gray-200 border-l-4 border-l-amber-400'}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg flex-shrink-0">{idea.post_type === 'Video' ? '🎬' : '📸'}</span>
                      <div className="min-w-0">
                        <p className={`font-bold text-sm leading-snug ${idea.used ? 'line-through text-gray-400' : 'text-gray-900'}`}>{idea.title}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          idea.account_name === 'Bastille Hotel' ? 'bg-amber-100 text-amber-700'
                          : idea.account_name === 'Cretassic Hostal' ? 'bg-teal-100 text-teal-700'
                          : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {idea.account_name === 'Bastille Hotel' ? '🏨 Bastille' : idea.account_name === 'Cretassic Hostal' ? '🦕 Cretassic' : '🏨🦕 Ambos'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => toggleUsed(idea)} title={idea.used ? 'Marcar pendiente' : 'Marcar usada'}
                        className="text-gray-300 hover:text-green-500 transition-colors">
                        {idea.used ? <CheckCircle2 size={18} className="text-green-400" /> : <Circle size={18} />}
                      </button>
                      <button onClick={() => deleteIdea(idea.id)}
                        className="text-gray-200 hover:text-red-400 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                  {idea.notes && <p className="text-xs text-gray-500 mb-2 leading-relaxed">{idea.notes}</p>}
                  {idea.networks.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {idea.networks.map(n => (
                        <span key={n} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-600 bg-gray-100">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: NET_COLORS[n as Network]?.dot ?? '#888' }} />{n}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-300 mt-2">
                    {new Date(idea.created_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── New idea modal ── */}
      {showIdeaForm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowIdeaForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-96 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-amber-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900 flex items-center gap-2"><Lightbulb size={16} className="text-amber-500" /> Nueva idea</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Para posts o videos futuros</p>
                </div>
                <button onClick={() => setShowIdeaForm(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Idea / Título</p>
                  <input type="text" value={ideaTitle} onChange={e => setIdeaTitle(e.target.value)}
                    placeholder="Ej. Video mostrando la vista desde el rooftop..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tipo</p>
                  <div className="flex gap-2">
                    {(['Post','Video'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setIdeaType(t)}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 transition-all ${ideaType === t ? (t === 'Video' ? 'border-purple-500 bg-purple-500 text-white' : 'border-pink-500 bg-pink-500 text-white') : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        {t === 'Video' ? '🎬 Video' : '📸 Post'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Cuenta</p>
                  <div className="flex gap-2">
                    {(['Bastille Hotel', 'Cretassic Hostal', 'Ambos'] as IdeaAccount[]).map(a => (
                      <button key={a} type="button" onClick={() => setIdeaAccount(a)}
                        className={`flex-1 py-1.5 text-[11px] font-bold rounded-xl border-2 transition-all ${
                          ideaAccount === a
                            ? a === 'Bastille Hotel' ? 'border-amber-400 bg-amber-400 text-gray-900'
                              : a === 'Cretassic Hostal' ? 'border-teal-500 bg-teal-500 text-white'
                              : 'border-indigo-500 bg-indigo-500 text-white'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}>
                        {a === 'Bastille Hotel' ? '🏨 Bastille' : a === 'Cretassic Hostal' ? '🦕 Cretassic' : '🏨🦕 Ambos'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Redes (opcional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {NETWORKS.map(n => (
                      <button key={n} type="button" onClick={() => toggleIdeaNet(n)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${ideaNets.includes(n) ? NET_COLORS[n].bg : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Notas / Descripción (opcional)</p>
                  <textarea value={ideaNotes} onChange={e => setIdeaNotes(e.target.value)} rows={3}
                    placeholder="Contexto, guion, referencia, lo que sea..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                <button onClick={() => setShowIdeaForm(false)} className="px-4 py-2.5 text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl">Cancelar</button>
                <button onClick={saveIdea} disabled={ideaSaving || !ideaTitle.trim()}
                  className="flex-1 py-2.5 text-sm font-bold bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-xl disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {ideaSaving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : <><Lightbulb size={14} /> Guardar idea</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Calendar grid */}
      {activeTab === 'calendario' && <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAY_NAMES.map(d => (
            <div key={d} className={`py-2 text-center text-xs font-bold uppercase tracking-wider ${d === 'Sáb' || d === 'Dom' ? 'text-gray-400' : 'text-gray-500'}`}>{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7" style={{ gridAutoRows: '1fr' }}>
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`e-${i}`} className="border-r border-b border-gray-50 bg-gray-50/50 min-h-[110px]" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr   = toDateStr(year, month, day);
              const isToday   = dateStr === todayStr;
              const dayPosts  = postsByDate[dateStr] ?? [];
              const dow       = (new Date(year, month, day).getDay() + 6) % 7;
              const isWeekend = dow >= 5;
              const isPast    = dateStr < todayStr;
              const holiday   = getHoliday(dateStr);

              return (
                <div key={day} onClick={() => openDay(day)}
                  className={`border-r border-b border-gray-100 min-h-[110px] p-1.5 cursor-pointer transition-colors group ${
                    isToday ? 'bg-amber-50' : isWeekend ? 'bg-gray-50/60' : 'bg-white'
                  } hover:bg-amber-50/70`}>

                  {/* Day number + plus icon */}
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-amber-400 text-white' : isWeekend ? 'text-gray-400' : isPast ? 'text-gray-400' : 'text-gray-700'
                    }`}>{day}</span>
                    <span className="text-gray-200 group-hover:text-gray-400 transition-colors"><Plus size={12} /></span>
                  </div>

                  {/* Holiday badge */}
                  {holiday && (
                    <div className={`text-[9px] font-bold px-1 py-0.5 rounded mb-0.5 leading-tight truncate ${HOLIDAY_STYLE[holiday.type]}`}>
                      {holiday.emoji} {holiday.label}
                    </div>
                  )}

                  {/* Posts */}
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map(p => (
                      <div key={p.id}
                        onClick={e => { e.stopPropagation(); navigate('/admin/marketing'); }}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold truncate cursor-pointer hover:opacity-80 transition-opacity ${
                          p.pending ? 'bg-amber-100 text-amber-800' : TYPE_STYLE[p.post_type]
                        }`} title={p.title ?? p.post_type}>
                        <span className="flex items-center gap-0.5">
                          {p.post_type === 'Video' ? '🎬' : '📸'}
                          <span className="truncate">{p.title ?? p.post_type}</span>
                        </span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <p className="text-[9px] text-gray-400 pl-1">+{dayPosts.length - 3} más</p>
                    )}
                  </div>

                  {/* Network dots */}
                  {dayPosts.length > 0 && (
                    <div className="flex gap-0.5 mt-1 flex-wrap">
                      {[...new Set(dayPosts.flatMap(p => p.networks))].map(n => (
                        <span key={n} className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: NET_COLORS[n as Network]?.dot ?? '#888' }} title={n} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* ── Day modal ── */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSelected(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-96 max-h-[92vh] overflow-y-auto">

              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900 capitalize">
                    {new Date(selected.date + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  {getHoliday(selected.date) && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded mt-0.5 inline-block ${HOLIDAY_STYLE[getHoliday(selected.date)!.type]}`}>
                      {getHoliday(selected.date)!.emoji} {getHoliday(selected.date)!.label}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>

              <div className="px-5 py-4 space-y-4">

                {/* Existing posts */}
                {(postsByDate[selected.date] ?? []).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Publicaciones del día ({(postsByDate[selected.date] ?? []).length})
                    </p>
                    <div className="space-y-1.5">
                      {(postsByDate[selected.date] ?? []).map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl border border-gray-100 bg-gray-50">
                          <span>{p.post_type === 'Video' ? '🎬' : '📸'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{p.title ?? '(sin título)'}</p>
                            <p className="text-xs text-gray-400">{p.account_name} · {p.networks.join(', ')}</p>
                          </div>
                          {p.pending && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded flex-shrink-0">PEND</span>}
                        </div>
                      ))}
                    </div>
                    <button onClick={() => navigate('/admin/marketing')}
                      className="mt-2 w-full text-xs text-indigo-500 hover:text-indigo-700 font-semibold py-1.5 border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1">
                      <ExternalLink size={11} /> Ver detalles en publicaciones
                    </button>
                  </div>
                )}

                {/* Divider */}
                <div className={`${(postsByDate[selected.date] ?? []).length > 0 ? 'border-t border-gray-100 pt-2' : ''}`}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                    {saved ? '✅ Guardado — agrega otra' : '➕ Nueva publicación'}
                  </p>
                </div>

                {/* Quick-add form */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Título</p>
                    <input type="text" value={qaTitle} onChange={e => setQaTitle(e.target.value)}
                      placeholder="Ej. Promo habitación matrimonial..."
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tipo</p>
                    <div className="flex gap-2">
                      {(['Post', 'Video'] as PostType[]).map(t => (
                        <button key={t} type="button" onClick={() => setQaType(t)}
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

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Cuenta</p>
                    <div className="flex gap-2">
                      {ACCOUNTS.map(a => (
                        <button key={a} type="button" onClick={() => setQaAccount(a)}
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

                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Redes sociales</p>
                    <div className="flex flex-wrap gap-1.5">
                      {NETWORKS.map(n => (
                        <button key={n} type="button" onClick={() => toggleNet(n)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            qaNetworks.includes(n) ? NET_COLORS[n].bg : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700 font-medium">Marcar como pendiente</p>
                    <button type="button" onClick={() => setQaPending(p => !p)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${qaPending ? 'bg-amber-400' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${qaPending ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                <button onClick={() => setSelected(null)}
                  className="px-4 py-2.5 text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                  Cerrar
                </button>
                <button onClick={saveQuickAdd} disabled={saving || !qaTitle.trim()}
                  className="flex-1 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : '+ Agregar publicación'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
