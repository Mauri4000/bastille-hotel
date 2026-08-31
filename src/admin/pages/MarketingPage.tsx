import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import DatePicker from '../components/DatePicker';
import {
  Plus, X, TrendingUp, Heart, MessageCircle, Eye,
  Trash2, ChevronLeft, ChevronRight, Edit2, Camera, ImageOff, Clock, Move,
} from 'lucide-react';
import { MONTH_NAMES } from '../constants';

const CATEGORIES = ['Empresa', 'Mascotas', 'Desayuno', 'Salón', 'Cena', 'Turístico', 'Fecha Festiva', 'Personal de Trabajo', 'Otros'] as const;
const NETWORKS   = ['TikTok', 'Instagram', 'Facebook', 'YouTube', 'WhatsApp'] as const;
const ACCOUNTS   = ['Bastille Hotel', 'Cretassic Hostal'] as const;

type Category = typeof CATEGORIES[number];
type Network  = typeof NETWORKS[number];
type PostType = 'Post' | 'Video';
type Account  = typeof ACCOUNTS[number];

type NetStats = { likes: number; comments: number; views: number };
type NetworkStats = Partial<Record<Network, NetStats>>;

export interface MarketingPost {
  id: string;
  date: string;
  title: string | null;
  account_name: Account;
  networks: Network[];
  network_stats: NetworkStats;
  photo_url: string | null;
  photo_position: string;
  categories: Category[];
  post_type: PostType;
  paid_ads: boolean;
  paid_ads_amount: number;
  pending: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

const NET_COLORS: Record<Network, string> = {
  TikTok:    'bg-black text-white',
  Instagram: 'bg-pink-500 text-white',
  Facebook:  'bg-blue-600 text-white',
  YouTube:   'bg-red-500 text-white',
  WhatsApp:  'bg-green-500 text-white',
};
const CAT_COLORS: Record<string, string> = {
  Empresa:               'bg-blue-100 text-blue-700',
  Mascotas:              'bg-amber-100 text-amber-700',
  Desayuno:              'bg-orange-100 text-orange-700',
  'Salón':               'bg-purple-100 text-purple-700',
  Cena:                  'bg-red-100 text-red-700',
  'Turístico':           'bg-teal-100 text-teal-700',
  'Fecha Festiva':       'bg-pink-100 text-pink-700',
  'Personal de Trabajo': 'bg-indigo-100 text-indigo-700',
  Otros:                 'bg-gray-200 text-gray-700',
};
const ACCOUNT_COLORS: Record<Account, string> = {
  'Bastille Hotel':   'border-amber-400 bg-amber-50 text-amber-800',
  'Cretassic Hostal': 'border-teal-400 bg-teal-50 text-teal-800',
};

const today    = new Date();
const todayStr = today.toISOString().slice(0, 10);

function parseCategories(row: any): Category[] {
  const raw = row?.category ?? row?.categories;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Category[];
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p as Category[]; } catch {}
  return [raw as Category]; // backward compat: old single string value
}

const emptyStats = (): NetStats => ({ likes: 0, comments: 0, views: 0 });
const emptyForm  = () => ({
  date: todayStr,
  title: '',
  account_name: 'Bastille Hotel' as Account,
  networks: [] as Network[],
  network_stats: {} as NetworkStats,
  photo_position: '50% 50%',
  categories: [] as Category[],
  post_type: 'Post' as PostType,
  paid_ads: false,
  paid_ads_amount: 3,
  pending: false,
  notes: '',
});

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-BO', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function aggStats(ns: NetworkStats): NetStats {
  return Object.values(ns).reduce(
    (acc, s) => ({ likes: acc.likes + (s?.likes ?? 0), comments: acc.comments + (s?.comments ?? 0), views: acc.views + (s?.views ?? 0) }),
    { likes: 0, comments: 0, views: 0 },
  );
}

// ── Per-network stats block ──────────────────────────────────────────────────
function NetStatsBlock({ net, stats, onChange }: {
  net: Network; stats: NetStats; onChange: (s: NetStats) => void;
}) {
  const inp = 'w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 text-center';
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${NET_COLORS[net]}`}>{net}</span>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-gray-400 text-center mb-0.5">❤️ Likes</p>
          <input type="number" min="0" value={stats.likes}
            onChange={e => onChange({ ...stats, likes: +e.target.value })} className={inp} />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 text-center mb-0.5">💬 Comentarios</p>
          <input type="number" min="0" value={stats.comments}
            onChange={e => onChange({ ...stats, comments: +e.target.value })} className={inp} />
        </div>
        <div>
          <p className="text-[10px] text-gray-400 text-center mb-0.5">👁 Vistas</p>
          <input type="number" min="0" value={stats.views}
            onChange={e => onChange({ ...stats, views: +e.target.value })} className={inp} />
        </div>
      </div>
    </div>
  );
}

// ── Draggable photo positioner ───────────────────────────────────────────────
function PhotoPositioner({ src, position, onPositionChange, onReplace }: {
  src: string;
  position: string;
  onPositionChange: (pos: string) => void;
  onReplace: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  function posToXY(pos: string): { x: number; y: number } {
    const parts = pos.split(' ');
    return { x: parseFloat(parts[0]) ?? 50, y: parseFloat(parts[1]) ?? 50 };
  }
  function calcPos(e: React.MouseEvent): string {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return `${Math.round(x)}% ${Math.round(y)}%`;
  }

  const { x, y } = posToXY(position);

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: '192px' }}>
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onMouseDown={e => { dragging.current = true; setIsDragging(true); onPositionChange(calcPos(e)); }}
        onMouseMove={e => { if (dragging.current) onPositionChange(calcPos(e)); }}
        onMouseUp={() => { dragging.current = false; setIsDragging(false); }}
        onMouseLeave={() => { dragging.current = false; setIsDragging(false); }}
      >
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover pointer-events-none"
          style={{ objectPosition: position }}
          draggable={false}
        />
        {/* Crosshair dot */}
        <div
          className="absolute w-5 h-5 rounded-full border-2 border-white shadow-lg bg-pink-500/70 pointer-events-none"
          style={{ left: `calc(${x}% - 10px)`, top: `calc(${y}% - 10px)`, transition: isDragging ? 'none' : 'all 0.1s' }}
        />
        {/* Hint */}
        <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1 pointer-events-none">
          <Move size={10} /> Arrastra para ajustar
        </div>
      </div>
      {/* Replace button */}
      <button
        type="button"
        onClick={onReplace}
        className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 transition-colors"
      >
        <Camera size={10} /> Cambiar foto
      </button>
    </div>
  );
}

export default function MarketingPage() {
  const { profile } = useAuth();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPost, setEditPost] = useState<MarketingPost | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay  = new Date(year, month + 1, 0).toISOString().slice(0, 10);

  useEffect(() => { load(); }, [year, month]);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_posts').select('*')
        .gte('date', firstDay).lte('date', lastDay)
        .order('date', { ascending: false });
      if (error) console.error('marketing_posts error:', error.message);
      setPosts((data ?? []).map(row => ({ ...row, categories: parseCategories(row) })) as MarketingPost[]);
    } catch (e) {
      console.error('MarketingPage load failed:', e);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditPost(null); setForm(emptyForm());
    setPhotoFile(null); setPhotoPreview(null); setUploadErr(null);
    setShowModal(true);
  }

  function openEdit(post: MarketingPost) {
    setEditPost(post);
    setForm({
      date: post.date, title: post.title ?? '',
      account_name: post.account_name, networks: post.networks,
      network_stats: post.network_stats ?? {},
      photo_position: post.photo_position ?? '50% 50%',
      categories: parseCategories(post), post_type: post.post_type ?? 'Post',
      paid_ads: post.paid_ads ?? false, paid_ads_amount: post.paid_ads_amount ?? 3,
      pending: post.pending ?? false,
      notes: post.notes ?? '',
    });
    setPhotoFile(null); setPhotoPreview(post.photo_url); setUploadErr(null);
    setShowModal(true);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setForm(f => ({ ...f, photo_position: '50% 50%' }));
  }

  function toggleNetwork(net: Network) {
    setForm(f => {
      const adding = !f.networks.includes(net);
      const networks = adding ? [...f.networks, net] : f.networks.filter(n => n !== net);
      const network_stats = { ...f.network_stats };
      if (adding) network_stats[net] = emptyStats();
      else delete network_stats[net];
      return { ...f, networks, network_stats };
    });
  }

  function updateNetStats(net: Network, s: NetStats) {
    setForm(f => ({ ...f, network_stats: { ...f.network_stats, [net]: s } }));
  }

  async function handleSave() {
    if (!form.account_name.trim() || form.networks.length === 0) return;
    setSaving(true); setUploadErr(null);
    let photo_url: string | null = editPost?.photo_url ?? null;
    if (photoFile) {
      const ext  = photoFile.name.split('.').pop() ?? 'jpg';
      const path = `marketing/${year}/${month + 1}/${Date.now()}.${ext}`;
      const { data: upData, error: upErr } = await supabase.storage
        .from('vitrina-images').upload(path, photoFile, { upsert: false });
      if (upErr) { setUploadErr('Error subiendo foto: ' + upErr.message); setSaving(false); return; }
      photo_url = supabase.storage.from('vitrina-images').getPublicUrl(upData.path).data.publicUrl;
    }
    const { categories, ...rest } = form;
    const payload = { ...rest, category: JSON.stringify(categories), photo_url, created_by: profile?.id ?? null };
    const { error: dbErr } = editPost
      ? await supabase.from('marketing_posts').update(payload).eq('id', editPost.id)
      : await supabase.from('marketing_posts').insert(payload);
    if (dbErr) { setUploadErr('Error al guardar: ' + dbErr.message); setSaving(false); return; }
    setSaving(false); setShowModal(false); load();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    await supabase.from('marketing_posts').delete().eq('id', deleteId);
    setDeleteId(null);
    load();
  }

  const [filterCat,     setFilterCat]     = useState<Category | 'all'>('all');
  const [filterAccount, setFilterAccount] = useState<Account | 'all'>('all');

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const published = posts.filter(p => !p.pending);
  const pending   = posts.filter(p => p.pending);

  // Apply filters
  function matchesFilter(p: MarketingPost) {
    if (filterAccount !== 'all' && p.account_name !== filterAccount) return false;
    if (filterCat !== 'all' && !(p.categories ?? []).includes(filterCat)) return false;
    return true;
  }
  const filteredPublished = published.filter(matchesFilter);
  const filteredPending   = pending.filter(matchesFilter);

  const totalLikes    = published.reduce((s, p) => s + aggStats(p.network_stats ?? {}).likes, 0);
  const totalComments = published.reduce((s, p) => s + aggStats(p.network_stats ?? {}).comments, 0);
  const totalViews    = published.reduce((s, p) => s + aggStats(p.network_stats ?? {}).views, 0);

  // Analytics
  const paidPosts    = published.filter(p => p.paid_ads);
  const videoPosts   = published.filter(p => p.post_type === 'Video');
  const bastillePosts   = published.filter(p => p.account_name === 'Bastille Hotel');
  const cretassicPosts  = published.filter(p => p.account_name === 'Cretassic Hostal');
  const topByViews = [...published]
    .sort((a, b) => aggStats(b.network_stats ?? {}).views - aggStats(a.network_stats ?? {}).views)
    .slice(0, 3);
  const catCounts: Partial<Record<Category, number>> = {};
  for (const p of published) for (const c of (p.categories ?? [])) catCounts[c] = (catCounts[c] ?? 0) + 1;

  function renderCard(post: MarketingPost) {
    const agg = aggStats(post.network_stats ?? {});
    const ns  = post.network_stats ?? {};
    const isPending = post.pending;
    return (
      <div key={post.id}
        className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col ${
          isPending ? 'border-amber-200' : 'border-green-200'
        }`}>
        {/* Status strip */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold ${
          isPending ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
        }`}>
          {isPending
            ? <><Clock size={11} /> Pendiente de subir</>
            : <><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Publicado</>
          }
        </div>
        {post.photo_url ? (
          <div className="w-full overflow-hidden" style={{ height: '176px' }}>
            <img src={post.photo_url} alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: post.photo_position ?? '50% 50%' }} />
          </div>
        ) : (
          <div className="w-full bg-gray-50 flex items-center justify-center" style={{ height: '176px' }}>
            <ImageOff size={28} className="text-gray-200" />
          </div>
        )}
        <div className="p-4 space-y-3 flex-1 flex flex-col">
          {/* Account badge */}
          <span className={`self-start px-2 py-0.5 rounded-full text-[10px] font-bold border ${ACCOUNT_COLORS[post.account_name] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
            {post.account_name}
          </span>
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${post.post_type === 'Video' ? 'bg-purple-100 text-purple-700' : 'bg-pink-100 text-pink-700'}`}>
              {post.post_type === 'Video' ? '🎬 Video' : '📸 Post'}
            </span>
            {post.networks.map(net => (
              <span key={net} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${NET_COLORS[net]}`}>{net}</span>
            ))}
            {(post.categories ?? []).map(cat => (
              <span key={cat} className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${CAT_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>{cat}</span>
            ))}
            {post.paid_ads && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">💰 ${post.paid_ads_amount} USD</span>
            )}
          </div>
          <div>
            {post.title && <p className="font-bold text-gray-900 text-sm leading-snug mb-0.5">{post.title}</p>}
            <p className="text-xs text-gray-400">
              {isPending ? `📅 Estimado: ${fmtDate(post.date)}` : fmtDate(post.date)}
            </p>
          </div>
          {/* Per-network stats */}
          {!isPending && post.networks.map(net => {
            const s = ns[net];
            if (!s) return null;
            return (
              <div key={net} className="bg-gray-50 rounded-lg px-3 py-2">
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold mb-1 ${NET_COLORS[net]}`}>{net}</span>
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-0.5 text-rose-500"><Heart size={10} />{s.likes.toLocaleString()}</span>
                  <span className="flex items-center gap-0.5 text-blue-500"><MessageCircle size={10} />{s.comments.toLocaleString()}</span>
                  <span className="flex items-center gap-0.5 text-gray-500"><Eye size={10} />{s.views.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
          {!isPending && post.networks.length > 1 && (
            <div className="flex gap-3 text-xs border-t pt-2 font-semibold">
              <span className="flex items-center gap-0.5 text-rose-500"><Heart size={11} />{agg.likes.toLocaleString()}</span>
              <span className="flex items-center gap-0.5 text-blue-500"><MessageCircle size={11} />{agg.comments.toLocaleString()}</span>
              <span className="flex items-center gap-0.5 text-gray-600"><Eye size={11} />{agg.views.toLocaleString()}</span>
              <span className="text-gray-400 text-[10px] ml-auto">total</span>
            </div>
          )}
          {post.notes && <p className="text-xs text-gray-500 italic line-clamp-2">{post.notes}</p>}
          <div className="flex gap-2 pt-1 mt-auto">
            <button onClick={() => openEdit(post)}
              className="flex-1 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1 transition-colors">
              <Edit2 size={12} /> {isPending ? 'Editar / Publicar' : 'Editar'}
            </button>
            <button onClick={() => setDeleteId(post.id)}
              className="px-3 py-1.5 text-xs text-red-400 border border-red-100 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="text-pink-500" size={24} /> Marketing
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Registro de publicaciones en redes sociales</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-400 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors">
          <Plus size={16} /> Nueva Publicación
        </button>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronLeft size={18} /></button>
        <h2 className="text-lg font-semibold text-gray-800 w-44 text-center">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"><ChevronRight size={18} /></button>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          {published.length > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />{published.length} publicado{published.length !== 1 ? 's' : ''}</span>}
          {pending.length > 0   && <span className="flex items-center gap-1"><Clock size={13} className="text-amber-400" />{pending.length} pendiente{pending.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      {/* ── Summary stats ── */}
      {published.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: <Heart size={20} className="text-rose-400" />, label: 'Total likes',       val: totalLikes },
            { icon: <MessageCircle size={20} className="text-blue-400" />, label: 'Comentarios', val: totalComments },
            { icon: <Eye size={20} className="text-purple-400" />, label: 'Visualizaciones',   val: totalViews },
          ].map(({ icon, label, val }) => (
            <div key={label} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex items-center gap-3">
              <div className="flex-shrink-0">{icon}</div>
              <div>
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-xl font-bold text-gray-900">{val.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Analytics panel ── */}
      {published.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
          <h3 className="font-bold text-gray-800 text-sm">📊 Resumen {MONTH_NAMES[month]} {year}</h3>

          {/* Key counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Publicaciones', val: published.length, sub: `${videoPosts.length} videos · ${published.length - videoPosts.length} posts`, color: 'text-pink-500' },
              { label: 'Bastille Hotel', val: bastillePosts.length, sub: 'publicaciones', color: 'text-amber-600' },
              { label: 'Cretassic Hostal', val: cretassicPosts.length, sub: 'publicaciones', color: 'text-teal-600' },
              { label: 'Con publicidad pagada', val: paidPosts.length, sub: paidPosts.length > 0 ? `Bs. ${paidPosts.reduce((s, p) => s + (p.paid_ads_amount ?? 0), 0).toFixed(0)} invertido` : 'sin publicidad', color: 'text-green-600' },
            ].map(({ label, val, sub, color }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <p className={`text-2xl font-bold ${color}`}>{val}</p>
                <p className="text-xs font-semibold text-gray-700 mt-0.5">{label}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* By category */}
          {Object.keys(catCounts).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Por categoría</p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(catCounts) as [Category, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => (
                    <span key={cat} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${CAT_COLORS[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                      {cat} <span className="font-bold">{count}</span>
                    </span>
                  ))}
              </div>
            </div>
          )}

          {/* Top 3 by views */}
          {topByViews.length > 0 && topByViews[0] && aggStats(topByViews[0].network_stats ?? {}).views > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">🏆 Más vistos</p>
              <div className="space-y-2">
                {topByViews.map((p, i) => {
                  const agg = aggStats(p.network_stats ?? {});
                  return (
                    <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                      <span className={`text-sm font-bold w-5 text-center ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate">{p.title || '(sin título)'}</p>
                        <p className="text-[11px] text-gray-400">{p.account_name} · {p.post_type}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
                        <span className="flex items-center gap-1"><Eye size={11} />{agg.views.toLocaleString()}</span>
                        <span className="flex items-center gap-1"><Heart size={11} />{agg.likes.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paid posts */}
          {paidPosts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">💰 Publicidad pagada</p>
              <div className="space-y-2">
                {paidPosts.map(p => (
                  <div key={p.id} className="flex items-center gap-3 bg-green-50 rounded-xl px-3 py-2 border border-green-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.title || '(sin título)'}</p>
                      <p className="text-[11px] text-gray-400">{p.account_name} · {p.networks.join(', ')}</p>
                    </div>
                    <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">
                      Bs. {(p.paid_ads_amount ?? 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Filters ── */}
      {posts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtrar:</span>
          {/* Account */}
          {(['all', 'Bastille Hotel', 'Cretassic Hostal'] as const).map(acc => (
            <button key={acc} onClick={() => setFilterAccount(acc as any)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filterAccount === acc ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}>
              {acc === 'all' ? 'Todas las cuentas' : acc}
            </button>
          ))}
          <span className="text-gray-300">|</span>
          {/* Categories */}
          <button onClick={() => setFilterCat('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              filterCat === 'all' ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}>
            Todas las categorías
          </button>
          {(Object.keys(catCounts) as Category[]).map(cat => (
            <button key={cat} onClick={() => setFilterCat(f => f === cat ? 'all' : cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filterCat === cat ? `${CAT_COLORS[cat] ?? 'bg-gray-200'} border-current` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}>
              {cat} {catCounts[cat] ? `(${catCounts[cat]})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* ── Posts grid ── */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Sin publicaciones en {MONTH_NAMES[month]}</p>
        </div>
      ) : (
        <>
          {filteredPublished.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-green-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Publicados ({filteredPublished.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{filteredPublished.map(renderCard)}</div>
            </div>
          )}
          {filteredPending.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-amber-600 flex items-center gap-1.5">
                <Clock size={14} /> Pendientes de subir ({filteredPending.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{filteredPending.map(renderCard)}</div>
            </div>
          )}
          {filteredPublished.length === 0 && filteredPending.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Sin resultados para los filtros seleccionados.</p>
          )}
        </>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-xs shadow-2xl overflow-hidden">
            <div className="bg-red-50 px-6 pt-6 pb-4 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-3">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h3 className="font-bold text-gray-900 text-base">¿Eliminar publicación?</h3>
              <p className="text-sm text-gray-500 mt-1">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
              <h2 className="font-bold text-gray-900">{editPost ? 'Editar publicación' : 'Nueva publicación'}</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Status toggle */}
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, pending: false }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors flex items-center justify-center gap-1.5 ${
                    !form.pending ? 'border-green-400 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}>
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Publicado
                </button>
                <button type="button" onClick={() => setForm(f => ({ ...f, pending: true }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors flex items-center justify-center gap-1.5 ${
                    form.pending ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}>
                  <Clock size={14} /> Pendiente
                </button>
              </div>

              {/* Account selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Cuenta</label>
                <div className="flex gap-2">
                  {ACCOUNTS.map(acc => (
                    <button key={acc} type="button" onClick={() => setForm(f => ({ ...f, account_name: acc }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        form.account_name === acc
                          ? ACCOUNT_COLORS[acc]
                          : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}>
                      {acc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Photo */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Captura / Foto</label>
                {photoPreview ? (
                  <PhotoPositioner
                    src={photoPreview}
                    position={form.photo_position}
                    onPositionChange={pos => setForm(f => ({ ...f, photo_position: pos }))}
                    onReplace={() => fileRef.current?.click()}
                  />
                ) : (
                  <div onClick={() => fileRef.current?.click()}
                    className="w-full rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-pink-300 hover:bg-pink-50 transition-colors"
                    style={{ height: '192px' }}>
                    <div className="text-center text-gray-400 select-none">
                      <Camera size={28} className="mx-auto mb-1" />
                      <p className="text-xs">Subir foto / captura</p>
                    </div>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                {uploadErr && <p className="text-xs text-red-500 mt-1">{uploadErr}</p>}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Título de la publicación</label>
                <input type="text" value={form.title} placeholder="Ej: Tour por las habitaciones del hotel..."
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  {form.pending ? 'Fecha estimada de publicación' : 'Fecha de publicación'}
                </label>
                <DatePicker
                  value={form.date}
                  onChange={v => setForm(f => ({ ...f, date: v }))}
                  placeholder="Seleccionar fecha"
                  accentClass="border-pink-400 ring-pink-100"
                  useFixed={true}
                />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Tipo de publicación</label>
                <div className="flex gap-2">
                  {(['Post', 'Video'] as PostType[]).map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, post_type: t }))}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        form.post_type === t
                          ? t === 'Video' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-pink-500 bg-pink-50 text-pink-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {t === 'Post' ? '📸 Post' : '🎬 Video'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Networks */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Redes donde se publicó <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {NETWORKS.map(net => (
                    <button key={net} type="button" onClick={() => toggleNetwork(net)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                        form.networks.includes(net) ? NET_COLORS[net] : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {net}
                    </button>
                  ))}
                </div>
              </div>

              {/* Per-network stats */}
              {!form.pending && form.networks.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-600">Estadísticas por red</label>
                  {form.networks.map(net => (
                    <NetStatsBlock key={net} net={net}
                      stats={form.network_stats[net] ?? emptyStats()}
                      onChange={s => updateNetStats(net, s)} />
                  ))}
                </div>
              )}

              {/* Category — multi-select */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  Categoría <span className="text-gray-400 font-normal">(podés elegir varias)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(cat => {
                    const selected = form.categories.includes(cat);
                    return (
                      <button key={cat} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          categories: f.categories.includes(cat)
                            ? f.categories.filter(c => c !== cat)
                            : [...f.categories, cat],
                        }))}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border-2 ${
                          selected
                            ? `${CAT_COLORS[cat] ?? 'bg-gray-200 text-gray-700'} border-current`
                            : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'
                        }`}>
                        {selected && '✓ '}{cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Publicidad */}
              <div className={`rounded-xl border-2 p-3 transition-colors ${form.paid_ads ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.paid_ads}
                    onChange={e => setForm(f => ({ ...f, paid_ads: e.target.checked, paid_ads_amount: e.target.checked ? (f.paid_ads_amount || 3) : 3 }))}
                    className="w-4 h-4 accent-green-500 cursor-pointer" />
                  <span className="text-sm font-semibold text-gray-700">💰 Se pagó publicidad</span>
                </label>
                {form.paid_ads && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Monto:</span>
                    <span className="text-xs font-bold text-gray-600">$</span>
                    <input type="number" min="0" step="0.5" value={form.paid_ads_amount}
                      onChange={e => setForm(f => ({ ...f, paid_ads_amount: +e.target.value }))}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-green-300" />
                    <span className="text-xs text-gray-400">USD</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Descripción / notas (opcional)</label>
                <textarea value={form.notes} rows={2} placeholder="Descripción, hashtags, link..."
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none" />
              </div>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSave}
                disabled={saving || !form.account_name.trim() || form.networks.length === 0}
                className="px-5 py-2 text-sm font-semibold bg-pink-500 text-white rounded-xl hover:bg-pink-400 disabled:opacity-50 transition-colors">
                {saving ? 'Guardando...' : editPost ? 'Guardar cambios' : form.pending ? '⏳ Guardar pendiente' : '✓ Publicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
