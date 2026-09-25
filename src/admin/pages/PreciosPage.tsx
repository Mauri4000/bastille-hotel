import { useEffect, useState } from 'react';
import { TrendingUp, Users, Building2, Baby, PawPrint, Star, RefreshCw, Info, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Precios actuales ─────────────────────────────────────────────────────────
const PRECIOS_ACTUALES: Record<string, number> = {
  'Simple':             200,
  'Doble':              300,
  'Matrimonial':        250,
  'Matri más Camita':   320,
  'Suite Simple':       250,
  'Suite Matri':        300,
  'Suite Matri+camita': 350,
  'Familiar':           420,
};

// ── Recomendaciones por ocupación ────────────────────────────────────────────
// Siempre se sugiere al menos +10% por inflación (alza del diesel).
// Con buena ocupación se sube más.
function recommendation(occ: number, isTopSeller: boolean, hasData: boolean): {
  label: string; color: string; pct: number; reason: string;
} {
  const diesel = 'El alza del diesel en Bolivia encareció costos operativos: desayuno, lavandería y proveedores. Hoteles de Sucre ya ajustaron entre 10–25%.';
  if (!hasData) return {
    label: 'Ajuste por inflación recomendado',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    pct: 10,
    reason: `No hay reservas registradas con este tipo de habitación en el período, pero ${diesel} Se recomienda un ajuste base del 10% para no perder margen.`,
  };
  if (occ >= 0.70) return {
    label: isTopSeller ? 'Muy alta demanda — subir precio' : 'Alta demanda — subir precio',
    color: 'text-green-700 bg-green-50 border-green-200',
    pct: isTopSeller ? 25 : 20,
    reason: `Ocupación del ${(occ*100).toFixed(0)}% — los huéspedes eligen esta habitación sin dudar. ${diesel} Con esta demanda puedes subir ${isTopSeller ? 25 : 20}% sin perder reservas.`,
  };
  if (occ >= 0.50) return {
    label: 'Buena ocupación — ajuste moderado',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    pct: 15,
    reason: `Con ${(occ*100).toFixed(0)}% de ocupación el precio es competitivo. ${diesel} Un ajuste del 15% es prudente y difícilmente perderás reservas.`,
  };
  // Cualquier ocupación menor → ajuste mínimo del 10% igual por inflación
  return {
    label: 'Ajuste mínimo por inflación',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    pct: 10,
    reason: `Ocupación del ${(occ*100).toFixed(0)}% en el período. Aunque la demanda es moderada, ${diesel} Un ajuste del 10% recupera solo el costo operativo adicional — es el mínimo recomendable.`,
  };
}

interface RoomStat {
  subtype:      string;
  roomCount:    number;
  totalNights:  number;
  maxNights:    number;
  occupancy:    number;
  revenue:      number;
  avgNights:    number;
  empresaCount: number;
  petCount:     number;
  childCount:   number;
  resCount:     number;
}

function fmtBs(n: number) { return `Bs. ${n.toLocaleString('es-BO', { maximumFractionDigits: 0 })}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// System entry names to exclude
const SYSTEM_NAMES = ['📝 Nota', '🏠 Habilitación', 'Habilitación', '⚠️'];

export default function PreciosPage() {
  const today = new Date();
  const [periodMonths, setPeriodMonths] = useState(6);
  const [stats,        setStats]        = useState<RoomStat[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalRes,     setTotalRes]     = useState(0);
  const [empresaTotal, setEmpresaTotal] = useState(0);
  const [petTotal,     setPetTotal]     = useState(0);
  const [childTotal,   setChildTotal]   = useState(0);

  async function load() {
    setLoading(true); setError(null);
    try {
      const since = new Date(today);
      since.setMonth(since.getMonth() - periodMonths);
      const sinceStr = since.toISOString().slice(0, 10);
      const nowStr   = today.toISOString().slice(0, 10);
      const periodDays = Math.ceil((today.getTime() - since.getTime()) / 86400000);

      // (rooms fetched for future use — currently subtype comes from reservations)
      await supabase.from('rooms').select('id, name, type');

      // Fetch ALL reservations in period that have checked out (check_out in the past)
      // Status stays 'ocupado' after checkout, so we filter by check_out <= today
      const { data, error: resErr } = await supabase
        .from('reservations')
        .select('id,room_id,guest_name,check_in,check_out,status,price_per_night,room_subtype,is_empresa,has_pet,num_guests,additional_guests')
        .gte('check_in', sinceStr)
        .lte('check_out', nowStr)          // already checked out
        .not('status', 'in', '("mantenimiento","habilitacion","limpieza")')
        .order('check_in', { ascending: false });

      if (resErr) throw new Error(resErr.message);

      // Filter out system/internal entries
      const reservations = (data ?? []).filter(r => {
        const name = r.guest_name ?? '';
        return !SYSTEM_NAMES.some(s => name.startsWith(s)) && r.price_per_night && r.price_per_night > 0;
      });

      // Build stats per subtype
      const subtypeMap = new Map<string, RoomStat>();
      const roomSubtypes = new Map<string, Set<string>>();

      for (const sub of Object.keys(PRECIOS_ACTUALES)) {
        subtypeMap.set(sub, { subtype: sub, roomCount: 0, totalNights: 0, maxNights: 0, occupancy: 0, revenue: 0, avgNights: 0, empresaCount: 0, petCount: 0, childCount: 0, resCount: 0 });
      }

      let totRev = 0, totRes = 0, totEmp = 0, totPet = 0, totChild = 0;

      for (const r of reservations) {
        const sub = (r.room_subtype ?? '').trim() || 'Sin tipo';
        if (!subtypeMap.has(sub)) {
          subtypeMap.set(sub, { subtype: sub, roomCount: 0, totalNights: 0, maxNights: 0, occupancy: 0, revenue: 0, avgNights: 0, empresaCount: 0, petCount: 0, childCount: 0, resCount: 0 });
        }
        if (!roomSubtypes.has(sub)) roomSubtypes.set(sub, new Set());
        roomSubtypes.get(sub)!.add(r.room_id);

        const msPerDay = 86400000;
        const nights = r.check_out && r.check_in
          ? Math.max(1, Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / msPerDay))
          : 1;
        const price = r.price_per_night ?? 0;
        const stat = subtypeMap.get(sub)!;
        stat.totalNights += nights;
        stat.revenue     += nights * price;
        stat.resCount    += 1;
        if (r.is_empresa) { stat.empresaCount++; totEmp++; }
        if (r.has_pet)    { stat.petCount++;     totPet++; }
        const addG = (r.additional_guests ?? []) as any[];
        if (addG.some((g: any) => g.role === 'child' || g.role === 'babies')) { stat.childCount++; totChild++; }
        totRev += nights * price;
        totRes++;
      }

      // Compute occupancy
      const result: RoomStat[] = [];
      for (const [sub, stat] of subtypeMap.entries()) {
        const distinctRooms = roomSubtypes.get(sub)?.size ?? 0;
        if (stat.resCount === 0) continue;
        stat.roomCount = distinctRooms || 1;
        stat.maxNights = stat.roomCount * periodDays;
        stat.occupancy = stat.maxNights > 0 ? Math.min(1, stat.totalNights / stat.maxNights) : 0;
        stat.avgNights = stat.resCount > 0 ? stat.totalNights / stat.resCount : 0;
        result.push(stat);
      }

      result.sort((a, b) => b.occupancy - a.occupancy);
      const topSubtype = result[0]?.subtype;

      setStats(result.map(s => s));
      setTotalRevenue(totRev);
      setTotalRes(totRes);
      setEmpresaTotal(totEmp);
      setPetTotal(totPet);
      setChildTotal(totChild);
      // store top seller for highlighting
      (window as any).__topSeller = topSubtype;
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [periodMonths]);

  const sinceLabel = (() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - periodMonths);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  })();

  const topSubtype = (window as any).__topSeller as string | undefined;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp size={22} className="text-amber-500" /> Evaluador de Precios
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Ocupación real + recomendaciones de ajuste</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={periodMonths} onChange={e => setPeriodMonths(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value={1}>Último mes</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Último año</option>
          </select>
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin text-amber-500' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      {/* Diesel alert banner */}
      <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
        <AlertTriangle size={18} className="text-orange-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-orange-800">Contexto económico — Bolivia 2026</p>
          <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">
            El precio del diesel subió ~60%, encareciendo desayuno, lavandería, calefacción y transporte de proveedores.
            Los hoteles en Sucre han ajustado precios entre <strong>10–25%</strong>. Mantener precios de 2024 significa trabajar con márgenes negativos.
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Período: <span className="font-semibold text-gray-600">{sinceLabel} — {MONTHS[today.getMonth()]} {today.getFullYear()}</span>
        {' · '}reservas con check-out completado
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

      {/* Summary cards */}
      {!loading && totalRes > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={<Users size={17} className="text-blue-500" />}
            label="Reservas analizadas" value={String(totalRes)}
            sub={`Ing. prom. ${fmtBs(totalRevenue / totalRes)}/noche`} />
          <SummaryCard icon={<Building2 size={17} className="text-purple-500" />}
            label="Empresas" value={`${((empresaTotal / totalRes) * 100).toFixed(0)}%`}
            sub={`${empresaTotal} reservas corporativas`} />
          <SummaryCard icon={<PawPrint size={17} className="text-orange-500" />}
            label="Con mascotas" value={`${((petTotal / totalRes) * 100).toFixed(0)}%`}
            sub={`${petTotal} huéspedes con mascota`} />
          <SummaryCard icon={<Baby size={17} className="text-pink-500" />}
            label="Con niños" value={`${((childTotal / totalRes) * 100).toFixed(0)}%`}
            sub={`${childTotal} reservas con niños`} />
        </div>
      )}

      {/* Room cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <RefreshCw size={18} className="animate-spin" /> Analizando datos…
        </div>
      ) : stats.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
          No hay reservas completadas en este período.<br />
          <span className="text-xs">Prueba seleccionando un período más largo.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {stats.map((stat, idx) => {
            const isTopSeller = stat.subtype === topSubtype;
            const rec     = recommendation(stat.occupancy, isTopSeller, true);
            const current = PRECIOS_ACTUALES[stat.subtype] ?? null;
            const suggested = current && rec.pct > 0
              ? Math.round(current * (1 + rec.pct / 100) / 10) * 10
              : null;

            return (
              <div key={stat.subtype} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isTopSeller ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-100'}`}>
                {isTopSeller && (
                  <div className="bg-amber-500 text-white text-[11px] font-bold px-4 py-1 flex items-center gap-1">
                    <Star size={11} /> MÁS SOLICITADA
                  </div>
                )}
                {idx === 0 && !isTopSeller && null}

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-lg">🛏</div>
                    <div>
                      <h3 className="font-bold text-gray-900">{stat.subtype}</h3>
                      <p className="text-xs text-gray-400">{stat.roomCount} hab. · {stat.resCount} estadías</p>
                    </div>
                  </div>
                  {current && (
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">Bs. {current}</div>
                      <div className="text-xs text-gray-400">precio actual</div>
                    </div>
                  )}
                </div>

                <div className="px-5 py-4 flex flex-col gap-4">
                  {/* Occupancy bar */}
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs font-semibold text-gray-600">Ocupación del período</span>
                      <span className="text-sm font-bold text-gray-800">{fmtPct(stat.occupancy)}</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${
                        stat.occupancy >= 0.80 ? 'bg-green-500' :
                        stat.occupancy >= 0.60 ? 'bg-blue-500' :
                        stat.occupancy >= 0.40 ? 'bg-amber-400' : 'bg-red-400'
                      }`} style={{ width: `${Math.min(100, stat.occupancy * 100).toFixed(1)}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-gray-300">
                      <span>0%</span><span>50%</span><span>100%</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <StatChip label="Noches vendidas" value={String(stat.totalNights)} />
                    <StatChip label="Estadía promedio" value={`${stat.avgNights.toFixed(1)} noches`} />
                    <StatChip label="Ingresos período" value={fmtBs(stat.revenue)} />
                  </div>

                  {/* Guest profile tags */}
                  {(stat.empresaCount > 0 || stat.petCount > 0 || stat.childCount > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {stat.empresaCount > 0 && (
                        <Tag icon={<Building2 size={11} />} color="purple"
                          label={`${stat.empresaCount} empresa${stat.empresaCount !== 1 ? 's' : ''} (${((stat.empresaCount/stat.resCount)*100).toFixed(0)}%)`} />
                      )}
                      {stat.petCount > 0 && (
                        <Tag icon={<PawPrint size={11} />} color="orange"
                          label={`${stat.petCount} con mascota`} />
                      )}
                      {stat.childCount > 0 && (
                        <Tag icon={<Baby size={11} />} color="pink"
                          label={`${stat.childCount} con niños`} />
                      )}
                    </div>
                  )}

                  {/* Recommendation box */}
                  <div className={`rounded-xl border px-4 py-3 ${rec.color}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 font-bold text-sm">
                        <Star size={14} /> {rec.label}
                      </div>
                      {suggested && current && (
                        <div className="text-right">
                          <div className="text-xl font-black">Bs. {suggested}</div>
                          <div className="text-[11px] opacity-70">+{rec.pct}% · +Bs. {suggested - current}/noche</div>
                        </div>
                      )}
                      {rec.pct === 0 && current && (
                        <div className="text-xl font-black">Bs. {current}</div>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed opacity-90">{rec.reason}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Price guide */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 px-5 py-4">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 mb-3">
          <Info size={14} className="text-gray-400" /> Precios actuales
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(PRECIOS_ACTUALES).map(([tipo, precio]) => (
            <div key={tipo} className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-600 truncate">{tipo}</span>
              <span className="text-xs font-bold text-amber-700 whitespace-nowrap">Bs. {precio}</span>
            </div>
          ))}
          <div className="bg-white rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600 flex items-center gap-1"><PawPrint size={10} /> Mascota</span>
            <span className="text-xs font-bold text-amber-700">Bs. 30</span>
          </div>
        </div>
      </div>

      {/* Suggested prices summary */}
      {stats.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-600" />
            <h3 className="text-sm font-bold text-gray-800">Lista de precios sugeridos</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(PRECIOS_ACTUALES).map(([tipo, actual]) => {
              const stat = stats.find(s => s.subtype === tipo);
              const isTop = tipo === topSubtype;
              const rec  = recommendation(stat?.occupancy ?? 0, isTop, !!stat);
              const suggested = rec.pct > 0
                ? Math.round(actual * (1 + rec.pct / 100) / 10) * 10
                : actual;
              const diff = suggested - actual;
              return (
                <div key={tipo} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50/50">
                  <div className="flex items-center gap-2">
                    {isTop && <Star size={12} className="text-amber-500" />}
                    <span className="text-sm font-medium text-gray-800">{tipo}</span>
                    {!stat && <span className="text-[10px] text-gray-300 italic">sin datos</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 line-through">Bs. {actual}</span>
                    <span className={`text-base font-black ${diff > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                      Bs. {suggested}
                    </span>
                    {diff > 0 && (
                      <span className="text-xs font-semibold text-green-600 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                        +Bs. {diff}
                      </span>
                    )}
                    {diff === 0 && (
                      <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                        sin cambio
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Pet fee — price fixed */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50/50">
              <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                <PawPrint size={13} className="text-orange-400" /> Mascota pequeña
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400 line-through">Bs. 30</span>
                <span className="text-base font-black text-gray-700">Bs. 30</span>
                <span className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">precio fijo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400 text-center">
        Ocupación = noches vendidas ÷ (habitaciones × días del período). Solo reservas con check-out completado y precio &gt; 0.
      </p>
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-gray-500 text-xs">{icon} {label}</div>
      <div className="text-2xl font-black text-gray-900">{value}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl px-3 py-2 text-center border border-gray-100">
      <div className="text-[11px] text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm font-bold text-gray-800">{value}</div>
    </div>
  );
}

function Tag({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  const colors: Record<string, string> = {
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    orange: 'bg-orange-50 text-orange-700 border-orange-100',
    pink:   'bg-pink-50 text-pink-700 border-pink-100',
  };
  return (
    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${colors[color]}`}>
      {icon} {label}
    </span>
  );
}
