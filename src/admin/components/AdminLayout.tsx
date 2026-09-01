import { useState } from 'react';
import type React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, ArrowLeftRight,
  ClipboardList, Users, LogOut, Menu, X, Hotel, BarChart2, History, BookUser, ShoppingBag, GraduationCap, Sparkles, TrendingUp, Wallet, Receipt,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type NavItem = {
  to: string; icon: React.ElementType; label: string;
  exact?: boolean; adminOnly?: boolean; roles?: string[];
};

const navItems: NavItem[] = [
  { to: '/admin',              icon: LayoutDashboard, label: 'Dashboard',          exact: true },
  { to: '/admin/calendar',     icon: CalendarDays,    label: 'Calendario' },
  { to: '/admin/limpiezas',    icon: Sparkles,        label: 'Limpiezas' },
  { to: '/admin/transactions', icon: ArrowLeftRight,  label: 'Ingresos / Egresos' },
  { to: '/admin/guests',       icon: BookUser,        label: 'Base de Huéspedes' },
  { to: '/admin/vitrina',      icon: ShoppingBag,     label: 'Stock Hotel' },
  { to: '/admin/shift',        icon: ClipboardList,   label: 'Cambio de Turno' },
  { to: '/admin/billetes',     icon: ClipboardList,   label: 'Billetes' },
  { to: '/admin/reportes',     icon: BarChart2,       label: 'Reportes' },
  { to: '/admin/historial',    icon: History,         label: 'Historial',          adminOnly: true },
  { to: '/admin/spanish',      icon: GraduationCap,   label: 'Spanish School' },
  // Marketing: visible only to admin and marketing role
  { to: '/admin/marketing',    icon: TrendingUp,      label: 'Marketing',          roles: ['admin', 'marketing'] },
];

const adminItems = [
  { to: '/admin/staff',      icon: Users,    label: 'Personal' },
  { to: '/admin/planillas',  icon: Wallet,   label: 'Planillas Sueldos' },
  { to: '/admin/impuestos',  icon: Receipt,  label: 'Impuestos' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate('/admin/login');
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
      isActive
        ? 'bg-amber-400 text-gray-900'
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-gray-900 w-48">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-800">
        <div className="w-7 h-7 rounded-md bg-amber-400 flex items-center justify-center flex-shrink-0">
          <Hotel size={15} className="text-gray-900" />
        </div>
        <div className="min-w-0">
          <p className="text-white font-bold text-xs leading-tight truncate">Bastille Hotel</p>
          <p className="text-gray-500 text-[10px]">Admin Panel</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.filter(item => {
          const role = profile?.role ?? '';
          if (item.adminOnly && role !== 'admin') return false;
          if (item.roles) return item.roles.includes(role);
          // Default: hide from marketing-only accounts
          return role !== 'marketing';
        }).map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={linkClass}
            onClick={() => setSidebarOpen(false)}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}

        {profile?.role === 'admin' && (
          <>
            <div className="pt-3 pb-1 px-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Admin</p>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={linkClass}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="px-2 py-3 border-t border-gray-800">
        <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
          <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
            <span className="text-gray-900 font-bold text-xs">
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{profile?.name ?? 'Usuario'}</p>
            <p className="text-gray-500 text-[10px] capitalize">{profile?.role ?? ''}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full z-50 flex">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400">
            <Menu size={22} />
          </button>
          <p className="text-white font-bold text-sm">Bastille Hotel</p>
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} className="ml-auto text-gray-400">
              <X size={22} />
            </button>
          )}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
