import { useEffect, useState } from 'react';
import { CalendarDays, TrendingUp, Wallet, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Reservation } from '../types';
import { STATUS_CONFIG } from '../constants';

export default function DashboardPage() {
  const { profile } = useAuth();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const [occupied,       setOccupied]       = useState<Reservation[]>([]);
  const [monthIncome,    setMonthIncome]     = useState(0);
  const [pettyBalance,   setPettyBalance]    = useState(0);
  const [staffCount,     setStaffCount]      = useState(0);
  const [loading,        setLoading]         = useState(true);

  useEffect(() => {
    async function load() {
      const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-01`;
      const lastDay  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()}`;

      const [resRes, incRes, ccRes, staffRes] = await Promise.all([
        // Today's occupied / reserva rooms
        supabase.from('reservations').select('*')
          .lte('check_in', todayStr)
          .gt('check_out', todayStr)
          .in('status', ['ocupado', 'reserva']),
        // This month's income
        supabase.from('transactions').select('amount')
          .eq('type', 'ingreso')
          .gte('date', firstDay).lte('date', lastDay),
        // Petty cash balance
        supabase.from('petty_cash').select('balance')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1).single(),
        // Staff count
        supabase.from('profiles').select('id', { count: 'exact' }).eq('is_active', true),
      ]);

      setOccupied(resRes.data ?? []);
      setMonthIncome((incRes.data ?? []).reduce((s, t) => s + t.amount, 0));
      setPettyBalance(ccRes.data?.balance ?? 0);
      setStaffCount(staffRes.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  const month = today.toLocaleDateString('es', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Buen día, {profile?.name ?? 'bienvenido'} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">
          {today.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
              <CalendarDays size={16} className="text-green-600" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Ocupadas hoy</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{occupied.length}</p>
          <p className="text-xs text-gray-400 mt-1">habitaciones activas</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <TrendingUp size={16} className="text-amber-600" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Ingresos</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">${monthIncome.toFixed(0)}</p>
          <p className="text-xs text-gray-400 mt-1 capitalize">{month}</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Wallet size={16} className="text-blue-600" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Caja Chica</span>
          </div>
          <p className={`text-3xl font-bold ${pettyBalance >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
            ${pettyBalance.toFixed(0)}
          </p>
          <p className="text-xs text-gray-400 mt-1">saldo actual</p>
        </div>

        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users size={16} className="text-purple-600" />
            </div>
            <span className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Personal</span>
          </div>
          <p className="text-3xl font-bold text-gray-900">{staffCount}</p>
          <p className="text-xs text-gray-400 mt-1">recepcionistas activos</p>
        </div>
      </div>

      {/* Today's rooms */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Habitaciones activas hoy</h2>
        {occupied.length === 0 ? (
          <p className="text-sm text-gray-400">No hay habitaciones ocupadas ni con reserva hoy.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {occupied.map(res => {
              const cfg = STATUS_CONFIG[res.status];
              return (
                <div key={res.id} className={`rounded-lg p-3 ${cfg.bg} ${cfg.text}`}>
                  <div className="font-bold text-base">{res.room_id}</div>
                  <div className="text-sm font-medium mt-0.5 truncate">{res.guest_name}</div>
                  <div className="text-xs opacity-80 mt-1">{res.num_guests} huésped{res.num_guests > 1 ? 'es' : ''}</div>
                  <div className="text-xs opacity-70 mt-0.5">
                    {res.check_in} → {res.check_out}
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {res.is_empresa    && <span className="text-[10px] bg-white/30 rounded px-1 py-0.5">Empresa</span>}
                    {res.has_pet       && <span className="text-[10px] bg-white/30 rounded px-1 py-0.5">🐾</span>}
                    {res.wants_invoice && <span className="text-[10px] bg-white/30 rounded px-1 py-0.5">Factura</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
