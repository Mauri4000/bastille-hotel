import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { ChevronLeft, ChevronRight, X, Trash2, Pencil } from 'lucide-react';

// ── Staff ────────────────────────────────────────────────────────────────────
const STAFF = ['Arlet', 'Carla', 'Vicky', 'Maria'] as const;
type Staff = typeof STAFF[number];

const STAFF_STYLE: Record<Staff, { pill: string; btn: string }> = {
  Arlet: { pill: 'bg-green-100  text-green-800',  btn: 'bg-green-500  text-white' },
  Carla: { pill: 'bg-purple-100 text-purple-800', btn: 'bg-purple-500 text-white' },
  Vicky: { pill: 'bg-orange-100 text-orange-800', btn: 'bg-orange-500 text-white' },
  Maria: { pill: 'bg-blue-100   text-blue-800',   btn: 'bg-blue-500   text-white' },
};

const ROOM_TASKS = ['Limpieza', 'Habilitación'] as const;

const EXTRA_TASKS = [
  'Ordenar Baulera 1', 'Ordenar Baulera 2', 'Ordenar Baulera 3',
  'Lavado Edredon', 'Lavado Toallas',
  'Trapeado pasillos', 'Trapeado gradas',
  'Limpieza ascensor', 'Limpieza vidrios', 'Desempolvado',
  'Lavado alfombras baño', 'Limpieza Cocina', 'Limpieza Comedor',
  'Lavado Manteles', 'Lavado colchas',
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

interface CleaningRecord {
  id: string;
  date: string;
  row_key: string;
  task_type: string | null;
  assigned_to: string | null;
}

type TaskMap = Record<string, CleaningRecord>;

// ── Main component ────────────────────────────────────────────────────────────
export default function LimpiezasPage() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [rooms,   setRooms]   = useState<{ id: string; name: string }[]>([]);
  const [taskMap, setTaskMap] = useState<TaskMap>({});
  const [loading, setLoading] = useState(true);

  // Popup
  const [popup,       setPopup]       = useState<{ rowKey: string; day: number; isRoom: boolean } | null>(null);
  const [popupStaffs, setPopupStaffs] = useState<Staff[]>([]);
  const [popupTask,   setPopupTask]   = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Keep a ref to taskMap for use inside async callbacks without stale closure
  const taskMapRef = useRef<TaskMap>({});
  taskMapRef.current = taskMap;

  // ── Fetch (no loading flash after first load) ──────────────────────────────
  const fetchData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    const [{ data: roomData }, { data: taskData }] = await Promise.all([
      supabase.from('rooms').select('id, name').eq('is_active', true).order('id'),
      supabase.from('cleaning_tasks')
        .select('*')
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

  function getCell(rowKey: string, day: number): CleaningRecord | null {
    return taskMapRef.current[`${toDateStr(year, month, day)}|${rowKey}`] ?? null;
  }

  // ── Open popup ─────────────────────────────────────────────────────────────
  function openPopup(rowKey: string, day: number, isRoom: boolean) {
    const cell = getCell(rowKey, day);
    setPopupStaffs(parseStaff(cell?.assigned_to ?? null));
    setPopupTask(isRoom ? (cell?.task_type ?? null) : null);
    setPopup({ rowKey, day, isRoom });
  }

  function toggleStaff(s: Staff) {
    setPopupStaffs(prev => {
      if (prev.includes(s)) return prev.filter(x => x !== s);
      if (prev.length >= 2)  return [prev[1], s];
      return [...prev, s];
    });
  }

  // ── Save — optimistic update first, then persist to DB ────────────────────
  async function savePopup() {
    if (!popup || saving) return;
    setSaving(true);

    const date     = toDateStr(year, month, popup.day);
    const key      = `${date}|${popup.rowKey}`;
    const existing = taskMapRef.current[key];

    if (popupStaffs.length === 0) {
      // Optimistic delete
      setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
      if (existing) await supabase.from('cleaning_tasks').delete().eq('id', existing.id);
    } else {
      const payload = {
        task_type:   popup.isRoom ? popupTask : null,
        assigned_to: popupStaffs.join(' & '),
      };

      // Optimistic update — show immediately in grid
      setTaskMap(prev => ({
        ...prev,
        [key]: {
          id:          existing?.id ?? `tmp-${Date.now()}`,
          date,
          row_key:     popup.rowKey,
          task_type:   payload.task_type,
          assigned_to: payload.assigned_to,
        },
      }));

      // Persist
      if (existing) {
        const { error } = await supabase.from('cleaning_tasks').update(payload).eq('id', existing.id);
        if (error) {
          console.error('Error updating cleaning task:', error);
          alert('Error al guardar: ' + error.message);
        }
      } else {
        const { data, error } = await supabase
          .from('cleaning_tasks')
          .insert({ date, row_key: popup.rowKey, ...payload })
          .select('id')
          .single();
        if (error) {
          console.error('Error inserting cleaning task:', error);
          alert('Error al guardar: ' + error.message);
          // Revert optimistic update on failure
          setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
        } else if (data) {
          // Replace temp id with real id
          setTaskMap(prev => ({ ...prev, [key]: { ...prev[key], id: data.id } }));
        }
      }
    }

    setSaving(false);
    setPopup(null);
  }

  // ── Quick delete (from cell button, no popup needed) ───────────────────────
  async function quickDelete(rowKey: string, day: number, e: React.MouseEvent) {
    e.stopPropagation();
    const key      = `${toDateStr(year, month, day)}|${rowKey}`;
    const existing = taskMapRef.current[key];
    if (!existing) return;
    await supabase.from('cleaning_tasks').delete().eq('id', existing.id);
    setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  // ── Month nav ──────────────────────────────────────────────────────────────
  function prevMonth() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  // ── Cell renderer — plain function (NOT a React component) ──────────────────
  function renderCell(rowKey: string, day: number, isRoom: boolean) {
    const cell   = taskMap[`${toDateStr(year, month, day)}|${rowKey}`] ?? null;
    const staffs = parseStaff(cell?.assigned_to ?? null);
    const task   = cell?.task_type;

    if (staffs.length === 0) {
      return (
        <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-gray-300 text-xs font-bold">+</span>
        </div>
      );
    }

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center gap-px px-0.5">
        {/* Edit / Delete on hover */}
        <div className="absolute inset-0 flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white/80 rounded">
          <button
            onClick={e => { e.stopPropagation(); openPopup(rowKey, day, isRoom); }}
            className="p-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-600"
            title="Editar">
            <Pencil size={9} />
          </button>
          <button
            onClick={e => quickDelete(rowKey, day, e)}
            className="p-0.5 rounded bg-red-100 hover:bg-red-200 text-red-500"
            title="Borrar">
            <X size={9} />
          </button>
        </div>
        {/* Pill(s) */}
        {staffs.length === 1 ? (
          <div className={`rounded text-[9px] font-bold px-0.5 py-px leading-tight w-full text-center ${STAFF_STYLE[staffs[0]].pill}`}>
            {isRoom && task && (
              <div className="text-[7px] leading-none opacity-70">{task === 'Limpieza' ? 'L' : 'H'}</div>
            )}
            <div className="truncate">{staffs[0].slice(0, 4)}</div>
          </div>
        ) : (
          staffs.map(s => (
            <div key={s} className={`rounded text-[8px] font-bold px-0.5 leading-none py-px w-full text-center ${STAFF_STYLE[s].pill}`}>
              {s.slice(0, 3)}
            </div>
          ))
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 flex-shrink-0 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">🧹 Registro de Limpiezas</h1>
          <p className="text-sm text-gray-500">{MONTH_NAMES[month]} {year}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs" style={{ minWidth: `${130 + days.length * 52}px` }}>
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-30 bg-white border-b-2 border-r border-gray-200 px-2 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider"
                  style={{ width: 130, minWidth: 130 }}>
                  HAB / TAREA
                </th>
                {days.map(d => {
                  const dow       = new Date(year, month, d).getDay();
                  const isToday   = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={d} style={{ width: 52, minWidth: 52 }}
                      className={`border-b-2 border-r border-gray-200 py-1 text-center ${isToday ? 'bg-amber-50 text-amber-700' : isWeekend ? 'bg-gray-50 text-gray-400' : 'text-gray-500'}`}>
                      <div className="text-[8px] leading-none">{DAY_NAMES[dow]}</div>
                      <div className="text-sm font-bold leading-snug">{d}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* Room rows */}
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
                      <td key={d}
                        onClick={() => openPopup(room.id, d, true)}
                        className="group border-b border-r border-gray-100 cursor-pointer hover:bg-amber-50/60 transition-colors"
                        style={{ width: 52, minWidth: 52, height: 36, padding: 2 }}>
                        {renderCell(room.id, d, true)}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Divider */}
              <tr>
                <td colSpan={days.length + 1}
                  className="bg-gray-200 border-y border-gray-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  🧺 Tareas Generales
                </td>
              </tr>

              {/* Extra rows */}
              {EXTRA_TASKS.map((task, idx) => {
                const bg = idx % 2 !== 0 ? 'rgb(249,250,251)' : 'white';
                return (
                  <tr key={task} style={{ background: bg }}>
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 px-2 py-1 text-gray-700 text-xs"
                      style={{ background: bg, minWidth: 130, width: 130 }}>
                      {task}
                    </td>
                    {days.map(d => (
                      <td key={d}
                        onClick={() => openPopup(task, d, false)}
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
      )}

      {/* ── Popup ── */}
      {popup && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setPopup(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-80">

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
                        <button key={t} type="button"
                          onClick={() => setPopupTask(prev => prev === t ? null : t)}
                          className={`flex-1 py-2 text-xs font-semibold rounded-xl border-2 transition-all ${
                            popupTask === t
                              ? t === 'Limpieza'
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-sky-500 bg-sky-500 text-white'
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
                    {popupStaffs.length === 2 && (
                      <span className="text-[10px] text-gray-400">👥 Juntas</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mb-2">Selecciona hasta 2 personas</p>
                  <div className="grid grid-cols-2 gap-2">
                    {STAFF.map(s => {
                      const selected = popupStaffs.includes(s);
                      return (
                        <button key={s} type="button"
                          onClick={() => toggleStaff(s)}
                          className={`py-2 text-xs font-semibold rounded-xl border-2 transition-all relative ${
                            selected
                              ? `${STAFF_STYLE[s].btn} border-transparent`
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}>
                          {s}
                          {selected && <span className="absolute top-0.5 right-1.5 text-[8px] opacity-60">{popupStaffs.indexOf(s) + 1}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {popupStaffs.length > 0 && (
                    <p className="text-xs text-center text-gray-500 mt-2 font-medium">{popupStaffs.join(' & ')}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
                <button
                  onClick={async () => {
                    if (!popup || saving) return;
                    setSaving(true);
                    const key = `${toDateStr(year, month, popup.day)}|${popup.rowKey}`;
                    const existing = taskMapRef.current[key];
                    if (existing) {
                      await supabase.from('cleaning_tasks').delete().eq('id', existing.id);
                      setTaskMap(prev => { const n = { ...prev }; delete n[key]; return n; });
                    }
                    setSaving(false);
                    setPopup(null);
                  }}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-500 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors">
                  <Trash2 size={12} /> Borrar
                </button>
                <button onClick={savePopup} disabled={saving}
                  className="flex-1 py-2 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-xl disabled:opacity-50 transition-colors">
                  {saving ? 'Guardando...' : '✓ Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
