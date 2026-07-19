import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Users, Clock, BookOpen, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Inquiry {
  id: string;
  teacher: string;
  level: string;
  class_type: string;
  dates: string[];
  time_slot: 'morning' | 'afternoon';
  name: string;
  nationality: string;
  passport: string;
  num_students: number;
  email: string | null;
  whatsapp: string | null;
  message: string | null;
  created_at: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_HEADER = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const TEACHER_COLOR: Record<string, string> = {
  julian: 'bg-amber-400 text-stone-900',
  zalam:  'bg-violet-500 text-white',
};
const SLOT_LABEL: Record<string, string> = {
  morning:   '☀️ 9:00 – 13:00',
  afternoon: '🌙 15:00 – 19:00',
};
const LEVEL_LABEL: Record<string, string> = {
  basico:     'Basic A1-A2',
  intermedio: 'Intermediate B1-B2',
  avanzado:   'Advanced C1-C2',
};
const TYPE_LABEL: Record<string, string> = {
  mercado:  'Market classes',
  tours:    'Cultural tours',
  baile:    'Dance classes',
  teorica:  'Theoretical',
  deportes: 'Sports & activities',
  cocina:   'Kitchen classes',
};

export default function SpanishSchoolPage() {
  const today = new Date();
  const [view, setView]         = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Inquiry | null>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase
      .from('spanish_school_inquiries')
      .select('*')
      .order('created_at', { ascending: false });
    setInquiries((data ?? []) as Inquiry[]);
    setLoading(false);
  }

  const year  = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().slice(0, 10);

  // Map date string → inquiries that have that date
  const byDate: Record<string, Inquiry[]> = {};
  for (const inq of inquiries) {
    for (const d of (inq.dates ?? [])) {
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(inq);
    }
  }

  // Build calendar cells
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Upcoming / this month list
  const thisMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const upcoming = inquiries
    .flatMap(inq => (inq.dates ?? []).filter(d => d.startsWith(thisMonthPrefix)).map(d => ({ inq, d })))
    .sort((a, b) => a.d.localeCompare(b.d));

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Spanish School</h1>
          <p className="text-sm text-gray-500 mt-0.5">Class bookings calendar</p>
        </div>
        <button onClick={fetchAll} className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 font-medium transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Calendar ── */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <button onClick={() => setView(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h2 className="font-semibold text-gray-900">{MONTHS[month]} {year}</h2>
            <button onClick={() => setView(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAYS_HEADER.map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} className="h-24 border-b border-r border-gray-50" />;
                const str = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayInqs = byDate[str] ?? [];
                const isToday = str === todayStr;
                return (
                  <div key={str} className={`h-24 border-b border-r border-gray-50 p-1 overflow-hidden ${isToday ? 'bg-amber-50' : ''}`}>
                    <p className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1
                      ${isToday ? 'bg-amber-400 text-white' : 'text-gray-600'}`}>{day}</p>
                    <div className="space-y-0.5">
                      {dayInqs.slice(0, 3).map((inq, j) => (
                        <button
                          key={`${inq.id}-${j}`}
                          onClick={() => setSelected(inq)}
                          className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold truncate transition-opacity hover:opacity-80
                            ${TEACHER_COLOR[inq.teacher] ?? 'bg-gray-200 text-gray-700'}`}
                        >
                          {inq.name} · {inq.teacher === 'julian' ? 'Julián' : 'Zalam'}
                        </button>
                      ))}
                      {dayInqs.length > 3 && (
                        <p className="text-[10px] text-gray-400 px-1">+{dayInqs.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Sidebar: this month's classes ── */}
        <div className="space-y-4">
          {/* Legend */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Teachers</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-400" /><span className="text-sm text-gray-700">Julián Fernández</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-violet-500" /><span className="text-sm text-gray-700">Zalam</span></div>
            </div>
          </div>

          {/* This month list */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {MONTHS[month]} — {upcoming.length} class day{upcoming.length !== 1 ? 's' : ''}
              </p>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No classes this month</p>
            ) : (
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {upcoming.map(({ inq, d }, i) => (
                  <button key={`${inq.id}-${d}-${i}`} onClick={() => setSelected(inq)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${inq.teacher === 'julian' ? 'bg-amber-400' : 'bg-violet-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{inq.name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {' · '}{SLOT_LABEL[inq.time_slot]}
                        </p>
                        <div className="flex gap-1 mt-1">
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{inq.teacher === 'julian' ? 'Julián' : 'Zalam'}</span>
                          <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{LEVEL_LABEL[inq.level] ?? inq.level}</span>
                          {inq.num_students > 1 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">👥 {inq.num_students}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{inquiries.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total bookings</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {inquiries.reduce((s, inq) => s + (inq.num_students ?? 1), 0)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Total students</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Detail modal ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-4 flex items-center justify-between ${selected.teacher === 'julian' ? 'bg-amber-50' : 'bg-violet-50'}`}>
              <div>
                <p className="font-bold text-gray-900">{selected.name}</p>
                <p className="text-sm text-gray-500">{selected.nationality} · {selected.passport}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Users size={11}/> Teacher</p>
                  <p className="font-semibold text-gray-900">{selected.teacher === 'julian' ? 'Julián Fernández' : 'Zalam'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><BookOpen size={11}/> Level</p>
                  <p className="font-semibold text-gray-900">{LEVEL_LABEL[selected.level] ?? selected.level}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1 flex items-center gap-1"><Clock size={11}/> Schedule</p>
                  <p className="font-semibold text-gray-900">{SLOT_LABEL[selected.time_slot]}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Students</p>
                  <p className="font-semibold text-gray-900">👥 {selected.num_students ?? 1}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-2">Class type</p>
                <p className="font-semibold text-gray-900">{TYPE_LABEL[selected.class_type] ?? selected.class_type}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-2">Selected dates</p>
                <div className="flex flex-wrap gap-1">
                  {[...(selected.dates ?? [])].sort().map(d => (
                    <span key={d} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  ))}
                </div>
              </div>
              {(selected.email || selected.whatsapp) && (
                <div className="bg-gray-50 rounded-xl p-3 space-y-1">
                  <p className="text-xs text-gray-400 mb-1">Contact</p>
                  {selected.email    && <p className="text-gray-700">📧 {selected.email}</p>}
                  {selected.whatsapp && (
                    <a href={`https://wa.me/${selected.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                      className="text-green-600 hover:underline block">💬 {selected.whatsapp}</a>
                  )}
                </div>
              )}
              {selected.message && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">Message</p>
                  <p className="text-gray-700 text-sm">{selected.message}</p>
                </div>
              )}
              <p className="text-xs text-gray-400 text-right">
                Booked {new Date(selected.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
