import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, PawPrint, RefreshCw, ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Reservation } from '../types';

interface VitrinaProduct {
  id: string;
  name: string;
  quantity: number;
  expiration_date: string | null;
  expiry_notes: string | null;
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
  const navigate = useNavigate();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const in14 = new Date(today); in14.setDate(in14.getDate() + 14);
  const in14Str = in14.toISOString().split('T')[0];

  const [empresas,    setEmpresas]    = useState<Reservation[]>([]);
  const [perros,      setPerros]      = useState<Reservation[]>([]);
  const [vitAlerts,   setVitAlerts]   = useState<{ lowStock: VitrinaProduct[]; expiring: VitrinaProduct[] }>({ lowStock: [], expiring: [] });
  const [loading,     setLoading]     = useState(true);
  const [hiddenIds,   setHiddenIds]   = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('vitrina_hidden') ?? '[]')); } catch { return new Set(); }
  });

  function toggleHide(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem('vitrina_hidden', JSON.stringify([...next]));
      return next;
    });
  }

  const isTuesday = today.getDay() === 2;

  const load = useCallback(async () => {
    setLoading(true);

    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().split('T')[0];

    const [
      { data: empData },
      { data: petData },
      { data: vitData },
    ] = await Promise.all([
      supabase.from('reservations')
        .select('id,room_id,guest_name,check_in,check_out,status,is_empresa,empresa_name,num_guests')
        .lte('check_in', in14Str).gt('check_out', todayStr)
        .eq('is_empresa', true).in('status', ['ocupado', 'reserva']).order('check_in'),
      supabase.from('reservations')
        .select('id,room_id,guest_name,check_in,check_out,status,has_pet,num_guests')
        .lte('check_in', in14Str).gt('check_out', todayStr)
        .eq('has_pet', true).in('status', ['ocupado', 'reserva']).order('check_in'),
      supabase.from('vitrina_products').select('id,name,quantity,expiration_date,expiry_notes').order('name'),
    ]);

    setEmpresas((empData ?? []) as unknown as Reservation[]);
    setPerros((petData ?? []) as unknown as Reservation[]);

    const vits = (vitData ?? []) as VitrinaProduct[];
    setVitAlerts({
      lowStock: vits.filter(v => v.quantity === 0),
      expiring: vits.filter(v => v.expiration_date && v.expiration_date <= in30Str),
    });

    setLoading(false);
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

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
            <p className="text-sm font-bold opacity-90 mt-0.5">🔔 AVISAR A MAURI QUE IMPRIMA 🔔</p>
          </div>
          <span className="text-2xl">🚨</span>
        </div>
      )}



{/* ── Vitrina alerts ── */}
      {!isMarketing && (vitAlerts.lowStock.length > 0 || vitAlerts.expiring.length > 0) && (() => {
        const visibleLow  = vitAlerts.lowStock.filter(p => !hiddenIds.has(p.id));
        const hiddenLow   = vitAlerts.lowStock.filter(p =>  hiddenIds.has(p.id));
        const visibleExp  = vitAlerts.expiring.filter(p => !hiddenIds.has(p.id));
        const hiddenExp   = vitAlerts.expiring.filter(p =>  hiddenIds.has(p.id));
        const shoppingList = visibleLow.map(p => p.name);
        const totalHidden = hiddenLow.length + hiddenExp.length;
        return (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <ShoppingBag size={16} className="text-gray-500" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Vitrina — Alertas</span>
              <span className="ml-auto bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">
                {vitAlerts.lowStock.length + vitAlerts.expiring.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left: pills con ocultar */}
              <div className="space-y-3">
                {visibleLow.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Agotados</p>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleLow.map(p => (
                        <div key={p.id} className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-full pr-1">
                          <button onClick={() => navigate('/admin/vitrina', { state: { highlightId: p.id } })}
                            className="text-[11px] font-semibold text-gray-700 px-2.5 py-0.5 hover:text-gray-900 transition-colors whitespace-nowrap">
                            {p.name}
                          </button>
                          <button onClick={() => toggleHide(p.id)} title="Ocultar alerta"
                            className="text-gray-300 hover:text-gray-500 transition-colors text-xs leading-none pb-px">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {visibleExp.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1.5">Vencimiento próximo (30 días)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleExp.map(p => {
                        const daysLeft = Math.ceil((new Date(p.expiration_date! + 'T12:00:00').getTime() - today.getTime()) / 86400000);
                        return (
                          <div key={p.id} className="flex items-center gap-0.5 bg-amber-50 border border-amber-200 rounded-full pr-1">
                            <button onClick={() => navigate('/admin/vitrina', { state: { highlightId: p.id } })}
                              className="text-[11px] font-semibold text-amber-700 px-2.5 py-0.5 hover:text-amber-900 transition-colors whitespace-nowrap">
                              {p.name} · {daysLeft <= 0 ? 'VENCIDO' : `${daysLeft}d`}
                            </button>
                            <button onClick={() => toggleHide(p.id)} title="Ocultar alerta"
                              className="text-amber-300 hover:text-amber-500 transition-colors text-xs leading-none pb-px">✕</button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {totalHidden > 0 && (
                  <button onClick={() => { setHiddenIds(new Set()); localStorage.removeItem('vitrina_hidden'); }}
                    className="text-[10px] text-gray-400 hover:text-gray-600 underline transition-colors">
                    Mostrar {totalHidden} oculto{totalHidden !== 1 ? 's' : ''}
                  </button>
                )}
              </div>

              {/* Right: lista de compras */}
              {shoppingList.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">🛒 Lista de compras</p>
                  <ol className="space-y-1">
                    {shoppingList.map((name, i) => (
                      <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5">
                        <span className="font-bold text-gray-400 w-4 shrink-0">{i + 1}.</span>
                        <span>{name}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Marketing: TikTok reminder when empresas exist ── */}
      {isMarketing && empresas.length > 0 && (
        <div className="flex items-center justify-center gap-3 bg-red-600 text-white rounded-xl px-5 py-3 shadow-lg animate-pulse">
          <span className="text-xl">🚨</span>
          <p className="font-extrabold text-sm tracking-wide text-center">
            Lau, no olvides gestionar los TikToks con los huéspedes empresas
          </p>
          <span className="text-xl">🚨</span>
        </div>
      )}

      {/* ── 2 panels side by side ── */}
      <div className="grid grid-cols-1 gap-4 items-start md:grid-cols-2">

        {/* EMPRESAS */}
        <div data-testid="stat-card-empresas" className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
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
            <div className="grid grid-cols-2 gap-2">
              {empresas.map(res => {
                const isHoy = res.check_in <= todayStr && res.check_out > todayStr;
                const entra = shortDate(res.check_in);
                const sale  = shortDate(res.check_out);
                return (
                  <div key={res.id} className={`rounded-lg px-2.5 py-2 ${isHoy ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isHoy ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-700'}`}>{res.room_id}</span>
                      {isHoy
                        ? <span className="text-[9px] font-bold text-indigo-600">HOY</span>
                        : <span className="text-[9px] text-gray-400">{entra}→{sale}</span>
                      }
                    </div>
                    {(res as any).empresa_name && (
                      <p className="text-xs font-bold text-indigo-900 truncate leading-tight">{(res as any).empresa_name}</p>
                    )}
                    <p className="text-[10px] text-gray-500 truncate">{res.guest_name}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PERROS */}
        <div data-testid="stat-card-mascotas" className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
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
                    {(res as any).pet_name ? (
                      <p className="text-xs font-bold text-orange-600 mt-0.5">🐾 {(res as any).pet_name}</p>
                    ) : (
                      <p className="text-[10px] text-red-400 italic mt-0.5 animate-pulse">Preguntar nombre de mascota para TikTok 🎵</p>
                    )}
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
