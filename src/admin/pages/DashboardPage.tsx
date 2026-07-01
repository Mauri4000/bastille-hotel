import { useEffect, useState } from 'react';
import { CalendarDays, Wallet, BedDouble, TrendingUp, TrendingDown, PawPrint, Building2, Globe } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Reservation, Room } from '../types';
import { STATUS_CONFIG } from '../constants';

// ── Donut chart ──────────────────────────────────────────────────────────────
interface Segment { label: string; value: number; color: string }
function DonutChart({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((s, g) => s + g.value, 0);
  if (total === 0) return (
    <div className="flex flex-col items-center justify-center h-32 text-gray-300 text-xs">Sin datos</div>
  );
  const r = 44; const cx = 56; const cy = 56; const circ = 2 * Math.PI * r;
  let cumulative = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width={112} height={112} className="-rotate-90">
          {segments.filter(s => s.value > 0).map((seg, i) => {
            const dash = (seg.value / total) * circ;
            const offset = -(cumulative / total) * circ;
            cumulative += seg.value;
            return <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={seg.color} strokeWidth={18}
              strokeDasharray={`${dash} ${circ}`} strokeDashoffset={offset}
              strokeLinecap="butt" />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-gray-800">{total}</span>
          <span className="text-[10px] text-gray-400">{label}</span>
        </div>
      </div>
      <div className="space-y-1 w-full px-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
              <span className="text-gray-600 truncate max-w-[100px]">{seg.label}</span>
            </div>
            <span className="font-semibold text-gray-700">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }: {
  icon: any; iconBg: string; iconColor: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={16} className={iconColor} />
        </div>
        <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const firstDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;

  const [rooms,          setRooms]          = useState<Room[]>([]);
  const [occupied,       setOccupied]       = useState<Reservation[]>([]);
  const [dirty,          setDirty]          = useState<Reservation[]>([]);
  const [cajaMayor,      setCajaMayor]      = useState(0);
  const [cajaChica,      setCajaChica]      = useState(0);
  const [monthIncome,    setMonthIncome]    = useState(0);
  const [monthEgreso,    setMonthEgreso]    = useState(0);
  const [retirosSonia,   setRetirosSonia]   = useState(0);
  const [nationalities,  setNationalities]  = useState<Segment[]>([]);
  const [petCount,       setPetCount]       = useState(0);
  const [empresaCount,   setEmpresaCount]   = useState(0);
  const [utilities,      setUtilities]      = useState<Segment[]>([]);
  const [loading,        setLoading]        = useState(true);

  const PALETTE = ['#f59e0b','#3b82f6','#10b981','#8b5cf6','#ef4444','#06b6d4','#f97316','#84cc16'];

  useEffect(() => {
    async function load() {
      // 0. All rooms
      const { data: roomsData } = await supabase.from('rooms').select('*').eq('is_active', true).neq('id', 'SALON');
      setRooms(roomsData ?? []);

      // 1. Occupied rooms today
      const { data: resData } = await supabase.from('reservations').select('*')
        .lte('check_in', todayStr).gt('check_out', todayStr)
        .in('status', ['ocupado', 'reserva']);
      setOccupied(resData ?? []);

      // 2. Dirty rooms (habilitacion) today
      const { data: dirtyData } = await supabase.from('reservations').select('*')
        .lte('check_in', todayStr).gt('check_out', todayStr)
        .eq('status', 'habilitacion');
      setDirty(dirtyData ?? []);

      // 3. Caja Mayor balance (all time)
      const { data: cmData } = await supabase.from('transactions').select('type,amount')
        .eq('caja', 'CAJA MAYOR');
      const cmBalance = (cmData ?? []).reduce((s, t) =>
        s + (t.type === 'ingreso' ? t.amount : -t.amount), 0);
      setCajaMayor(cmBalance);

      // 4. Caja Chica last balance
      const { data: ccData } = await supabase.from('petty_cash').select('balance')
        .order('date', { ascending: false }).order('created_at', { ascending: false })
        .limit(1).single();
      setCajaChica(ccData?.balance ?? 0);

      if (isAdmin) {
        // 5. Monthly transactions
        const { data: txData } = await supabase.from('transactions').select('type,amount,category')
          .gte('date', firstDay).lte('date', todayStr);
        const sonia   = (txData ?? []).filter(t => t.category === 'RETIROS DOÑA SONIA').reduce((s,t) => s + t.amount, 0);
        const income  = (txData ?? []).filter(t => t.type === 'ingreso').reduce((s,t) => s + t.amount, 0);
        const egreso  = (txData ?? []).filter(t => t.type === 'egreso' && t.category !== 'RETIROS DOÑA SONIA').reduce((s,t) => s + t.amount, 0);
        setMonthIncome(income + sonia);
        setMonthEgreso(egreso);
        setRetirosSonia(sonia);

        // 6. Utilities (agua, gas, luz) — all time
        const { data: utilData } = await supabase.from('transactions').select('amount,category')
          .in('category', ['B03-AGUA', 'B03-GAS', 'B03-LUZ', 'B03-SERVICIOS BÁSICOS'])
          .eq('type', 'egreso');
        const utilMap: Record<string, number> = {};
        (utilData ?? []).forEach(t => { utilMap[t.category] = (utilMap[t.category] ?? 0) + t.amount; });
        setUtilities([
          { label: 'Agua',     value: Math.round(utilMap['B03-AGUA'] ?? 0),             color: '#3b82f6' },
          { label: 'Gas',      value: Math.round(utilMap['B03-GAS'] ?? 0),              color: '#f97316' },
          { label: 'Luz',      value: Math.round(utilMap['B03-LUZ'] ?? 0),              color: '#f59e0b' },
          { label: 'Servicios',value: Math.round(utilMap['B03-SERVICIOS BÁSICOS'] ?? 0),color: '#8b5cf6' },
        ]);

        // 7. Nationalities from reservations (last 90 days)
        const since90 = new Date(); since90.setDate(since90.getDate() - 90);
        const { data: natData } = await supabase.from('reservations').select('guest_country')
          .gte('check_in', since90.toISOString().split('T')[0])
          .not('guest_country', 'is', null).neq('guest_country', '');
        const natMap: Record<string, number> = {};
        (natData ?? []).forEach(r => { const c = r.guest_country!; natMap[c] = (natMap[c] ?? 0) + 1; });
        const sorted = Object.entries(natMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
        setNationalities(sorted.map(([label, value], i) => ({ label, value, color: PALETTE[i] })));

        // 8. Pets & empresas (last 90 days)
        const { data: petData } = await supabase.from('reservations').select('id', { count: 'exact' })
          .gte('check_in', since90.toISOString().split('T')[0]).eq('has_pet', true);
        setPetCount(petData?.length ?? 0);
        const { data: empData } = await supabase.from('reservations').select('id', { count: 'exact' })
          .gte('check_in', since90.toISOString().split('T')[0]).eq('is_empresa', true);
        setEmpresaCount(empData?.length ?? 0);
      }

      setLoading(false);
    }
    load();
  }, [isAdmin]); // eslint-disable-line

  const totalGuests   = occupied.filter(r => r.room_id !== 'SALON').reduce((s, r) => s + r.num_guests, 0); void totalGuests;
  const busyRoomIds   = new Set([...occupied, ...dirty].map(r => r.room_id));
  const freeRooms     = rooms.filter(r => !busyRoomIds.has(r.id));
  const month = today.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Buen día, {profile?.name ?? 'bienvenido'} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {today.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* ── ROOM STATUS GRID (top) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Ocupadas */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CalendarDays size={16} className="text-green-600" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Ocupadas</span>
            <span className="ml-auto text-2xl font-bold text-gray-900">{occupied.length}</span>
          </div>
          {occupied.length === 0
            ? <p className="text-sm text-gray-400">Ninguna habitación ocupada hoy.</p>
            : <div className="space-y-2">
                {occupied.map(res => {
                  const cfg = STATUS_CONFIG[res.status];
                  return (
                    <div key={res.id} className={`rounded-lg px-3 py-2.5 ${cfg.bg} ${cfg.text}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm">{res.room_id}</span>
                        <span className="text-[11px] opacity-80">{res.num_guests} 👤</span>
                      </div>
                      <div className="text-xs font-medium mt-0.5 truncate opacity-90">{res.guest_name}</div>
                      <div className="text-[11px] opacity-70 mt-0.5">hasta {res.check_out}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {res.is_empresa    && <span className="text-[10px] bg-white/30 rounded px-1">🏢</span>}
                        {res.has_pet       && <span className="text-[10px] bg-white/30 rounded px-1">🐾</span>}
                        {res.wants_invoice && <span className="text-[10px] bg-white/30 rounded px-1">📄</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>

        {/* Habilitaciones */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <BedDouble size={16} className="text-blue-500" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Habilitación</span>
            <span className="ml-auto text-2xl font-bold text-gray-900">{dirty.length}</span>
          </div>
          {dirty.length === 0
            ? <p className="text-sm text-gray-400">No hay habitaciones en habilitación.</p>
            : <div className="space-y-2">
                {dirty.map(res => (
                  <div key={res.id} className="rounded-lg px-3 py-2.5 bg-blue-400 text-white">
                    <span className="font-bold text-sm">{res.room_id}</span>
                    <div className="text-xs opacity-80 mt-0.5">pendiente de limpieza</div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/* Libres */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <BedDouble size={16} className="text-gray-400" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Libres</span>
            <span className="ml-auto text-2xl font-bold text-gray-900">{freeRooms.length}</span>
          </div>
          {freeRooms.length === 0
            ? <p className="text-sm text-gray-400">No hay habitaciones libres hoy.</p>
            : <div className="flex flex-wrap gap-2">
                {freeRooms.map(room => (
                  <div key={room.id} className="rounded-lg px-3 py-2 bg-gray-50 border border-gray-200 text-center min-w-[60px]">
                    <div className="font-bold text-sm text-gray-700">{room.id}</div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[80px]">{room.type.split('/')[0]}</div>
                  </div>
                ))}
              </div>
          }
        </div>

      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Wallet} iconBg="bg-amber-100" iconColor="text-amber-600"
          label="Caja Mayor" value={`Bs. ${cajaMayor.toFixed(0)}`} sub="saldo acumulado" />
        <StatCard icon={Wallet} iconBg="bg-purple-100" iconColor="text-purple-600"
          label="Caja Chica" value={`Bs. ${cajaChica.toFixed(0)}`} sub="saldo actual" />

        {isAdmin && (<>
          <StatCard icon={TrendingUp} iconBg="bg-emerald-100" iconColor="text-emerald-600"
            label="Ingresos" value={`Bs. ${monthIncome.toFixed(0)}`} sub={`+ Retiros Bs. ${retirosSonia.toFixed(0)}`} />
          <StatCard icon={TrendingDown} iconBg="bg-red-100" iconColor="text-red-600"
            label="Egresos" value={`Bs. ${monthEgreso.toFixed(0)}`} sub={`excl. retiros — ${month}`} />
          <StatCard icon={PawPrint} iconBg="bg-orange-100" iconColor="text-orange-600"
            label="Mascotas" value={petCount} sub="últimos 90 días" />
          <StatCard icon={Building2} iconBg="bg-indigo-100" iconColor="text-indigo-600"
            label="Empresas" value={empresaCount} sub="últimos 90 días" />
        </>)}
      </div>


      {/* ── ADMIN CHARTS ── */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Nationalities */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} className="text-blue-500" />
              <h3 className="font-semibold text-gray-800 text-sm">Nacionalidades</h3>
              <span className="text-xs text-gray-400 ml-auto">últimos 90 días</span>
            </div>
            <DonutChart segments={nationalities} label="huéspedes" />
          </div>

          {/* Utilities */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">⚡</span>
              <h3 className="font-semibold text-gray-800 text-sm">Servicios (Bs.)</h3>
              <span className="text-xs text-gray-400 ml-auto">todo el tiempo</span>
            </div>
            <DonutChart segments={utilities} label="Bs." />
          </div>

          {/* Empresas vs personas */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-indigo-500" />
              <h3 className="font-semibold text-gray-800 text-sm">Tipo de huésped</h3>
              <span className="text-xs text-gray-400 ml-auto">últimos 90 días</span>
            </div>
            <DonutChart segments={[
              { label: 'Personas',  value: occupied.filter(r => !r.is_empresa).length + Math.max(0, (occupied.filter(r=>!r.is_empresa).length)), color: '#10b981' },
              { label: 'Empresas',  value: empresaCount, color: '#6366f1' },
              { label: 'Con mascota', value: petCount,   color: '#f97316' },
            ]} label="reservas" />
          </div>
        </div>
      )}
    </div>
  );
}
