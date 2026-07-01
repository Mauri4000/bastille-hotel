import { useEffect, useState, useCallback } from 'react';
import { Users, FileText, X, Search, Receipt, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface GuestRecord {
  id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_document: string | null;
  guest_gender: string | null;
  guest_birthdate: string | null;
  guest_country: string | null;
  guest_marital_status: string | null;
  guest_profession: string | null;
  guest_purpose: string | null;
  guest_origin: string | null;
  guest_next_dest: string | null;
  guest_transport: string | null;
  check_in: string;
  check_out: string;
  price_per_night: number | null;
  adelanto: number | null;
  num_guests: number;
  wants_invoice: boolean;
  siaat_number: string | null;
  is_empresa: boolean;
  empresa_name: string | null;
  has_pet: boolean;
  departure_time: string | null;
}

const GENDER_LABEL: Record<string, string> = { M: 'Masculino', F: 'Femenino' };
const MARITAL_LABEL: Record<string, string> = { S: 'Soltero/a', C: 'Casado/a', D: 'Divorciado/a', V: 'Viudo/a' };
const TRANSPORT_LABEL: Record<string, string> = { T: 'Terrestre', A: 'Aéreo' };

const PAGE_SIZE = 25;

function nights(ci: string, co: string) {
  return Math.max(1, Math.round((new Date(co + 'T00:00:00').getTime() - new Date(ci + 'T00:00:00').getTime()) / 86400000));
}

function Boleta({ g, onClose }: { g: GuestRecord; onClose: () => void }) {
  const n = nights(g.check_in, g.check_out);
  const total = (g.price_per_night ?? 0) * n;
  const saldo = total - (g.adelanto ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <FileText size={17} className="text-amber-600" /> Boleta de Registro
            </h3>
            <p className="text-xs text-amber-700 font-semibold mt-0.5">{g.room_id} — {g.guest_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4 text-sm">
          {/* Estadia */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Estadía</p>
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
              <Row label="Habitación"    value={g.room_id} />
              <Row label="Check-in"      value={g.check_in} />
              <Row label="Check-out"     value={g.check_out} />
              <Row label="Noches"        value={String(n)} />
              {g.price_per_night != null && <Row label="Precio / noche" value={`Bs. ${g.price_per_night.toFixed(2)}`} />}
              {g.price_per_night != null && <Row label="Total"          value={`Bs. ${total.toFixed(2)}`} bold />}
              {(g.adelanto ?? 0) > 0     && <Row label="Adelanto"       value={`Bs. ${g.adelanto!.toFixed(2)}`} />}
              {g.price_per_night != null && <Row label="Saldo cobrado"  value={`Bs. ${Math.max(0,saldo).toFixed(2)}`} bold />}
            </div>
          </section>

          {/* Huesped */}
          <section>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Huésped principal</p>
            <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1">
              <Row label="Nombre"        value={g.guest_name} />
              {g.guest_document  && <Row label="CI / Pasaporte" value={g.guest_document} />}
              {g.guest_phone     && <Row label="Teléfono"       value={g.guest_phone} />}
              {g.guest_birthdate && <Row label="Fecha Nac."     value={g.guest_birthdate} />}
              {g.guest_gender    && <Row label="Género"         value={GENDER_LABEL[g.guest_gender] ?? g.guest_gender} />}
              {g.guest_marital_status && <Row label="Est. Civil" value={MARITAL_LABEL[g.guest_marital_status] ?? g.guest_marital_status} />}
              {g.guest_country   && <Row label="Nacionalidad"   value={g.guest_country} />}
              {g.guest_profession && <Row label="Profesión"     value={g.guest_profession} />}
              {g.guest_purpose   && <Row label="Motivo"         value={g.guest_purpose} />}
              {g.guest_origin    && <Row label="Procedencia"    value={g.guest_origin} />}
              {g.guest_next_dest && <Row label="Destino"        value={g.guest_next_dest} />}
              {g.guest_transport && <Row label="Transporte"     value={TRANSPORT_LABEL[g.guest_transport] ?? g.guest_transport} />}
            </div>
          </section>

          {/* Empresa */}
          {g.is_empresa && g.empresa_name && (
            <section>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Empresa</p>
              <div className="bg-gray-50 rounded-xl px-4 py-3">
                <Row label="Razón social" value={g.empresa_name} />
              </div>
            </section>
          )}

          {/* Factura */}
          {g.wants_invoice && (
            <section>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Factura</p>
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 space-y-1">
                <Row label="Factura solicitada" value="Sí ✓" />
                {g.siaat_number && <Row label="N° SIAAT" value={g.siaat_number} bold />}
              </div>
            </section>
          )}

          {/* Extras */}
          {(g.has_pet) && (
            <div className="flex gap-2 flex-wrap">
              {g.has_pet && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-semibold">🐾 Mascota</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className={`text-right ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{value}</span>
    </div>
  );
}

export default function GuestDatabasePage() {
  const [tab, setTab]         = useState<'all' | 'siaat'>('all');
  const [guests, setGuests]   = useState<GuestRecord[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [boleta, setBoleta]   = useState<GuestRecord | null>(null);

  const fetchGuests = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    let q = supabase
      .from('reservations')
      .select('*', { count: 'exact' })
      .neq('status', 'habilitacion')
      .neq('guest_name', 'Habilitación')
      .lt('check_out', today)              // checked-out (past)
      .order('check_out', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (tab === 'siaat') q = q.eq('wants_invoice', true);
    if (search)          q = q.ilike('guest_name', `%${search}%`);

    const { data, count } = await q;
    setGuests((data as GuestRecord[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, [tab, page, search]);

  useEffect(() => { fetchGuests(); }, [fetchGuests]);
  useEffect(() => { setPage(0); }, [tab, search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-amber-500" /> Base de Datos Huéspedes
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} registro{total !== 1 ? 's' : ''}</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Buscar por nombre..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 w-52"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Todos los huéspedes
        </button>
        <button
          onClick={() => setTab('siaat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === 'siaat' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Receipt size={14} /> SIAAT / Factura
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : guests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Users size={32} className="mb-2 opacity-30" />
            <p className="text-sm">
              {tab === 'siaat' ? 'No hay huéspedes con factura registrada.' : 'No hay huéspedes registrados aún.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">CI / Doc.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Teléfono</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Hab.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Check-out</th>
                  {tab === 'siaat' && (
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">N° SIAAT</th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-gray-500 tracking-wider">Noches</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {guests.map(g => (
                  <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                        {g.guest_name}
                        {g.wants_invoice && <span title="Factura">🧾</span>}
                        {g.has_pet       && <span title="Mascota">🐾</span>}
                        {g.is_empresa    && <span title="Empresa">🏢</span>}
                      </div>
                      {g.guest_country && <div className="text-xs text-gray-400">{g.guest_country}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{g.guest_document ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{g.guest_phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">{g.room_id}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{g.check_out}</td>
                    {tab === 'siaat' && (
                      <td className="px-4 py-3">
                        {g.siaat_number
                          ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{g.siaat_number}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-500 text-xs">{nights(g.check_in, g.check_out)} noche{nights(g.check_in, g.check_out) !== 1 ? 's' : ''}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setBoleta(g)}
                        className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors"
                      >
                        <FileText size={13} /> Boleta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">Página {page + 1} de {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Boleta modal */}
      {boleta && <Boleta g={boleta} onClose={() => setBoleta(null)} />}
    </div>
  );
}
