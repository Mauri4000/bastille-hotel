import { useEffect, useState, useCallback } from 'react';
import { Droplets, AlertTriangle, Building2, PawPrint, RefreshCw, BedDouble } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Reservation } from '../types';

interface HabUrgente {
  hab: Reservation;         // habilitación activa
  nextRes: Reservation | null; // siguiente reserva en esa habitación
}

function arrivalPriority(arrivalTime: string | null): 'alta' | 'media' | 'baja' {
  if (!arrivalTime) return 'baja';
  const [h, m] = arrivalTime.split(':').map(Number);
  const mins = h * 60 + m;
  if (mins < 8 * 60) return 'alta';
  if (mins < 12 * 60) return 'media';
  return 'baja';
}

interface AguaState {
  is_closed: boolean;
  closed_at: string | null;
}

function daysSince(isoString: string): number {
  return Math.floor((Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
}

// "2026-09-08" → "8 sep"
function shortDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-BO', { day: 'numeric', month: 'short' });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuth();
  const isMarketing = profile?.role === 'marketing';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
  const in14Str = in14.toISOString().split('T')[0];

  const [agua,        setAgua]        = useState<AguaState>({ is_closed: false, closed_at: null });
  const [aguaLoading, setAguaLoading] = useState(false);
  const [empresas,    setEmpresas]    = useState<Reservation[]>([]);
  const [perros,      setPerros]      = useState<Reservation[]>([]);
  const [habUrgentes, setHabUrgentes] = useState<HabUrgente[]>([]);
  const [loading,     setLoading]     = useState(true);

  const isTuesday = today.getDay() === 2;

  const load = useCallback(async () => {
    setLoading(true);

    const { data: aguaRow } = await supabase
      .from('hotel_settings').select('value').eq('key', 'agua_comercial').maybeSingle();
    if (aguaRow?.value) setAgua(aguaRow.value as AguaState);

    const { data: empData } = await supabase
      .from('reservations').select('*, empresa_name')
      .lte('check_in', in14Str).gt('check_out', todayStr)
      .eq('is_empresa', true).in('status', ['ocupado', 'reserva']).order('check_in');
    setEmpresas(empData ?? []);

    const { data: petData } = await supabase
      .from('reservations').select('*')
      .lte('check_in', in14Str).gt('check_out', todayStr)
      .eq('has_pet', true).in('status', ['ocupado', 'reserva']).order('check_in');
    setPerros(petData ?? []);

    // Habilitaciones activas hoy
    const { data: habData } = await supabase
      .from('reservations').select('*')
      .eq('status', 'habilitacion')
      .lte('check_in', todayStr).gt('check_out', todayStr);
    const habs = (habData ?? []) as Reservation[];

    if (habs.length > 0) {
      const tomorrowStr = new Date(new Date(todayStr + 'T00:00:00').getTime() + 86400000)
        .toISOString().split('T')[0];
      const roomIds = habs.map(h => h.room_id);
      // Fetch next reservations for those rooms (arriving tomorrow or after)
      const { data: nextData } = await supabase
        .from('reservations')
        .select('*')
        .in('room_id', roomIds)
        .in('status', ['reserva', 'ocupado'])
        .gte('check_in', tomorrowStr)
        .order('check_in');
      const nextMap: Record<string, Reservation> = {};
      for (const r of (nextData ?? []) as Reservation[]) {
        if (!nextMap[r.room_id]) nextMap[r.room_id] = r;
      }
      const urgentes: HabUrgente[] = habs.map(h => ({ hab: h, nextRes: nextMap[h.room_id] ?? null }));
      // Sort: alta → media → baja
      const order = { alta: 0, media: 1, baja: 2 };
      urgentes.sort((a, b) => {
        const pa = order[arrivalPriority((a.nextRes as any)?.arrival_time ?? null)];
        const pb = order[arrivalPriority((b.nextRes as any)?.arrival_time ?? null)];
        return pa - pb;
      });
      setHabUrgentes(urgentes);
    } else {
      setHabUrgentes([]);
    }

    setLoading(false);
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  async function toggleAgua() {
    setAguaLoading(true);
    const newState: AguaState = agua.is_closed
      ? { is_closed: false, closed_at: null }
      : { is_closed: true, closed_at: new Date().toISOString() };
    await supabase.from('hotel_settings').upsert({ key: 'agua_comercial', value: newState, updated_at: new Date().toISOString() });
    setAgua(newState);
    setAguaLoading(false);
  }

  const daysClosed = agua.is_closed && agua.closed_at ? daysSince(agua.closed_at) : 0;
  const tankAlert  = agua.is_closed && daysClosed >= 7;
  const greet      = today.getHours() < 12 ? 'Buenos días' : today.getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Greeting ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {greet}, {profile?.name ?? 'bienvenido'} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">
            {today.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
          <RefreshCw size={12} /> Actualizar
        </button>
      </div>

      {/* ── MARTES: Imprimir partes diarias ── */}
      {isTuesday && (
        <div className="flex items-center gap-4 bg-red-600 text-white rounded-xl px-5 py-4 shadow-lg animate-pulse">
          <span className="text-2xl">🚨</span>
          <div className="flex-1">
            <p className="font-extrabold text-base tracking-wide">IMPRIMIR PARTES DIARIAS</p>
            <p className="text-sm font-bold opacity-90 mt-0.5">🔔 AVISAR A LIZZ QUE IMPRIMA 🔔</p>
          </div>
          <span className="text-2xl">🚨</span>
        </div>
      )}

      {/* ── Habilitaciones urgentes ── */}
      {!isMarketing && habUrgentes.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
              <BedDouble size={16} className="text-cyan-600" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Habilitaciones pendientes</span>
            <span className="ml-auto bg-cyan-100 text-cyan-700 text-xs font-bold px-2 py-0.5 rounded-full">{habUrgentes.length}</span>
          </div>
          <div className="space-y-2">
            {habUrgentes.map(({ hab, nextRes }) => {
              const arrTime = (nextRes as any)?.arrival_time ?? null;
              const prio = arrivalPriority(arrTime);
              const prioCfg = {
                alta:  { bg: 'bg-red-50 border-red-300',    badge: 'bg-red-500 text-white',      label: '🔴 URGENTE',    icon: '⚡' },
                media: { bg: 'bg-amber-50 border-amber-300', badge: 'bg-amber-400 text-white',    label: '🟡 PRIORITARIO', icon: '⏰' },
                baja:  { bg: 'bg-gray-50 border-gray-200',   badge: 'bg-gray-400 text-white',     label: '🟢 NORMAL',      icon: '🧹' },
              }[prio];
              return (
                <div key={hab.id} className={`rounded-lg px-3 py-2.5 border ${prioCfg.bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${prioCfg.badge}`}>{hab.room_id}</span>
                    <span className="text-xs font-bold text-gray-700">{prioCfg.label}</span>
                    {arrTime && (
                      <span className="ml-auto text-xs font-bold text-gray-600">
                        {prioCfg.icon} próx. llegada {arrTime.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {nextRes && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {nextRes.guest_name} · entra {new Date(nextRes.check_in + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </p>
                  )}
                  {!nextRes && (
                    <p className="text-xs text-gray-400 mt-1">Sin reserva próxima registrada</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Tank alert ── */}
      {!isMarketing && tankAlert && (
        <div className="flex items-center gap-3 bg-red-500 text-white rounded-xl px-5 py-4 shadow-lg animate-pulse">
          <AlertTriangle size={22} className="flex-shrink-0" />
          <span className="font-bold">⚠️ REVISAR NIVEL DEL TANQUE DE AGUA!</span>
          <span className="ml-auto text-sm opacity-90">{daysClosed} días sin agua comercial</span>
        </div>
      )}

      {/* ── 3 panels side by side (2 for marketing: no agua) ── */}
      <div className={`grid grid-cols-1 gap-4 items-start ${isMarketing ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>

        {/* AGUA — hidden for marketing */}
        {!isMarketing && (
        <div className={`rounded-xl border shadow-sm p-4 ${agua.is_closed ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${agua.is_closed ? 'bg-red-100' : 'bg-blue-100'}`}>
              <Droplets size={16} className={agua.is_closed ? 'text-red-500' : 'text-blue-500'} />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Agua Comercial</span>
          </div>

          {agua.is_closed ? (
            <div className="mb-3">
              <p className="font-bold text-red-700 text-sm">
                Cerrada — {daysClosed === 0 ? 'hoy' : `hace ${daysClosed} día${daysClosed !== 1 ? 's' : ''}`}
              </p>
              {agua.closed_at && (
                <p className="text-xs text-red-500 mt-0.5">Desde {fmtDate(agua.closed_at)}</p>
              )}
            </div>
          ) : (
            <p className="font-bold text-blue-700 text-sm mb-3">Llave abierta ✓</p>
          )}

          <button onClick={toggleAgua} disabled={aguaLoading}
            className={`w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 ${
              agua.is_closed ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-red-500 hover:bg-red-400 text-white'
            }`}>
            {aguaLoading ? '...' : agua.is_closed ? '✓ Abrir llave' : '🔒 Cerrar llave'}
          </button>
        </div>
        )}

        {/* EMPRESAS */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Building2 size={16} className="text-indigo-600" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Empresas</span>
            {empresas.length > 0 && (
              <span className="ml-auto bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">{empresas.length}</span>
            )}
          </div>

          {empresas.length === 0 ? (
            <p className="text-sm text-gray-400">Ninguna en los próximos 14 días.</p>
          ) : (
            <div className="space-y-2">
              {empresas.map(res => {
                const isHoy = res.check_in <= todayStr && res.check_out > todayStr;
                const entra = shortDate(res.check_in);
                const sale  = shortDate(res.check_out);
                return (
                  <div key={res.id} className={`rounded-lg px-3 py-2.5 ${isHoy ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isHoy ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-700'}`}>{res.room_id}</span>
                      {isHoy
                        ? <span className="text-[10px] font-bold text-indigo-600">HOSPEDADO HOY</span>
                        : <span className="text-[10px] text-gray-400">llega {entra} · sale {sale}</span>
                      }
                    </div>
                    {(res as any).empresa_name && (
                      <p className="text-sm font-bold text-indigo-900 truncate">{(res as any).empresa_name}</p>
                    )}
                    <p className="text-xs text-gray-500 truncate">{res.guest_name}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PERROS */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <PawPrint size={16} className="text-orange-600" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Mascotas</span>
            {perros.length > 0 && (
              <span className="ml-auto bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{perros.length}</span>
            )}
          </div>

          {perros.length === 0 ? (
            <p className="text-sm text-gray-400">Ninguna en los próximos 14 días.</p>
          ) : (
            <div className="space-y-2">
              {perros.map(res => {
                const isHoy = res.check_in <= todayStr && res.check_out > todayStr;
                const entra = shortDate(res.check_in);
                const sale  = shortDate(res.check_out);
                return (
                  <div key={res.id} className={`rounded-lg px-3 py-2.5 ${isHoy ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${isHoy ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-700'}`}>{res.room_id}</span>
                      {isHoy
                        ? <span className="text-[10px] font-bold text-orange-600">🐾 HOSPEDADO HOY</span>
                        : <span className="text-[10px] text-gray-400">llega {entra} · sale {sale}</span>
                      }
                    </div>
                    <p className="text-sm font-semibold text-gray-800 truncate">{res.guest_name}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
