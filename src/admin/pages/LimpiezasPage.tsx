import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, X, Trash2, Pencil, Camera, Loader2, BedDouble, ImageOff, RefreshCw } from 'lucide-react';

// ── Staff ────────────────────────────────────────────────────────────────────
const STAFF = ['Arlet', 'Carla', 'Vicky', 'Maria', 'Marioly', 'Romina'] as const;
type Staff = typeof STAFF[number];

const STAFF_STYLE: Record<Staff, { pill: string; btn: string }> = {
  Arlet:   { pill: 'bg-green-100  text-green-800',  btn: 'bg-green-500  text-white' },
  Carla:   { pill: 'bg-purple-100 text-purple-800', btn: 'bg-purple-500 text-white' },
  Vicky:   { pill: 'bg-orange-100 text-orange-800', btn: 'bg-orange-500 text-white' },
  Maria:   { pill: 'bg-blue-100   text-blue-800',   btn: 'bg-blue-500   text-white' },
  Marioly: { pill: 'bg-pink-100   text-pink-800',   btn: 'bg-pink-500   text-white' },
  Romina:  { pill: 'bg-teal-100   text-teal-800',   btn: 'bg-teal-500   text-white' },
};

const ROOM_TASKS  = ['Limpieza', 'Habilitación'] as const;
const EXTRA_TASKS = [
  'Ordenar Baulera 1', 'Ordenar Baulera 2', 'Ordenar Baulera 3',
  'Lavado Edredon', 'Lavado Toallas',
  'Trapeado pasillos', 'Trapeado gradas',
  'Limpieza ascensor', 'Limpieza vidrios', 'Desempolvado',
  'Lavado alfombras baño', 'Limpieza Cocina', 'Limpieza Comedor',
  'Lavado Manteles', 'Lavado colchas',
  'Ayudas en Cretassic Hostal',
] as const;

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_NAMES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function parseStaff(val: string | null): Staff[] {
  if (!val) return [];
  return val.split(' & ').filter(s => STAFF.includes(s as Staff)) as Staff[];
}
function fmtDateLong(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-BO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Storage ───────────────────────────────────────────────────────────────────
const BUCKET = 'room-photos';

// FIX: only delete the specific slot (dormitorio OR bano), not both at once
async function uploadRoomPhoto(roomId: string, slot: 'dormitorio' | 'bano', file: File): Promise<string | null> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${roomId}/${slot}.${ext}`;

  // Delete previous files for THIS slot only
  await supabase.storage.from(BUCKET).remove([
    `${roomId}/${slot}.jpg`, `${roomId}/${slot}.jpeg`,
    `${roomId}/${slot}.png`, `${roomId}/${slot}.webp`,
  ]);

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (error) { console.error('Upload error:', error.message); return null; }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CleaningRecord {
  id: string;
  date: string;
  row_key: string;
  task_type: string | null;
  assigned_to: string | null;
  foto_dormitorio: string | null;
  foto_bano: string | null;
}
type TaskMap = Record<string, CleaningRecord>;

interface RoomPhoto {
  record_id: string;       // cleaning_tasks.id — needed to update/null the photo field
  room_id: string;
  date: string;
  assigned_to: string | null;
  foto_dormitorio: string | null;
  foto_bano: string | null;
}

// ── Photo upload slot widget ──────────────────────────────────────────────────
function PhotoUploadSlot({ label, currentUrl, file, onChange }: {
  label: string; currentUrl: string | null; file: File | null;
  onChange: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview  = file ? URL.createObjectURL(file) : currentUrl;
  return (
    <div className="flex-1">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <div onClick={() => inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-colors ${preview ? 'border-sky-300' : 'border-gray-200 hover:border-sky-300'}`}
        style={{ height: 100 }}>
        {preview ? (
          <>
            <img src={preview} alt={label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-1">
            <Camera size={22} /><span className="text-[10px]">Subir foto</span>
          </div>
        )}
        {file && <div className="absolute top-1 right-1 bg-green-500 text-white text-[9px] font-bold px-1 py-0.5 rounded">NUEVA</div>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function LimpiezasPage() {
  const today = new Date();
  const [tab,   setTab]   = useState<'calendario' | 'fotos'>('calendario');
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [rooms,   setRooms]   = useState<{ id: string; name: string }[]>([]);
  const [taskMap, setTaskMap] = useState<TaskMap>({});
  const [loading, setLoading] = useState(true);

  // Popup
  const [popup,         setPopup]         = useState<{ rowKey: string; day: number; isRoom: boolean } | null>(null);
  const [popupStaffs,   setPopupStaffs]   = useState<Staff[]>([]);
  const [popupTask,     setPopupTask]     = useState<string | null>(null);
  const [popupFotoDorm, setPopupFotoDorm] = useState<File | null>(null);
  const [popupFotoBano, setPopupFotoBano] = useState<File | null>(null);
  const [saving,        setSaving]        = useState(false);

  // Photos tab
  const [roomPhotos,    setRoomPhotos]    = useState<RoomPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [lightbox,      setLightbox]      = useState<{ url: string; label: string; room: string; date: string; assigned_to: string | null } | null>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const taskMapRef  = useRef<TaskMap>({});
  taskMapRef.current = taskMap;

  // ── Calendar fetch ─────────────────────────────────────────────────────────
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const [{ data: roomData }, { data: taskData }] = await Promise.all([
      supabase.from('rooms').select('id, name').eq('is_active', true).order('id'),
      supabase.from('cleaning_tasks').select('*')
        .gte('date', toDateStr(year, month, 1))
        .lte('date', toDateStr(year, month, new Date(year, month + 1, 0).getDate())),
    ]);
    if (showLoader) setRooms(roomData ?? []);
    const map: TaskMap = {};
    for (const t of taskData ?? []) map[`${t.date}|${t.row_key}`] = t;
    setTaskMap(map);
    if (showLoader) setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(true); }, [fetchData]);

  useEffect(() => {
    const ch = supabase.channel('limpiezas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_tasks' }, () => fetchData(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData]);

  // ── Photos fetch ────────────────────────────────────────────────────────────
  const fetchPhotos = useCallback(async () => {
    setPhotosLoading(true);
    const { data } = await supabase
      .from('cleaning_tasks')
      .select('id, date, row_key, assigned_to, foto_dormitorio, foto_bano')
      .eq('task_type', 'Habilitación')
      .not('foto_dormitorio', 'is', null)
      .order('date', { ascending: false });

    if (!data) { setPhotosLoading(false); return; }

    const seen = new Set<string>();
    const latest: RoomPhoto[] = [];
    for (const row of data) {
      if (!seen.has(row.row_key)) {
        seen.add(row.row_key);
        latest.push({ record_id: row.id, room_id: row.row_key, date: row.date, assigned_to: row.assigned_to, foto_dormitorio: row.foto_dormitorio, foto_bano: row.foto_bano });
      }
    }
    latest.sort((a, b) => a.room_id.localeCompare(b.room_id));
    setRoomPhotos(latest);
    setPhotosLoading(false);
  }, []);

  // Load photos when switching to that tab
  useEffect(() => { if (tab === 'fotos') fetchPhotos(); }, [tab, fetchPhotos]);

  // ── Popup helpers ──────────────────────────────────────────────────────────
  function getCell(rowKey: string, day: number) {
    return taskMapRef.current[`${toDateStr(year, month, day)}|${rowKey}`] ?? null;
  }
  function openPopup(rowKey: string, day: number, isRoom: boolean) {
    const cell = getCell(rowKey, day);
    setPopupStaffs(parseStaff(cell?.assigned_to ?? null));
    setPopupTask(isRoom ? (cell?.task_type ?? null) : null);
    setPopupFotoDorm(null); setPopupFotoBano(null);
    setPopup({ rowKey, day, isRoom });
  }
  function toggleStaff(s: Staff) {
    setPopupStaffs(prev => {
      if (prev.includes(s)) return prev.filter(x => x !== s);
      if (prev.length >= 2) return [prev[1], s];
      return [...prev, s];
    });
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function savePopup() {
    if (!popup || saving) return;
    setSaving(true);
    const date     = toDateStr(year, month, popup.day);
    const key      = `${date}|${popup.rowKey}`;
    const existing = taskMapRef.current[key];

    if (popupStaffs.length === 0) {
      setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
      if (existing) await supabase.from('cleaning_tasks').delete().eq('id', existing.id);
    } else {
      let fotoDorm: string | null = existing?.foto_dormitorio ?? null;
      let fotoBano: string | null = existing?.foto_bano ?? null;

      if (popupTask === 'Habilitación') {
        if (popupFotoDorm) fotoDorm = await uploadRoomPhoto(popup.rowKey, 'dormitorio', popupFotoDorm);
        if (popupFotoBano) fotoBano = await uploadRoomPhoto(popup.rowKey, 'bano',       popupFotoBano);
      } else {
        fotoDorm = null; fotoBano = null;
      }

      const payload = {
        task_type:       popup.isRoom ? popupTask : null,
        assigned_to:     popupStaffs.join(' & '),
        foto_dormitorio: fotoDorm,
        foto_bano:       fotoBano,
      };

      setTaskMap(prev => ({ ...prev, [key]: { id: existing?.id ?? `tmp-${Date.now()}`, date, row_key: popup.rowKey, ...payload } }));

      if (existing) {
        const { error } = await supabase.from('cleaning_tasks').update(payload).eq('id', existing.id);
        if (error) { console.error(error); alert('Error al guardar: ' + error.message); }
      } else {
        const { data, error } = await supabase.from('cleaning_tasks').insert({ date, row_key: popup.rowKey, ...payload }).select('id').single();
        if (error) {
          alert('Error al guardar: ' + error.message);
          setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
        } else if (data) {
          setTaskMap(prev => ({ ...prev, [key]: { ...prev[key], id: data.id } }));
        }
      }
    }
    setSaving(false);
    setPopup(null);
  }

  async function quickDelete(rowKey: string, day: number, e: React.MouseEvent) {
    e.stopPropagation();
    const key = `${toDateStr(year, month, day)}|${rowKey}`;
    const ex  = taskMapRef.current[key];
    if (!ex) return;
    await supabase.from('cleaning_tasks').delete().eq('id', ex.id);
    setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); }
  function nextMonth() { if (month === 11) { setMonth(0);  setYear(y => y+1); } else setMonth(m => m+1); }

  async function deleteSlotPhoto(p: RoomPhoto, slot: 'dormitorio' | 'bano') {
    if (!confirm(`¿Borrar foto de ${slot === 'dormitorio' ? 'Dormitorio' : 'Baño'} de hab. ${p.room_id}?`)) return;
    // Remove from storage (all possible extensions)
    await supabase.storage.from(BUCKET).remove([
      `${p.room_id}/${slot}.jpg`, `${p.room_id}/${slot}.jpeg`,
      `${p.room_id}/${slot}.png`, `${p.room_id}/${slot}.webp`,
    ]);
    // Null the DB column
    const field = slot === 'dormitorio' ? 'foto_dormitorio' : 'foto_bano';
    await supabase.from('cleaning_tasks').update({ [field]: null }).eq('id', p.record_id);
    // Update local state
    setRoomPhotos(prev => prev.map(r => r.record_id === p.record_id ? { ...r, [field]: null } : r)
      .filter(r => r.foto_dormitorio !== null || r.foto_bano !== null));
  }

  // ── Cell renderer ──────────────────────────────────────────────────────────
  function renderCell(rowKey: string, day: number, isRoom: boolean) {
    const cell   = taskMap[`${toDateStr(year, month, day)}|${rowKey}`] ?? null;
    const staffs = parseStaff(cell?.assigned_to ?? null);
    const task   = cell?.task_type;
    if (staffs.length === 0) return (
      <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-gray-300 text-xs font-bold">+</span>
      </div>
    );
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center gap-px px-0.5">
        <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/80 rounded">
          <button onClick={e => { e.stopPropagation(); openPopup(rowKey, day, isRoom); }}
            className="p-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-600"><Pencil size={9} /></button>
          <button onClick={e => quickDelete(rowKey, day, e)}
            className="p-0.5 rounded bg-red-100 hover:bg-red-200 text-red-500"><X size={9} /></button>
        </div>
        {staffs.length === 1 ? (
          <div className={`rounded text-[9px] font-bold px-0.5 py-px leading-tight w-full text-center ${STAFF_STYLE[staffs[0]].pill}`}>
            {isRoom && task && <div className="text-[7px] leading-none opacity-70">{task === 'Limpieza' ? 'L' : 'H'}</div>}
            <div className="truncate">{staffs[0].slice(0, 4)}</div>
          </div>
        ) : staffs.map(s => (
          <div key={s} className={`rounded text-[8px] font-bold px-0.5 leading-none py-px w-full text-center ${STAFF_STYLE[s].pill}`}>{s.slice(0, 3)}</div>
        ))}
        {!!(cell?.foto_dormitorio || cell?.foto_bano) && task === 'Habilitación' && (
          <div className="text-[7px] leading-none text-sky-500 font-bold">📷</div>
        )}
      </div>
    );
  }

  const popupCell = popup ? (taskMapRef.current[`${toDateStr(year, month, popup.day)}|${popup.rowKey}`] ?? null) : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 flex-shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🧹 Registro de Limpiezas</h1>
          <p className="text-sm text-gray-500">{MONTH_NAMES[month]} {year}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {tab === 'calendario' && (
            <>
              <div className="flex gap-1.5">
                {STAFF.map(s => (
                  <span key={s} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STAFF_STYLE[s].pill}`}>{s}</span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={prevMonth} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronLeft size={16} /></button>
                <span className="text-sm font-semibold text-gray-700 w-28 text-center">{MONTH_NAMES[month]} {year}</span>
                <button onClick={nextMonth} className="p-1.5 hover:bg-gray-100 rounded-lg"><ChevronRight size={16} /></button>
              </div>
            </>
          )}
          {tab === 'fotos' && (
            <button onClick={fetchPhotos}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
              <RefreshCw size={12} /> Actualizar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-200 bg-white px-6 flex-shrink-0">
        <button
          onClick={() => setTab('calendario')}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'calendario' ? 'border-amber-400 text-amber-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          📅 Calendario
        </button>
        <button
          onClick={() => setTab('fotos')}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'fotos' ? 'border-sky-500 text-sky-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
          📷 Control Fotos
        </button>
      </div>

      {/* ── CALENDAR TAB ── */}
      {tab === 'calendario' && (
        loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="border-collapse text-xs" style={{ minWidth: `${130 + days.length * 52}px` }}>
              <thead className="sticky top-0 z-20 bg-white shadow-sm">
                <tr>
                  <th className="sticky left-0 z-30 bg-white border-b-2 border-r border-gray-200 px-2 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider"
                    style={{ width: 130, minWidth: 130 }}>HAB / TAREA</th>
                  {days.map(d => {
                    const dow     = new Date(year, month, d).getDay();
                    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                    return (
                      <th key={d} style={{ width: 52, minWidth: 52 }}
                        className={`border-b-2 border-r border-gray-200 py-1 text-center ${isToday ? 'bg-amber-50 text-amber-700' : (dow===0||dow===6) ? 'bg-gray-50 text-gray-400' : 'text-gray-500'}`}>
                        <div className="text-[8px] leading-none">{DAY_NAMES[dow]}</div>
                        <div className="text-sm font-bold leading-snug">{d}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room, idx) => {
                  const bg = idx % 2 !== 0 ? 'rgb(249,250,251)' : 'white';
                  return (
                    <tr key={room.id} style={{ background: bg }}>
                      <td className="sticky left-0 z-10 border-b border-r border-gray-100 px-2 py-1 font-semibold text-gray-800"
                        style={{ background: bg, minWidth: 130, width: 130 }}>
                        <span className="text-xs">{room.id}</span>
                        <span className="text-gray-400 font-normal text-[9px] ml-1">{room.name}</span>
                      </td>
                      {days.map(d => (
                        <td key={d} onClick={() => openPopup(room.id, d, true)}
                          className="group border-b border-r border-gray-100 cursor-pointer hover:bg-amber-50/60 transition-colors"
                          style={{ width: 52, minWidth: 52, height: 36, padding: 2 }}>
                          {renderCell(room.id, d, true)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={days.length + 1}
                    className="bg-gray-200 border-y border-gray-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                    🧺 Tareas Generales
                  </td>
                </tr>
                {EXTRA_TASKS.map((task, idx) => {
                  const bg = idx % 2 !== 0 ? 'rgb(249,250,251)' : 'white';
                  return (
                    <tr key={task} style={{ background: bg }}>
                      <td className="sticky left-0 z-10 border-b border-r border-gray-100 px-2 py-1 text-gray-700 text-xs"
                        style={{ background: bg, minWidth: 130, width: 130 }}>{task}</td>
                      {days.map(d => (
                        <td key={d} onClick={() => openPopup(task, d, false)}
                          className="group border-b border-r border-gray-100 cursor-pointer hover:bg-amber-50/60 transition-colors"
                          style={{ width: 52, minWidth: 52, height: 36, padding: 2 }}>
                          {renderCell(task, d, false)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── FOTOS TAB ── */}
      {tab === 'fotos' && (
        <div className="flex-1 overflow-y-auto p-5">
          {photosLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : roomPhotos.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ImageOff size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Ninguna habitación tiene fotos aún.</p>
              <p className="text-sm mt-1">Agrega una Habilitación con fotos desde el Calendario.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {roomPhotos.map(p => (
                <div key={p.room_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <BedDouble size={15} className="text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{p.room_id}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {p.assigned_to ?? '—'} · {fmtDateLong(p.date)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 p-3">
                    {(['dormitorio', 'bano'] as const).map(slot => {
                      const url = slot === 'dormitorio' ? p.foto_dormitorio : p.foto_bano;
                      return (
                        <div key={slot}>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                            {slot === 'dormitorio' ? 'Dormitorio' : 'Baño'}
                          </p>
                          {url ? (
                            <div className="relative rounded-xl overflow-hidden cursor-pointer group"
                              style={{ aspectRatio: '4/3' }}
                              onClick={() => setLightbox({ url, label: slot === 'dormitorio' ? 'Dormitorio' : 'Baño', room: p.room_id, date: p.date, assigned_to: p.assigned_to })}>
                              <img src={url} alt={slot} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <span className="text-white text-xs font-bold bg-black/40 px-2 py-1 rounded">Ver</span>
                                <button
                                  onClick={e => { e.stopPropagation(); deleteSlotPhoto(p, slot); }}
                                  className="text-white bg-red-500/80 hover:bg-red-600 px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                                  <Trash2 size={10} /> Borrar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl bg-gray-100 flex items-center justify-center text-gray-300" style={{ aspectRatio: '4/3' }}>
                              <ImageOff size={18} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-4 pb-3">
                    <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 text-xs text-sky-700">
                      <span className="font-semibold">Habilitada por:</span> {p.assigned_to ?? '—'}<br />
                      <span className="font-semibold">Fecha:</span> {fmtDateLong(p.date)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Popup ── */}
      {popup && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setPopup(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-80 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50 rounded-t-2xl">
                <div>
                  <h3 className="font-bold text-gray-900">{popup.rowKey}</h3>
                  <p className="text-xs text-gray-500">
                    {DAY_NAMES[new Date(year, month, popup.day).getDay()]} {popup.day} de {MONTH_NAMES[month]}
                  </p>
                </div>
                <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>

              <div className="px-5 py-4 space-y-4">
                {/* Task type */}
                {popup.isRoom && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tipo de tarea</p>
                    <div className="flex gap-2">
                      {ROOM_TASKS.map(t => (
                        <button key={t} type="button" onClick={() => setPopupTask(prev => prev === t ? null : t)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border-2 transition-all ${
                            popupTask === t
                              ? t === 'Limpieza' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-sky-500 bg-sky-500 text-white'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {t === 'Limpieza' ? '🧹 Limpieza' : '🔧 Habilitación'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Staff */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Limpiadora</p>
                    {popupStaffs.length === 2 && <span className="text-[10px] text-gray-400">👥 Juntas</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-2">Selecciona hasta 2 personas</p>
                  <div className="grid grid-cols-2 gap-2">
                    {STAFF.map(s => {
                      const sel = popupStaffs.includes(s);
                      return (
                        <button key={s} type="button" onClick={() => toggleStaff(s)}
                          className={`py-2 text-xs font-semibold rounded-xl border-2 transition-all relative ${sel ? `${STAFF_STYLE[s].btn} border-transparent` : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                          {s}
                          {sel && <span className="absolute top-0.5 right-1.5 text-[8px] opacity-60">{popupStaffs.indexOf(s) + 1}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {popupStaffs.length > 0 && (
                    <p className="text-xs text-center text-gray-500 mt-2 font-medium">{popupStaffs.join(' & ')}</p>
                  )}
                </div>

                {/* Photos — Habilitación only */}
                {popup.isRoom && popupTask === 'Habilitación' && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">📷 Fotos de la habitación</p>
                    <div className="flex gap-3">
                      <PhotoUploadSlot label="Dormitorio" currentUrl={popupCell?.foto_dormitorio ?? null} file={popupFotoDorm} onChange={setPopupFotoDorm} />
                      <PhotoUploadSlot label="Baño"       currentUrl={popupCell?.foto_bano       ?? null} file={popupFotoBano} onChange={setPopupFotoBano} />
                    </div>
                    {(popupCell?.foto_dormitorio || popupCell?.foto_bano) && !popupFotoDorm && !popupFotoBano && (
                      <p className="text-[10px] text-gray-400 mt-1.5 text-center">Toca una foto para reemplazarla</p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={async () => {
                    if (!popup || saving) return;
                    setSaving(true);
                    const key = `${toDateStr(year, month, popup.day)}|${popup.rowKey}`;
                    const ex  = taskMapRef.current[key];
                    if (ex) { await supabase.from('cleaning_tasks').delete().eq('id', ex.id); setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; }); }
                    setSaving(false); setPopup(null);
                  }}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors">
                  <Trash2 size={12} /> Borrar
                </button>
                <button onClick={savePopup} disabled={saving}
                  className="flex-1 py-2 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                  {saving ? <><Loader2 size={12} className="animate-spin" /> Subiendo...</> : '✓ Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white" onClick={() => setLightbox(null)}><X size={28} /></button>
          <div className="mb-3 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-white font-bold text-lg">{lightbox.room} — {lightbox.label}</p>
            <p className="text-white/60 text-sm">{lightbox.assigned_to ?? '—'} · {fmtDateLong(lightbox.date)}</p>
          </div>
          <img src={lightbox.url} alt={lightbox.label}
            className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()} />
          <div className="mt-3 px-4 py-2 bg-white/10 rounded-xl text-center" onClick={e => e.stopPropagation()}>
            <p className="text-white/50 text-xs">
              Registrada el {fmtDateLong(lightbox.date)} · Limpiadora: {lightbox.assigned_to ?? 'sin registrar'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
