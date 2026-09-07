import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, RefreshCw, BedDouble, ImageOff } from 'lucide-react';

interface RoomPhoto {
  room_id: string;
  date: string;
  assigned_to: string | null;
  foto_dormitorio: string | null;
  foto_bano: string | null;
  task_id: string;
}

interface Lightbox {
  url: string;
  label: string;
  room: string;
  date: string;
  assigned_to: string | null;
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-BO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// Add cache-bust param so browser refetches overwritten storage files
function bustCache(url: string | null) {
  if (!url) return null;
  // Only add if not already there
  if (url.includes('?t=')) return url;
  return url + `?t=${Date.now()}`;
}

export default function FotosHabitacionesPage() {
  const [photos,  setPhotos]  = useState<RoomPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lb,      setLb]      = useState<Lightbox | null>(null);

  async function load() {
    setLoading(true);
    // Fetch all habilitación records that have at least one photo, newest first
    const { data } = await supabase
      .from('cleaning_tasks')
      .select('id, date, row_key, assigned_to, foto_dormitorio, foto_bano')
      .eq('task_type', 'Habilitación')
      .not('foto_dormitorio', 'is', null)   // at least dormitorio
      .order('date', { ascending: false });

    if (!data) { setLoading(false); return; }

    // Deduplicate: keep only the latest record per room
    const seen = new Set<string>();
    const latest: RoomPhoto[] = [];
    for (const row of data) {
      if (!seen.has(row.row_key)) {
        seen.add(row.row_key);
        latest.push({
          room_id:         row.row_key,
          date:            row.date,
          assigned_to:     row.assigned_to,
          foto_dormitorio: row.foto_dormitorio,
          foto_bano:       row.foto_bano,
          task_id:         row.id,
        });
      }
    }
    // Sort by room id alphabetically
    latest.sort((a, b) => a.room_id.localeCompare(b.room_id));
    setPhotos(latest);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">📷 Control de Fotos — Habitaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Última habilitación registrada por habitación</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ImageOff size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Ninguna habitación tiene fotos guardadas aún.</p>
          <p className="text-sm mt-1">Agrega una Habilitación con fotos desde el Registro de Limpiezas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {photos.map(p => (
            <div key={p.room_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Room header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                  <BedDouble size={15} className="text-sky-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 text-sm">{p.room_id}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {p.assigned_to ?? '—'} · {formatDate(p.date)}
                  </p>
                </div>
              </div>

              {/* Photos */}
              <div className="grid grid-cols-2 gap-2 p-3">

                {/* Dormitorio */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Dormitorio</p>
                  {p.foto_dormitorio ? (
                    <div
                      className="relative rounded-xl overflow-hidden cursor-pointer group"
                      style={{ aspectRatio: '4/3' }}
                      onClick={() => setLb({ url: bustCache(p.foto_dormitorio)!, label: 'Dormitorio', room: p.room_id, date: p.date, assigned_to: p.assigned_to })}>
                      <img
                        src={bustCache(p.foto_dormitorio)!}
                        alt="Dormitorio"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-black/40 px-2 py-1 rounded">Ver</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-100 flex items-center justify-center text-gray-300" style={{ aspectRatio: '4/3' }}>
                      <ImageOff size={18} />
                    </div>
                  )}
                </div>

                {/* Baño */}
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Baño</p>
                  {p.foto_bano ? (
                    <div
                      className="relative rounded-xl overflow-hidden cursor-pointer group"
                      style={{ aspectRatio: '4/3' }}
                      onClick={() => setLb({ url: bustCache(p.foto_bano)!, label: 'Baño', room: p.room_id, date: p.date, assigned_to: p.assigned_to })}>
                      <img
                        src={bustCache(p.foto_bano)!}
                        alt="Baño"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-bold bg-black/40 px-2 py-1 rounded">Ver</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-100 flex items-center justify-center text-gray-300" style={{ aspectRatio: '4/3' }}>
                      <ImageOff size={18} />
                    </div>
                  )}
                </div>
              </div>

              {/* Footer detail */}
              <div className="px-4 pb-3">
                <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 text-xs text-sky-700">
                  <span className="font-semibold">Habilitada por:</span> {p.assigned_to ?? '—'}<br/>
                  <span className="font-semibold">Fecha:</span> {formatDate(p.date)}<br/>
                  <span className="text-[10px] text-sky-400 mt-0.5 block">
                    Esta foto se reemplazará automáticamente en la próxima habilitación
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lb && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setLb(null)}>
          <button
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
            onClick={() => setLb(null)}>
            <X size={28} />
          </button>

          {/* Details banner */}
          <div className="mb-3 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-white font-bold text-lg">{lb.room} — {lb.label}</p>
            <p className="text-white/60 text-sm">
              {lb.assigned_to ?? '—'} · {formatDate(lb.date)}
            </p>
          </div>

          <img
            src={lb.url}
            alt={lb.label}
            className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
          />

          {/* Timestamp watermark */}
          <div className="mt-3 px-4 py-2 bg-white/10 rounded-xl text-center" onClick={e => e.stopPropagation()}>
            <p className="text-white/50 text-xs">
              Foto registrada el {formatDate(lb.date)} · Limpiadora: {lb.assigned_to ?? 'sin registrar'}
            </p>
            <p className="text-white/30 text-[10px] mt-0.5">
              Esta imagen está guardada en el sistema con fecha y camarera registradas
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
