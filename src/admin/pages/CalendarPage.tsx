import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, Minus, X, Building2, Trash2, Receipt, CheckSquare, MoreHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../../lib/logActivity';
import type { Reservation, ReservationStatus, Room } from '../types';
import { STATUS_CONFIG, MONTH_NAMES, DAY_NAMES } from '../constants';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import CustomSelect from '../components/CustomSelect';
import VitrinaProductPicker from '../components/VitrinaProductPicker';

// ────── helpers ──────
function toLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function toDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Room subtype options by room type keyword
function subtypeOptions(roomType: string): string[] {
  if (roomType.includes('S/M/F')) return ['Simple', 'Matrimonial', 'Doble', 'Familiar'];
  if (roomType.includes('DOBLE/FAM')) return ['Doble', 'Familiar'];
  if (roomType.includes('S/M')) return ['Simple', 'Matrimonial'];
  return [];
}

// ────── guess gender from first name (ends in 'a' → F, else M) ──────
function guessGender(name: string): 'M' | 'F' | '' {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!first) return '';
  return first.endsWith('a') ? 'F' : 'M';
}

// ────── age from birthdate ──────
function ageFromBirthdate(birthdate: string): number | null {
  if (!birthdate) return null;
  const born  = new Date(birthdate + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - born.getFullYear();
  if (today.getMonth() < born.getMonth() || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate())) age--;
  return age;
}

// ────── additional guest type ──────
interface AdditionalGuest {
  name:           string;
  phone:          string;
  gender:         '' | 'M' | 'F';
  birthdate:      string;
  marital_status: string;
  country:        string;
  document:       string;
  profession:     string;
  purpose:        string;
  origin:         string;
  next_dest:      string;
  transport:      '' | 'T' | 'A';
}

const emptyAdditionalGuest = (): AdditionalGuest => ({
  name: '', phone: '', gender: '', birthdate: '', marital_status: '',
  country: 'Boliviana', document: '', profession: '', purpose: '',
  origin: '', next_dest: '', transport: '',
});

// ────── child guest type ──────
interface ChildGuest {
  name:      string;
  document:  string;
  birthdate: string;
}
const emptyChildGuest = (): ChildGuest => ({ name: '', document: '', birthdate: '' });

// ────── empty form ──────
const emptyForm = {
  guest_name:        '',
  num_guests:        1,
  check_in:          '',
  check_out:         '',
  status:            'reserva' as ReservationStatus,
  room_subtype:      '',
  arrival_time:      '',
  departure_time:    '',
  late_checkout:     false,
  is_blacklist:      false,
  is_empresa:        false,
  has_pet:           false,
  wants_invoice:     false,
  price_per_night:   '',
  notes:             '',
  room_id:           '',
  // Arrival type (UI only — not saved)
  arrival_type:      'reserva' as 'reserva' | 'directo',
  num_nights:        1,
  // Empresa
  empresa_name:      '',
  // SALON fields
  start_time:        '',
  end_time:          '',
  catering_coffee:   false,
  catering_sandwich: false,
  catering_water:    false,
  // Parte Diario fields
  guest_gender:         '' as '' | 'M' | 'F',
  guest_birthdate:      '',
  guest_marital_status: '',
  guest_phone:          '',
  guest_country:        'Boliviana',
  guest_document:       '',
  guest_profession:     '',
  guest_purpose:        '',
  guest_origin:         '',
  guest_next_dest:      '',
  guest_transport:      '' as '' | 'T' | 'A',
};

export default function CalendarPage() {
  const { profile } = useAuth();
  const today = new Date();

  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const [rooms,        setRooms]        = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState<string | null>(null);

  // Modal
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [form,         setForm]         = useState({ ...emptyForm });
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [additionalGuests, setAdditionalGuests] = useState<AdditionalGuest[]>([]);
  const [childGuests,      setChildGuests]      = useState<ChildGuest[]>([]);
  const [numBabies,        setNumBabies]        = useState(0);
  const [empresas,         setEmpresas]         = useState<string[]>([]);
  const [menuOpenId,       setMenuOpenId]       = useState<string | null>(null);
  const [guestAutoFilled,  setGuestAutoFilled]  = useState(false);

  // Confirm arrival modal
  const [confirmModal, setConfirmModal] = useState({
    open: false, res: null as Reservation | null,
    arrival_time: '', num_nights: 1,
    guest_name_edit: '', guest_phone: '',
    guest_gender: '', guest_birthdate: '', guest_marital_status: '',
    guest_country: '', guest_document: '', guest_profession: '',
    guest_purpose: '', guest_origin: '', guest_next_dest: '', guest_transport: '',
  });

  // Checkout modal
  const [checkoutModal, setCheckoutModal] = useState({
    open: false, res: null as Reservation | null, departure_time: '',
    is_invoice: false, siaat_number: '', invoice_number: '', is_blacklist: false,
    // hospedaje already paid (fetched on open)
    checkoutPaid:       0,
    // hospedaje payment form
    checkoutHospPayAmt: '',
    checkoutHospPayCaja:'CAJA MAYOR' as string,
    // late checkout (fetched on open)
    checkoutLatePaid:   0,
    checkoutLateTotal:  0,
    // late checkout payment form (if not yet paid)
    checkoutLatePayAmt: '',
    checkoutLatePayCaja:'CAJA MAYOR' as string,
    // vitrina items paid in this session (for Anular)
    checkoutPaidVitrina: [] as PendingVitrinaItem[],
  });

  // Late checkout popup (from card menu)
  const [lateCheckoutModal, setLateCheckoutModal] = useState<{
    res: Reservation; time: string; extra_price: string; caja: string;
  } | null>(null);

  // Vitrina sale from card menu
  type VitrinaProduct = { id: string; name: string; price: number; quantity: number; image_filename: string };
  type VitrinaCartItem = { product: VitrinaProduct; qty: number; total: number; caja: 'CAJA MAYOR' | 'CUENTA BNB' };
  type PendingVitrinaItem = { productId: string; productName: string; price: number; qty: number; total: number; caja: string };
  const [vitrinaSaleRes, setVitrinaSaleRes] = useState<Reservation | null>(null);
  // pendingVitrina: keyed by reservation_id, items not yet registered as transactions
  const [pendingVitrina, setPendingVitrina] = useState<Record<string, PendingVitrinaItem[]>>({});

  // Nota modal (existing cards — all rooms)
  const [notaModal, setNotaModal] = useState<{ res: Reservation; text: string } | null>(null);
  async function handleSaveNota() {
    if (!notaModal) return;
    await supabase.from('reservations').update({ notes: notaModal.text || null, updated_at: new Date().toISOString() }).eq('id', notaModal.res.id);
    setNotaModal(null);
    fetchData();
  }

  // Quick nota modal (from empty cell — creates a 1-day placeholder)
  const [quickNotaModal, setQuickNotaModal] = useState<{ roomId: string; day: number; text: string } | null>(null);
  async function handleSaveQuickNota() {
    if (!quickNotaModal) return;
    const date = toDateStr(new Date(year, month, quickNotaModal.day));
    const next = toDateStr(new Date(year, month, quickNotaModal.day + 1));
    await supabase.from('reservations').insert({
      room_id: quickNotaModal.roomId,
      guest_name: '📝 Nota',
      num_guests: 0,
      check_in: date,
      check_out: next,
      status: 'habilitacion' as ReservationStatus,
      notes: quickNotaModal.text,
      updated_at: new Date().toISOString(),
    });
    setQuickNotaModal(null);
    fetchData();
  }

  // Room change flow
  const [roomChangeModal, setRoomChangeModal] = useState<{
    step: 'room' | 'reason';
    res: Reservation;
    newRoomId: string;
    reason: 'damaged' | 'upgrade' | 'other' | '';
    description: string;
    newPrice: string;
    availableRooms: Room[];
    loading: boolean;
  } | null>(null);

  async function openRoomChange(res: Reservation) {
    setMenuOpenId(null);
    setRoomChangeModal({ step: 'room', res, newRoomId: '', reason: '', description: '', newPrice: '', availableRooms: [], loading: true });
    // Fetch conflicting room_ids for the reservation period
    const { data: conflicts } = await supabase
      .from('reservations')
      .select('room_id')
      .in('status', ['ocupado', 'reserva', 'mantenimiento', 'habilitacion', 'limpieza'])
      .neq('id', res.id)
      .lt('check_in', res.check_out)
      .gt('check_out', res.check_in);
    const blockedIds = new Set((conflicts ?? []).map((r: any) => r.room_id));
    blockedIds.add(res.room_id); // exclude current room
    const available = rooms.filter(r => !blockedIds.has(r.id));
    setRoomChangeModal(prev => prev ? { ...prev, availableRooms: available, loading: false } : null);
  }

  async function handleRoomChange() {
    if (!roomChangeModal || !roomChangeModal.newRoomId || !roomChangeModal.reason) return;
    const { res, newRoomId, reason, description, newPrice } = roomChangeModal;

    // Today = day of room change; tomorrow = day cleaning crew enters
    const todayDate = new Date();
    const today     = toDateStr(todayDate);
    const tomorrowDate = new Date(todayDate); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow  = toDateStr(tomorrowDate);
    const dayAfter  = toDateStr(new Date(tomorrowDate.getTime() + 86400000));

    // Move reservation to new room (optionally update price)
    const updatePayload: any = { room_id: newRoomId, updated_at: new Date().toISOString() };
    const parsedPrice = parseFloat(newPrice);
    if (!isNaN(parsedPrice) && parsedPrice > 0) updatePayload.price_per_night = parsedPrice;
    await supabase.from('reservations').update(updatePayload).eq('id', res.id);

    if (reason === 'damaged') {
      // Mantenimiento card on old room: starts today, ends at original checkout
      const summary = description.trim() || 'Daño reportado';
      await supabase.from('reservations').insert({
        room_id:         res.room_id,
        guest_name:      `⚠️ ${summary}`,
        num_guests:      0,
        check_in:        today,
        check_out:       res.check_out,
        status:          'mantenimiento',
        price_per_night: 0,
      });
    } else if (reason === 'upgrade') {
      // Limpieza card starts TOMORROW (day after room change), lasts 1 day
      await supabase.from('reservations').insert({
        room_id:         res.room_id,
        guest_name:      '🧹 Limpieza suave',
        num_guests:      0,
        check_in:        tomorrow,
        check_out:       dayAfter,
        status:          'limpieza',
        price_per_night: 0,
      });
    }

    logActivity(profile?.id, profile?.name, 'Reserva editada', 'reservation', res.id,
      `Cambio de habitación: ${res.room_id} → ${newRoomId} (${reason === 'damaged' ? 'Hab. dañada' : reason === 'upgrade' ? 'Mejor hab.' : 'Otro'})`);
    setRoomChangeModal(null);
    fetchData();
  }

  // Calendar hover highlight
  const [hoveredCell, setHoveredCell] = useState<{ roomId: string; day: number } | null>(null);

  // Pagos Pendientes panel
  const [pagosOpen, setPagosOpen] = useState(false);
  type PagoRow = { res: Reservation; total: number; paid: number; pending: number; vitrinaItems: PendingVitrinaItem[]; vitrinaTotal: number };
  const [pagoRows, setPagoRows]   = useState<PagoRow[]>([]);
  const [pagosLoading, setPagosLoading] = useState(false);
  type PagoForm = { resId: string; amount: string; caja: string; split: boolean; amount_qr: string; amount_cash: string };
  const [pagoForm, setPagoForm] = useState<PagoForm | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  async function openPagosPanel() {
    setPagosOpen(true);
    setPagosLoading(true);
    // Fetch all active (ocupado) reservations with price
    const { data: activas } = await supabase
      .from('reservations')
      .select('*')
      .eq('status', 'ocupado')
      .not('price_per_night', 'is', null);
    if (!activas?.length) { setPagoRows([]); setPagosLoading(false); return; }
    // Fetch H01-HOSPEDAJE ingresos filtered by reservation_id (not room_id) to avoid cross-reservation contamination
    const resIds = activas.map(r => r.id);
    const { data: txs } = await supabase
      .from('transactions')
      .select('reservation_id, amount')
      .in('reservation_id', resIds)
      .eq('type', 'ingreso')
      .eq('category', 'H01-HOSPEDAJE');
    const paidByRes: Record<string, number> = {};
    for (const t of txs ?? []) {
      if (t.reservation_id) {
        paidByRes[t.reservation_id] = (paidByRes[t.reservation_id] ?? 0) + t.amount;
      }
    }
    const rows: PagoRow[] = activas.map(res => {
      const ciDate      = new Date(res.check_in  + 'T00:00:00');
      const coDate      = new Date(res.check_out + 'T00:00:00');
      const nights      = Math.max(1, Math.round((coDate.getTime() - ciDate.getTime()) / 86400000));
      const total       = (res.price_per_night ?? 0) * nights;
      const paid        = paidByRes[res.id] ?? 0;
      const vitrinaItems = pendingVitrina[res.id] ?? [];
      const vitrinaTotal = vitrinaItems.reduce((s, i) => s + i.total, 0);
      const pending     = Math.max(0, total - paid);
      return { res, total, paid, pending, vitrinaItems, vitrinaTotal };
    });
    // Sort: pending first
    rows.sort((a, b) => (b.pending + b.vitrinaTotal) - (a.pending + a.vitrinaTotal));
    setPagoRows(rows);
    setPagosLoading(false);
  }

  async function confirmarPago() {
    if (!pagoForm || isPaying) return;
    const row = pagoRows.find(r => r.res.id === pagoForm.resId);
    if (!row) return;
    setIsPaying(true);

    const today    = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const ciDate   = new Date(row.res.check_in  + 'T00:00:00');
    const coDate   = new Date(row.res.check_out + 'T00:00:00');
    const nights   = Math.max(1, Math.round((coDate.getTime() - ciDate.getTime()) / 86400000));
    const nightStr = `${nights} noche${nights === 1 ? '' : 's'}`;
    const desc     = `Hospedaje — ${row.res.guest_name} — ${nightStr}`;

    if (pagoForm.split) {
      const amtQr   = parseFloat(pagoForm.amount_qr)   || 0;
      const amtCash = parseFloat(pagoForm.amount_cash)  || 0;
      if (amtQr <= 0 && amtCash <= 0) return;
      if (amtQr > 0) {
        await supabase.from('transactions').insert({
          date: today, type: 'ingreso', category: 'H01-HOSPEDAJE',
          room_id: row.res.room_id, reservation_id: row.res.id,
          amount: amtQr, description: desc, caja: 'CUENTA BNB',
          responsible_id: profile?.id ?? null,
        });
      }
      if (amtCash > 0) {
        await supabase.from('transactions').insert({
          date: today, type: 'ingreso', category: 'H01-HOSPEDAJE',
          room_id: row.res.room_id, reservation_id: row.res.id,
          amount: amtCash, description: desc, caja: 'CAJA MAYOR',
          responsible_id: profile?.id ?? null,
        });
      }
      logActivity(profile?.id, profile?.name, 'Pago registrado', 'transaction', row.res.id,
        `${row.res.room_id} — ${row.res.guest_name} · QR: Bs. ${amtQr.toFixed(2)}, Efectivo: Bs. ${amtCash.toFixed(2)}`);
    } else {
      const amount = parseFloat(pagoForm.amount);
      if (!amount || amount <= 0 || !pagoForm.caja) return;
      await supabase.from('transactions').insert({
        date: today, type: 'ingreso', category: 'H01-HOSPEDAJE',
        room_id: row.res.room_id, reservation_id: row.res.id,
        amount, description: desc, caja: pagoForm.caja,
        responsible_id: profile?.id ?? null,
      });
      logActivity(profile?.id, profile?.name, 'Pago registrado', 'transaction', row.res.id,
        `${row.res.room_id} — ${row.res.guest_name} · Bs. ${amount.toFixed(2)} (${pagoForm.caja})`);
    }

    // Create vitrina transactions if any pending items for this reservation
    const vitrinaItems = pendingVitrina[row.res.id] ?? [];
    for (const item of vitrinaItems) {
      await supabase.from('transactions').insert({
        date: today, type: 'ingreso', category: 'H03-VENTA DE VITRINAS',
        room_id: row.res.room_id, reservation_id: row.res.id,
        amount: item.total,
        description: `${item.productName}${item.qty > 1 ? ` x${item.qty}` : ''} — ${row.res.guest_name}`,
        caja: item.caja || 'CAJA MAYOR',
        responsible_id: profile?.id ?? null,
      });
      // Decrement stock
      const { data: prod } = await supabase.from('vitrina_products').select('quantity').eq('id', item.productId).single();
      if (prod) {
        await supabase.from('vitrina_products')
          .update({ quantity: Math.max(0, prod.quantity - item.qty), updated_at: new Date().toISOString() })
          .eq('id', item.productId);
      }
    }
    if (vitrinaItems.length > 0) {
      setPendingVitrina(prev => { const n = { ...prev }; delete n[row.res.id]; return n; });
      logActivity(profile?.id, profile?.name, 'Vitrina registrada', 'transaction', row.res.id,
        `${vitrinaItems.map(i => `${i.productName}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')} — ${row.res.room_id} · Bs. ${vitrinaItems.reduce((s, i) => s + i.total, 0).toFixed(2)}`);
    }

    setPagoForm(null);
    setIsPaying(false);
    openPagosPanel();
  }

  // Additional guests for confirm arrival modal
  const [confirmAdditionalGuests, setConfirmAdditionalGuests] = useState<AdditionalGuest[]>([]);

  // Custom confirm dialog (replaces browser confirm())
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; body: string; onConfirm: () => void;
  }>({ open: false, title: '', body: '', onConfirm: () => {} });

  // Quick action menu for empty cells
  const [quickMenu, setQuickMenu] = useState<{ roomId: string; day: number; x: number; y: number } | null>(null);
  // Context menu when clicking a filled card
  const [cardMenu, setCardMenu] = useState<{ res: Reservation; x: number; y: number } | null>(null);
  // Mantenimiento creation form
  const [maintenanceForm, setMaintenanceForm] = useState<{ roomId: string; day: number; detail: string; endDate: string } | null>(null);

  // Multi-select mode
  const [selectMode,     setSelectMode]     = useState(false);
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [selectedType,   setSelectedType]   = useState<ReservationStatus | null>(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);

  // Scroll to today
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading) return;
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    if (!isCurrentMonth || !scrollRef.current) return;
    const col = scrollRef.current.querySelector<HTMLElement>(`[data-day="${today.getDate()}"]`);
    if (col) {
      // Center today in the viewport, leaving room for the sticky column
      const stickyWidth = 130;
      const offset = col.offsetLeft - stickyWidth - scrollRef.current.clientWidth / 2 + col.offsetWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, offset);
    }
  }, [loading, month, year]); // eslint-disable-line

  // ── fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    const firstDay = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay  = `${year}-${String(month + 1).padStart(2,'0')}-${String(daysInMonth(year, month)).padStart(2,'0')}`;

    const { data: roomData, error: roomErr } = await supabase
      .from('rooms').select('*').order('id');

    if (roomErr) {
      setFetchError(`Error cargando habitaciones: ${roomErr.message} (${roomErr.code})`);
      setLoading(false);
      return;
    }

    const { data: resData, error: resErr } = await supabase
      .from('reservations').select('*')
      .lte('check_in', lastDay)
      .gte('check_out', firstDay)
      .order('check_in');

    if (resErr) {
      setFetchError(`Error cargando reservas: ${resErr.message}`);
    }

    setRooms(roomData ?? []);
    setReservations(resData ?? []);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load past empresa names for autocomplete
  useEffect(() => {
    supabase.from('reservations').select('empresa_name').eq('is_empresa', true).not('empresa_name', 'is', null)
      .then(({ data }) => {
        const names = [...new Set((data ?? []).map((r: any) => r.empresa_name).filter(Boolean))] as string[];
        setEmpresas(names);
      });
  }, []);

  // Compute check_out from check_in + num_nights (both flows)
  useEffect(() => {
    if (!form.check_in || form.num_nights < 1) return;
    const d = new Date(form.check_in + 'T00:00:00');
    d.setDate(d.getDate() + form.num_nights);
    const co = toDateStr(d);
    if (co !== form.check_out) setForm(f => ({ ...f, check_out: co }));
  }, [form.check_in, form.num_nights]); // eslint-disable-line

  // Close menus when clicking outside
  useEffect(() => {
    if (!menuOpenId && !actionMenuOpen) return;
    const h = () => { setMenuOpenId(null); setActionMenuOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpenId, actionMenuOpen]);

  // Sync additionalGuests length with num_guests whenever modal is open
  useEffect(() => {
    if (!modalOpen) return;
    const needed = Math.max(0, form.num_guests - 1);
    setAdditionalGuests(prev => {
      if (prev.length === needed) return prev;
      if (prev.length < needed) {
        const newGuests: AdditionalGuest[] = Array(needed - prev.length).fill(null).map(() => ({
          ...emptyAdditionalGuest(),
          country:   form.guest_country   || 'Boliviana',
          purpose:   form.guest_purpose   || '',
          origin:    form.guest_origin    || '',
          next_dest: form.guest_next_dest || '',
          transport: (form.guest_transport || '') as '' | 'T' | 'A',
        }));
        return [...prev, ...newGuests];
      }
      return prev.slice(0, needed);
    });
  }, [form.num_guests, modalOpen]); // eslint-disable-line

  // When guest 1 fields change, sync to additional guests (always mirror guest 1's values)
  useEffect(() => {
    if (!modalOpen) return;
    setAdditionalGuests(prev =>
      prev.map(g => ({
        ...g,
        phone:     form.guest_phone    || g.phone     || '',
        purpose:   g.purpose   || form.guest_purpose   || '',
        origin:    form.guest_origin    || '',
        next_dest: form.guest_next_dest || '',
        transport: (g.transport || form.guest_transport || '') as '' | 'T' | 'A',
      }))
    );
  }, [form.guest_phone, form.guest_purpose, form.guest_origin, form.guest_next_dest, form.guest_transport]); // eslint-disable-line

  // ── build cell map: cellMap[roomId][day] = Reservation ──
  const cellMap: Record<string, Record<number, Reservation>> = {};
  for (const res of reservations) {
    const start = toLocalDate(res.check_in);
    const end   = toLocalDate(res.check_out);
    // Same-day events (SALON): show on check_in day
    const isOneDay = start.getTime() >= end.getTime();
    const cur = new Date(start);
    do {
      if (cur.getFullYear() === year && cur.getMonth() === month) {
        const day = cur.getDate();
        if (!cellMap[res.room_id]) cellMap[res.room_id] = {};
        cellMap[res.room_id][day] = res;
      }
      cur.setDate(cur.getDate() + 1);
    } while (!isOneDay && cur < end);
  }

  // ── navigation ──
  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // ── open modal ──
  function openNew(roomId: string, day: number, statusOverride?: ReservationStatus, arrivalType?: 'reserva' | 'directo') {
    const date = toDateStr(new Date(year, month, day));
    const next = toDateStr(new Date(year, month, day + 1));
    setForm({
      ...emptyForm,
      room_id: roomId,
      check_in: date,
      check_out: next,
      status: statusOverride ?? 'reserva',
      arrival_type: arrivalType ?? 'reserva',
    });
    setAdditionalGuests([]);
    setChildGuests([]);
    setNumBabies(0);
    setEditingId(null);
    setFormError('');
    setQuickMenu(null);
    setModalOpen(true);
  }

  async function quickCreateStatus(roomId: string, day: number, status: ReservationStatus, name: string) {
    const date = toDateStr(new Date(year, month, day));
    const next = toDateStr(new Date(year, month, day + 1));
    await supabase.from('reservations').insert({
      room_id: roomId, guest_name: name, num_guests: 0,
      check_in: date, check_out: next, status,
      updated_at: new Date().toISOString(),
    });
    setQuickMenu(null);
    fetchData();
  }

  function openEdit(res: Reservation) {
    const r = res as any;
    const catering = r.catering ?? '';
    setForm({
      guest_name:        res.guest_name,
      num_guests:        res.num_guests,
      check_in:          res.check_in,
      check_out:         res.check_out,
      status:            res.status,
      room_subtype:      r.room_subtype ?? '',
      arrival_time:      r.arrival_time ?? '',
      departure_time:    r.departure_time ?? '',
      late_checkout:     r.late_checkout ?? false,
      is_blacklist:      r.is_blacklist ?? false,
      is_empresa:        res.is_empresa,
      has_pet:           res.has_pet,
      wants_invoice:     res.wants_invoice,
      price_per_night:   res.price_per_night?.toString() ?? '',
      notes:             res.notes ?? '',
      room_id:           res.room_id,
      start_time:        r.start_time ?? '',
      end_time:          r.end_time ?? '',
      catering_coffee:   catering.includes('cafe'),
      catering_sandwich: catering.includes('sandwich'),
      catering_water:    catering.includes('agua'),
      arrival_type:         (['reserva','confirmada'].includes(res.status) ? 'reserva' : 'directo') as 'reserva' | 'directo',
      num_nights:           (res.check_in && res.check_out)
                              ? Math.max(1, Math.round((new Date(res.check_out + 'T00:00:00').getTime() - new Date(res.check_in + 'T00:00:00').getTime()) / 86400000))
                              : 1,
      empresa_name:         r.empresa_name         ?? '',
      guest_phone:          r.guest_phone          ?? '',
      guest_gender:         r.guest_gender         ?? '',
      guest_birthdate:      r.guest_birthdate      ?? '',
      guest_marital_status: r.guest_marital_status ?? '',
      guest_country:        r.guest_country        ?? 'Boliviana',
      guest_document:       r.guest_document       ?? '',
      guest_profession:     r.guest_profession     ?? '',
      guest_purpose:        r.guest_purpose        ?? '',
      guest_origin:         r.guest_origin         ?? '',
      guest_next_dest:      r.guest_next_dest      ?? '',
      guest_transport:      r.guest_transport      ?? '',
    });
    const allGuestData = (r.additional_guests ?? []) as any[];
    setAdditionalGuests(allGuestData.filter((g: any) => !g.role || g.role === 'adult') as AdditionalGuest[]);
    setChildGuests(allGuestData.filter((g: any) => g.role === 'child').map((g: any) => ({ name: g.name ?? '', document: g.document ?? '', birthdate: g.birthdate ?? '' })));
    setNumBabies(allGuestData.find((g: any) => g.role === 'babies')?.count ?? 0);
    setEditingId(res.id);
    setFormError('');
    setModalOpen(true);
  }

  const isSalon = form.room_id === 'SALON';

  // ── save ──
  async function handleSave() {
    const resolvedName = form.is_empresa
      ? (form.empresa_name.trim() || form.guest_name.trim())
      : form.guest_name.trim();

    if (!isSalon) {
      // Subtype required if room has options
      const room = rooms.find(r => r.id === form.room_id);
      const opts = room ? subtypeOptions(room.type) : [];
      if (opts.length > 0 && !form.room_subtype)
        { setFormError('El tipo de habitación es obligatorio.'); return; }
      // Name
      if (!resolvedName)
        { setFormError('El nombre del huésped o empresa es obligatorio.'); return; }
      // Fecha entrada
      if (!form.check_in)
        { setFormError('La fecha de entrada es obligatoria.'); return; }
      // N° noches (ambos flows)
      if (form.num_nights < 1)
        { setFormError('El número de noches es obligatorio.'); return; }
      // Precio
      if (!form.price_per_night || parseFloat(form.price_per_night) <= 0)
        { setFormError('El precio por noche es obligatorio.'); return; }
    } else {
      if (!resolvedName) { setFormError('El nombre es obligatorio.'); return; }
      if (!form.check_in || !form.check_out) { setFormError('Las fechas son obligatorias.'); return; }
    }

    setSaving(true);
    setFormError('');

    // Catering string for SALON
    const cateringParts = [];
    if (form.catering_coffee)   cateringParts.push('cafe');
    if (form.catering_sandwich) cateringParts.push('sandwich');
    if (form.catering_water)    cateringParts.push('agua');

    const payload = {
      room_id:         form.room_id,
      guest_name:      form.is_empresa
        ? (form.guest_name.trim() || form.empresa_name.trim())
        : form.guest_name.trim(),
      num_guests:      form.num_guests,
      check_in:        form.check_in,
      check_out:       isSalon ? form.check_in : form.check_out,
      status:          form.status,
      room_subtype:    !isSalon && form.room_subtype ? form.room_subtype : null,
      arrival_time:    !isSalon && form.arrival_time   ? form.arrival_time   : null,
      departure_time:  !isSalon && form.departure_time ? form.departure_time : null,
      late_checkout:   !isSalon ? form.late_checkout  : false,
      is_blacklist:    !isSalon ? form.is_blacklist    : false,
      is_empresa:      form.is_empresa,
      has_pet:         isSalon ? false : form.has_pet,
      wants_invoice:   form.wants_invoice,
      price_per_night: form.price_per_night ? parseFloat(form.price_per_night) : null,
      notes:           form.notes || null,
      start_time:      isSalon && form.start_time ? form.start_time : null,
      end_time:        isSalon && form.end_time   ? form.end_time   : null,
      catering:        isSalon ? (cateringParts.join(',') || null) : null,
      // Empresa
      empresa_name:         form.is_empresa ? (form.empresa_name || null) : null,
      // Parte Diario fields (always saved for regular rooms)
      guest_phone:          !isSalon ? (form.guest_phone || null)           : null,
      guest_purpose:        !isSalon ? (form.guest_purpose || null) : null,
      guest_gender:         !isSalon ? (form.guest_gender || null)                        : null,
      guest_birthdate:      !isSalon ? (form.guest_birthdate || null)                     : null,
      guest_age:            !isSalon ? ageFromBirthdate(form.guest_birthdate)             : null,
      guest_marital_status: !isSalon ? (form.guest_marital_status || null)                : null,
      guest_country:        !isSalon ? (form.guest_country || null)        : null,
      guest_document:       !isSalon ? (form.guest_document || null)       : null,
      guest_profession:     !isSalon ? (form.guest_profession || null)     : null,
      guest_origin:         !isSalon ? (form.guest_origin || null)         : null,
      guest_next_dest:      !isSalon ? (form.guest_next_dest || null)      : null,
      guest_transport:      !isSalon ? (form.guest_transport || null)      : null,
      additional_guests:    !isSalon ? [
        ...additionalGuests,
        ...childGuests.filter(c => c.name.trim()).map(c => ({
          ...emptyAdditionalGuest(),
          name: c.name, document: c.document, birthdate: c.birthdate,
          role: 'child',
        })),
        ...(numBabies > 0 ? [{ role: 'babies', count: numBabies }] : []),
      ] : [],
      created_by:      profile?.id ?? null,
      updated_at:      new Date().toISOString(),
    };

    const { error } = editingId
      ? await supabase.from('reservations').update(payload).eq('id', editingId)
      : await supabase.from('reservations').insert(payload);

    setSaving(false);
    if (error) { setFormError('Error al guardar: ' + error.message); return; }
    logActivity(profile?.id, profile?.name, editingId ? 'Reserva editada' : 'Reserva creada', 'reservation', editingId ?? undefined, `${form.room_id} — ${resolvedName} (${form.check_in} → ${form.check_out})`);

    setModalOpen(false);
    fetchData();
  }

  // ── delete (from edit modal) ──
  function handleDelete() {
    if (!editingId) return;
    const id = editingId;
    setConfirmDialog({
      open: true,
      title: 'Eliminar reserva',
      body: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        const { data: del } = await supabase.from('reservations').select('room_id,guest_name').eq('id', id).single();
        await supabase.from('reservations').delete().eq('id', id);
        logActivity(profile?.id, profile?.name, 'Reserva eliminada', 'reservation', id, `${del?.room_id} — ${del?.guest_name}`);
        setModalOpen(false);
        fetchData();
      },
    });
  }

  // ── anular check-in completo (borra reserva + todas sus transacciones) ──
  function handleAnularCheckin(res: Reservation) {
    setConfirmDialog({
      open: true,
      title: '⚠️ Anular check-in completo',
      body: `Esto borrará la reserva de ${res.guest_name} (${res.room_id}), TODOS sus ingresos registrados y su boleta del historial. No se puede deshacer.`,
      onConfirm: async () => {
        // 1. Borrar transacciones con reservation_id (formato nuevo)
        await supabase.from('transactions').delete().eq('reservation_id', res.id);
        // 2. Borrar transacciones sin reservation_id en el mismo cuarto y rango de fechas (formato antiguo)
        await supabase.from('transactions').delete()
          .eq('room_id', res.room_id)
          .is('reservation_id', null)
          .gte('date', res.check_in)
          .lte('date', res.check_out);
        // 3. Borrar la reserva
        await supabase.from('reservations').delete().eq('id', res.id);
        setPendingVitrina(prev => { const n = { ...prev }; delete n[res.id]; return n; });
        logActivity(profile?.id, profile?.name, 'Check-in anulado', 'reservation', res.id,
          `${res.room_id} — ${res.guest_name} (ingresos y boleta eliminados)`);
        fetchData();
      },
    });
  }

  // ── delete from action menu ──
  function handleDeleteRes(e: React.MouseEvent, resId: string) {
    e.stopPropagation();
    setMenuOpenId(null);
    setConfirmDialog({
      open: true,
      title: 'Eliminar reserva',
      body: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        await supabase.from('reservations').delete().eq('id', resId);
        fetchData();
      },
    });
  }

  // ── open confirm arrival modal ──
  function openConfirmModal(e: React.MouseEvent, res: Reservation) {
    e.stopPropagation();
    setMenuOpenId(null);
    const r = res as any;
    const nights = (res.check_in && res.check_out)
      ? Math.max(1, Math.round((new Date(res.check_out + 'T00:00:00').getTime() - new Date(res.check_in + 'T00:00:00').getTime()) / 86400000))
      : 1;
    setConfirmAdditionalGuests((r.additional_guests ?? []) as AdditionalGuest[]);
    setConfirmModal({
      open: true, res,
      arrival_time:         r.arrival_time         ?? '',
      guest_name_edit:      res.guest_name,
      guest_phone:          r.guest_phone          ?? '',
      num_nights:           nights,
      guest_gender:         r.guest_gender         ?? '',
      guest_birthdate:      r.guest_birthdate      ?? '',
      guest_marital_status: r.guest_marital_status ?? '',
      guest_country:        r.guest_country        ?? 'Boliviana',
      guest_document:       r.guest_document       ?? '',
      guest_profession:     r.guest_profession     ?? '',
      guest_purpose:        r.guest_purpose        ?? '',
      guest_origin:         r.guest_origin         ?? '',
      guest_next_dest:      r.guest_next_dest      ?? '',
      guest_transport:      r.guest_transport      ?? '',
    });
  }

  async function handleConfirmArrival() {
    if (!confirmModal.res) return;
    const d = new Date(confirmModal.res.check_in + 'T00:00:00');
    d.setDate(d.getDate() + confirmModal.num_nights);
    const checkOut = toDateStr(d);
    await supabase.from('reservations').update({
      status:               'ocupado',
      check_out:            checkOut,
      guest_name:           confirmModal.guest_name_edit || confirmModal.res.guest_name,
      arrival_time:         confirmModal.arrival_time         || null,
      guest_phone:          confirmModal.guest_phone          || null,
      guest_gender:         confirmModal.guest_gender         || null,
      guest_birthdate:      confirmModal.guest_birthdate      || null,
      guest_age:            ageFromBirthdate(confirmModal.guest_birthdate || ''),
      guest_marital_status: confirmModal.guest_marital_status || null,
      guest_country:        confirmModal.guest_country        || null,
      guest_document:       confirmModal.guest_document       || null,
      guest_profession:     confirmModal.guest_profession     || null,
      guest_purpose:        confirmModal.guest_purpose        || null,
      guest_origin:         confirmModal.guest_origin         || null,
      guest_next_dest:      confirmModal.guest_next_dest      || null,
      guest_transport:      confirmModal.guest_transport      || null,
      additional_guests:    confirmAdditionalGuests,
      updated_at:           new Date().toISOString(),
    }).eq('id', confirmModal.res.id);
    logActivity(profile?.id, profile?.name, 'Llegada confirmada', 'reservation', confirmModal.res.id, `${confirmModal.res.room_id} — ${confirmModal.guest_name_edit || confirmModal.res.guest_name}`);
    setConfirmModal(m => ({ ...m, open: false }));
    setConfirmAdditionalGuests([]);
    fetchData();
  }

  // ── open checkout modal ──
  async function openCheckoutModal(e: React.MouseEvent, res: Reservation) {
    e.stopPropagation();
    setMenuOpenId(null);

    let siaat   = (res as any).siaat_number   ?? '';
    let invoice = (res as any).invoice_number ?? '';
    let wantInv = res.wants_invoice ?? false;

    // Auto-fill SIAAT from guest's previous stays
    if (!siaat && (res as any).guest_document) {
      const { data } = await supabase
        .from('reservations')
        .select('siaat_number')
        .eq('guest_document', (res as any).guest_document)
        .not('siaat_number', 'is', null)
        .order('check_out', { ascending: false })
        .limit(1);
      if (data?.[0]?.siaat_number) { siaat = data[0].siaat_number; wantInv = true; }
    }

    // Fetch hospedaje already paid for this reservation
    const { data: paidTxs } = await supabase
      .from('transactions').select('amount')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H01-HOSPEDAJE');
    const alreadyPaid = (paidTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);

    // Fetch late checkout transactions for this room (by room_id + category)
    const { data: lateTxs } = await supabase
      .from('transactions').select('amount')
      .eq('room_id', res.room_id).eq('type', 'ingreso').eq('category', 'H02-LATE CHECKOUT')
      .gte('date', res.check_in);
    const latePaid  = (lateTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);
    const lateTotal = latePaid; // already paid from late checkout popup; show it

    setCheckoutModal({
      open: true, res,
      departure_time: (res as any).departure_time ?? '',
      is_invoice: wantInv,
      siaat_number:   siaat,
      invoice_number: invoice,
      is_blacklist:   (res as any).is_blacklist ?? false,
      checkoutPaid:        alreadyPaid,
      checkoutHospPayAmt:  '',
      checkoutHospPayCaja: 'CAJA MAYOR',
      checkoutLatePaid:    latePaid,
      checkoutLateTotal:   lateTotal,
      checkoutLatePayAmt:  '',
      checkoutLatePayCaja: 'CAJA MAYOR',
      checkoutPaidVitrina: [],
    });
  }

  async function handleCheckout() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });

    // Process any remaining pending vitrina transactions
    const vitrinaItems = pendingVitrina[res.id] ?? [];
    for (const item of vitrinaItems) {
      await supabase.from('transactions').insert({ date: today, type: 'ingreso', category: 'H03-VENTA DE VITRINAS', room_id: res.room_id, reservation_id: res.id, amount: item.total, description: `${item.productName}${item.qty > 1 ? ` x${item.qty}` : ''} — ${res.guest_name}`, caja: item.caja || 'CAJA MAYOR', responsible_id: profile?.id ?? null });
      const { data: prod } = await supabase.from('vitrina_products').select('quantity').eq('id', item.productId).single();
      if (prod) await supabase.from('vitrina_products').update({ quantity: Math.max(0, prod.quantity - item.qty), updated_at: new Date().toISOString() }).eq('id', item.productId);
    }
    if (vitrinaItems.length > 0) {
      setPendingVitrina(prev => { const n = { ...prev }; delete n[res.id]; return n; });
      logActivity(profile?.id, profile?.name, 'Vitrina registrada (checkout)', 'transaction', res.id, `${vitrinaItems.map(i => `${i.productName}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')} — ${res.room_id}`);
    }

    await supabase.from('reservations').update({
      departure_time: checkoutModal.departure_time || null,
      wants_invoice:  checkoutModal.is_invoice,
      siaat_number:   checkoutModal.is_invoice ? (checkoutModal.siaat_number   || null) : null,
      invoice_number: checkoutModal.is_invoice ? (checkoutModal.invoice_number || null) : null,
      is_blacklist:   checkoutModal.is_blacklist,
      updated_at:     new Date().toISOString(),
    }).eq('id', res.id);

    // Auto-create habilitación for the day after checkout (= check_out date)
    const habDate = res.check_out;
    const habEnd  = toDateStr(new Date(new Date(habDate + 'T00:00:00').getTime() + 86400000));
    const { data: existing } = await supabase.from('reservations')
      .select('id').eq('room_id', res.room_id)
      .lte('check_in', habDate).gt('check_out', habDate).limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from('reservations').insert({
        room_id:    res.room_id,
        guest_name: 'Habilitación',
        num_guests: 0,
        check_in:   habDate,
        check_out:  habEnd,
        status:     'habilitacion',
        updated_at: new Date().toISOString(),
      });
    }

    logActivity(profile?.id, profile?.name, 'Salida registrada', 'reservation', res.id, `${res.room_id} — ${res.guest_name}`);
    setCheckoutModal(m => ({ ...m, open: false }));
    fetchData();
  }

  // ── per-section checkout payment helpers ──
  async function checkoutPayHosp() {
    const amt = parseFloat(checkoutModal.checkoutHospPayAmt) || 0;
    if (amt <= 0 || !checkoutModal.res) return;
    const res = checkoutModal.res;
    const now  = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    const nights  = Math.max(1, Math.round(
      (new Date(res.check_out + 'T00:00:00').getTime() - new Date(res.check_in + 'T00:00:00').getTime()) / 86400000
    ));
    await supabase.from('transactions').insert({
      date: today, time: timeStr, type: 'ingreso', category: 'H01-HOSPEDAJE',
      room_id: res.room_id, reservation_id: res.id, amount: amt,
      description: `Hospedaje ${nights} noche${nights === 1 ? '' : 's'} — ${res.guest_name}`,
      caja: checkoutModal.checkoutHospPayCaja, responsible_id: profile?.id ?? null,
    });
    logActivity(profile?.id, profile?.name, 'Pago hospedaje', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutHospPayCaja})`);
    setCheckoutModal(m => ({ ...m, checkoutPaid: m.checkoutPaid + amt, checkoutHospPayAmt: '' }));
  }

  async function checkoutPayLate() {
    const amt = parseFloat(checkoutModal.checkoutLatePayAmt) || 0;
    if (amt <= 0 || !checkoutModal.res) return;
    const res = checkoutModal.res;
    const now  = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    await supabase.from('transactions').insert({
      date: today, time: timeStr, type: 'ingreso', category: 'H02-LATE CHECKOUT',
      room_id: res.room_id, reservation_id: res.id, amount: amt,
      description: `Late Checkout — ${res.guest_name}`,
      caja: checkoutModal.checkoutLatePayCaja, responsible_id: profile?.id ?? null,
    });
    logActivity(profile?.id, profile?.name, 'Pago late checkout', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutLatePayCaja})`);
    setCheckoutModal(m => ({ ...m, checkoutLatePaid: m.checkoutLatePaid + amt, checkoutLateTotal: m.checkoutLateTotal + amt, checkoutLatePayAmt: '' }));
  }

  async function checkoutPayVitrinaItem(item: PendingVitrinaItem) {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const now  = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    await supabase.from('transactions').insert({
      date: today, time: timeStr, type: 'ingreso', category: 'H03-VENTA DE VITRINAS',
      room_id: res.room_id, reservation_id: res.id, amount: item.total,
      description: `${item.productName}${item.qty > 1 ? ` x${item.qty}` : ''} — ${res.guest_name}`,
      caja: item.caja || 'CAJA MAYOR', responsible_id: profile?.id ?? null,
    });
    const { data: prod } = await supabase.from('vitrina_products').select('quantity').eq('id', item.productId).single();
    if (prod) await supabase.from('vitrina_products').update({ quantity: Math.max(0, prod.quantity - item.qty), updated_at: new Date().toISOString() }).eq('id', item.productId);
    setPendingVitrina(prev => ({ ...prev, [res.id]: (prev[res.id] ?? []).filter(i => i.productId !== item.productId) }));
    setCheckoutModal(m => ({ ...m, checkoutPaidVitrina: [...m.checkoutPaidVitrina, item] }));
    logActivity(profile?.id, profile?.name, 'Vitrina pagada', 'transaction', res.id,
      `${item.productName}${item.qty > 1 ? ` x${item.qty}` : ''} — ${res.room_id} Bs. ${item.total.toFixed(2)}`);
  }

  async function checkoutAnularHosp() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const { data: txs } = await supabase.from('transactions').select('id, amount')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H01-HOSPEDAJE')
      .order('created_at', { ascending: false }).limit(1);
    const tx = txs?.[0];
    if (!tx) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    logActivity(profile?.id, profile?.name, 'Pago anulado (hospedaje)', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${tx.amount.toFixed(2)}`);
    setCheckoutModal(m => ({ ...m, checkoutPaid: Math.max(0, m.checkoutPaid - tx.amount) }));
  }

  async function checkoutAnularLate() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const { data: txs } = await supabase.from('transactions').select('id, amount')
      .eq('room_id', res.room_id).eq('type', 'ingreso').eq('category', 'H02-LATE CHECKOUT')
      .gte('date', res.check_in).order('created_at', { ascending: false }).limit(1);
    const tx = txs?.[0];
    if (!tx) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    logActivity(profile?.id, profile?.name, 'Pago anulado (late checkout)', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${tx.amount.toFixed(2)}`);
    setCheckoutModal(m => ({ ...m, checkoutLatePaid: 0, checkoutLateTotal: 0 }));
  }

  async function checkoutAnularVitrinaItem(resId: string, txDesc: string, productId: string, qty: number, amount: number) {
    const { data: txs } = await supabase.from('transactions').select('id')
      .eq('reservation_id', resId).eq('type', 'ingreso').eq('category', 'H03-VENTA DE VITRINAS')
      .ilike('description', `${txDesc}%`).order('created_at', { ascending: false }).limit(1);
    const tx = txs?.[0];
    if (!tx) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    // restore stock
    const { data: prod } = await supabase.from('vitrina_products').select('quantity').eq('id', productId).single();
    if (prod) await supabase.from('vitrina_products').update({ quantity: prod.quantity + qty, updated_at: new Date().toISOString() }).eq('id', productId);
    logActivity(profile?.id, profile?.name, 'Vitrina anulada', 'transaction', resId, `Bs. ${amount.toFixed(2)} revertido`);
  }

  // ── guest lookup by phone or document ──
  async function lookupGuest(value: string, field: 'guest_phone' | 'guest_document') {
    if (value.length < 4) return;
    const { data } = await supabase.from('reservations')
      .select('guest_name, guest_phone, guest_gender, guest_birthdate, guest_marital_status, guest_country, guest_document, guest_profession, guest_purpose, guest_origin, guest_next_dest, guest_transport')
      .eq(field, value)
      .not('guest_name', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    const g = data?.[0];
    if (!g) return;
    setForm(f => ({
      ...f,
      guest_name:           g.guest_name           ?? f.guest_name,
      guest_phone:          g.guest_phone           ?? f.guest_phone,
      guest_gender:         g.guest_gender          ?? f.guest_gender,
      guest_birthdate:      g.guest_birthdate       ?? f.guest_birthdate,
      guest_marital_status: g.guest_marital_status  ?? f.guest_marital_status,
      guest_country:        g.guest_country         ?? f.guest_country,
      guest_document:       g.guest_document        ?? f.guest_document,
      guest_profession:     g.guest_profession      ?? f.guest_profession,
      guest_purpose:        g.guest_purpose         ?? f.guest_purpose,
      guest_origin:         g.guest_origin          ?? f.guest_origin,
      guest_next_dest:      g.guest_next_dest       ?? f.guest_next_dest,
      guest_transport:      g.guest_transport       ?? f.guest_transport,
    }));
    setGuestAutoFilled(true);
    setTimeout(() => setGuestAutoFilled(false), 3000);
  }

  async function lookupAdditionalGuest(value: string, field: 'guest_phone' | 'guest_document', idx: number) {
    if (value.length < 4) return;
    const { data } = await supabase.from('reservations')
      .select('guest_name, guest_phone, guest_gender, guest_birthdate, guest_marital_status, guest_country, guest_document, guest_profession, guest_purpose, guest_origin, guest_next_dest, guest_transport')
      .eq(field, value)
      .not('guest_name', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    const g = data?.[0];
    if (!g) return;
    setAdditionalGuests(prev => prev.map((ag, i) => i !== idx ? ag : {
      ...ag,
      name:           g.guest_name           ?? ag.name,
      phone:          g.guest_phone           ?? ag.phone,
      gender:         g.guest_gender          ?? ag.gender,
      birthdate:      g.guest_birthdate       ?? ag.birthdate,
      marital_status: g.guest_marital_status  ?? ag.marital_status,
      country:        g.guest_country         ?? ag.country,
      document:       g.guest_document        ?? ag.document,
      profession:     g.guest_profession      ?? ag.profession,
      purpose:        g.guest_purpose         ?? ag.purpose,
      origin:         g.guest_origin          ?? ag.origin,
      next_dest:      g.guest_next_dest       ?? ag.next_dest,
      transport:      g.guest_transport       ?? ag.transport,
    }));
  }

  // ── select mode ──
  function toggleSelectMode() {
    setSelectMode(s => !s);
    setSelectedIds(new Set());
    setSelectedType(null);
    setActionMenuOpen(false);
  }

  function toggleCellSelect(res: Reservation) {
    if (!selectMode) return;
    // Enforce same-type selection
    if (selectedIds.size > 0 && selectedType !== res.status) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(res.id)) {
        next.delete(res.id);
        if (next.size === 0) setSelectedType(null);
      } else {
        next.add(res.id);
        setSelectedType(res.status);
      }
      return next;
    });
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    const typeLabel = selectedType === 'reserva'      ? 'reservas'
                    : selectedType === 'habilitacion' ? 'habilitaciones'
                    : selectedType === 'mantenimiento'? 'mantenimientos'
                    : 'elementos';
    setActionMenuOpen(false);
    setConfirmDialog({
      open: true,
      title: `Eliminar ${selectedIds.size} ${typeLabel}`,
      body: 'Esta acción no se puede deshacer.',
      onConfirm: async () => {
        await supabase.from('reservations').delete().in('id', [...selectedIds]);
        setSelectedIds(new Set());
        setSelectedType(null);
        setSelectMode(false);
        fetchData();
      },
    });
  }

  // ── days array ──
  const numDays = daysInMonth(year, month);
  const days = Array.from({ length: numDays }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendario de Reservas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {MONTH_NAMES[month]} {year}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="px-3 text-sm font-bold text-gray-900 min-w-[140px] text-center tracking-wide">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700 transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Select + 3-dot actions */}
          <div className="flex items-center gap-2">
            <button onClick={toggleSelectMode}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors ${
                selectMode
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
              }`}>
              <CheckSquare size={14} />
              {selectMode && selectedIds.size > 0 ? `${selectedIds.size} sel.` : 'Seleccionar'}
            </button>

            <div className="relative" onClick={e => e.stopPropagation()}>
              <button disabled={selectedIds.size === 0} onClick={() => setActionMenuOpen(o => !o)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  selectedIds.size > 0
                    ? 'border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                    : 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-50'
                }`}>
                <MoreHorizontal size={16} />
              </button>

              {actionMenuOpen && selectedIds.size > 0 && (
                <div className="absolute right-0 top-9 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-56 z-[100]">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                  </div>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={deleteSelected} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 font-medium flex items-center gap-2">
                    <Trash2 size={14} />
                    {selectedType === 'reserva' ? 'Eliminar reservas'
                    : selectedType === 'habilitacion' ? 'Eliminar habilitaciones'
                    : selectedType === 'mantenimiento' ? 'Eliminar mantenimientos'
                    : 'Eliminar seleccionados'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(STATUS_CONFIG) as [ReservationStatus, typeof STATUS_CONFIG[ReservationStatus]][]).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${cfg.bg}`} />
            <span className="text-xs text-gray-600">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {fetchError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          {fetchError}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="border-collapse" style={{ minWidth: `${130 + numDays * 116}px` }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-50">
                {/* Room header */}
                <th className="sticky left-0 z-30 bg-gray-50 text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b-2 border-r-2 border-gray-300 w-32">
                  Habitación
                </th>
                {days.map(d => {
                  const dow = new Date(year, month, d).getDay();
                  const isToday =
                    d === today.getDate() &&
                    month === today.getMonth() &&
                    year === today.getFullYear();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th
                      key={d}
                      data-day={d}
                      className={`text-center border-b-2 border-r border-gray-300 px-2 py-2.5 w-[116px] min-w-[116px] transition-colors ${
                        isToday
                          ? 'bg-amber-50 border-b-amber-400'
                          : isWeekend
                          ? 'bg-gray-100 border-b-gray-400'
                          : hoveredCell?.day === d
                          ? 'bg-amber-50 border-b-amber-400'
                          : 'bg-gray-50 border-b-gray-400'
                      }`}
                    >
                      <div className={`text-sm font-bold ${isToday ? 'text-amber-600' : 'text-gray-700'}`}>{d}</div>
                      <div className={`text-xs font-medium ${isToday ? 'text-amber-500' : 'text-gray-400'}`}>
                        {DAY_NAMES[dow]}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room, ri) => (
                <tr key={room.id} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  {/* Room label */}
                  <td className={`sticky left-0 z-10 border-r-2 border-b border-gray-300 px-4 py-2 w-32 transition-colors ${
                    hoveredCell?.roomId === room.id ? 'bg-amber-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}>
                    <div className={`font-bold text-sm transition-colors ${hoveredCell?.roomId === room.id ? 'text-amber-700' : 'text-gray-900'}`}>{room.id}</div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">{room.type}</div>
                  </td>

                  {/* Day cells */}
                  {days.map(d => {
                    const res = cellMap[room.id]?.[d];
                    const cfg = res ? STATUS_CONFIG[res.status] : null;
                    const dateStr = toDateStr(new Date(year, month, d));

                    // Determine cell role in the reservation span
                    const isCheckIn  = res && res.check_in === dateStr;
                    const checkOutMinusOne = res
                      ? toDateStr(new Date(toLocalDate(res.check_out).getTime() - 86400000))
                      : null;
                    const isCheckOut = res && checkOutMinusOne === dateStr;

                    // Arrival / departure times
                    const arrivalTime   = (res as any)?.arrival_time   ? (res as any).arrival_time.slice(0,5)   : null;
                    const departureTime = (res as any)?.departure_time ? (res as any).departure_time.slice(0,5) : null;

                    return (
                      <td
                        key={d}
                        className={`border-r border-b border-gray-300 p-1 h-16 align-top transition-colors ${
                          hoveredCell?.roomId === room.id && hoveredCell?.day === d
                            ? 'bg-amber-100/60'
                            : hoveredCell?.roomId === room.id
                            ? 'bg-amber-50/50'
                            : hoveredCell?.day === d
                            ? 'bg-amber-50/40'
                            : ''
                        }`}
                      >
                        {res ? (
                          <div
                            className={`relative w-full h-full group ${selectMode && selectedType && selectedType !== res.status ? 'opacity-30' : ''}`}
                            onMouseEnter={() => setHoveredCell({ roomId: room.id, day: d })}
                            onMouseLeave={() => setHoveredCell(null)}
                          >
                          <button
                            onClick={e => {
                              if (selectMode) { toggleCellSelect(res); return; }
                              setCardMenu({ res, x: e.clientX, y: e.clientY });
                            }}
                            className={`w-full h-full rounded-lg px-2 py-1 text-left transition-all ${cfg?.bg ?? 'bg-gray-400'} ${cfg?.text ?? 'text-white'} ${
                              selectMode
                                ? selectedIds.has(res.id)
                                  ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent brightness-110'
                                  : selectedType && selectedType !== res.status
                                    ? 'cursor-not-allowed'
                                    : 'hover:brightness-110 cursor-pointer'
                                : 'hover:opacity-80 cursor-pointer'
                            }`}
                          >
                            {res.status === 'mantenimiento' ? (
                              <div className="text-xs font-bold leading-tight break-words">
                                🔧 {(res as any).notes || 'Mantenimiento'}
                              </div>
                            ) : res.status === 'habilitacion' ? (
                              <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="text-base leading-none">🧹</div>
                                <div className="text-[10px] font-bold mt-0.5 opacity-90">Habilitación</div>
                              </div>
                            ) : isCheckIn ? (
                              /* ── First day: full name + flags + both times ── */
                              <>
                                <div className="text-xs font-bold leading-tight line-clamp-2">
                                  {res.is_empresa && (res as any).empresa_name ? (res as any).empresa_name : res.guest_name}
                                </div>
                                {res.is_empresa && (res as any).empresa_name && res.guest_name && res.guest_name !== (res as any).empresa_name && (
                                  <div className="text-[10px] leading-tight opacity-90 truncate">{res.guest_name}</div>
                                )}
                                <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                                  <span className="text-[10px] opacity-80 font-semibold">{res.num_guests}p</span>
                                  {res.is_empresa    && <Building2 size={9} className="opacity-80" />}
                                  {res.has_pet       && <span className="text-[10px] opacity-80">🐾</span>}
                                  {res.wants_invoice && <span className="text-[10px] opacity-80">🧾</span>}
                                  {(res as any).is_blacklist && <span className="text-[10px]">🚫</span>}
                                  {arrivalTime && (
                                    <span className="text-[10px] font-bold bg-green-700 text-white rounded px-0.5 py-px leading-none">
                                      ⬇ {arrivalTime}
                                    </span>
                                  )}
                                  {(res as any).late_checkout ? (
                                    <span className="text-[10px] font-bold bg-red-600 text-white rounded px-0.5 py-px leading-none">
                                      🌙{departureTime ? ` ${departureTime}` : ' LC'}
                                    </span>
                                  ) : departureTime ? (
                                    <span className="text-[10px] font-bold bg-red-600 text-white rounded px-0.5 py-px leading-none">
                                      ⬆ {departureTime}
                                    </span>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              /* ── Middle / last day: full name + icons, no arrival time ── */
                              <>
                                <div className="text-xs font-bold leading-tight line-clamp-2">
                                  {res.is_empresa && (res as any).empresa_name ? (res as any).empresa_name : res.guest_name}
                                </div>
                                {res.is_empresa && (res as any).empresa_name && res.guest_name && res.guest_name !== (res as any).empresa_name && (
                                  <div className="text-[10px] leading-tight opacity-90 truncate">{res.guest_name}</div>
                                )}
                                <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                                  {res.num_guests > 0 && <span className="text-[10px] opacity-80 font-semibold">{res.num_guests}p</span>}
                                  {res.is_empresa    && <Building2 size={9} className="opacity-80" />}
                                  {res.has_pet       && <span className="text-[10px] opacity-80">🐾</span>}
                                  {res.wants_invoice && <span className="text-[10px] opacity-80">🧾</span>}
                                  {(res as any).late_checkout ? (
                                    <span className="text-[10px] font-bold bg-red-600 text-white rounded px-0.5 py-px leading-none">
                                      🌙{departureTime ? ` ${departureTime}` : ' LC'}
                                    </span>
                                  ) : isCheckOut && departureTime ? (
                                    <span className="text-[10px] font-bold bg-red-600 text-white rounded px-0.5 py-px leading-none">
                                      ⬆ {departureTime}
                                    </span>
                                  ) : null}
                                </div>
                              </>
                            )}
                          </button>

                          {/* ── Selection checkmark ── */}
                          {selectMode && isCheckIn && (
                            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              selectedIds.has(res.id)
                                ? 'bg-white border-white'
                                : 'border-white/60 bg-transparent'
                            }`}>
                              {selectedIds.has(res.id) && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke={cfg?.bg.includes('amber') ? '#92400e' : '#166534'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          )}
                          </div>
                        ) : (
                          <button
                            onClick={e => {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setQuickMenu({ roomId: room.id, day: d, x: rect.left, y: rect.bottom });
                            }}
                            className="w-full h-full rounded-lg hover:bg-amber-50 transition-colors group"
                          >
                            <Plus size={14} className="mx-auto text-gray-300 group-hover:text-amber-400 transition-colors" />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
              {/* ── Total guests per day ── */}
              <tfoot className="sticky bottom-0 z-20">
                <tr>
                  <td className="sticky left-0 z-30 bg-gray-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white border-t-2 border-gray-700 w-32">
                    # Personas
                  </td>
                  {days.map(d => {
                    const total = rooms.reduce((sum, room) => {
                      const res = cellMap[room.id]?.[d];
                      return sum + (res && room.id !== 'SALON' ? res.num_guests : 0);
                    }, 0);
                    return (
                      <td key={d} className="bg-gray-900 text-center border-t-2 border-gray-700 border-r border-gray-800 py-2">
                        {total > 0
                          ? <span className="text-sm font-bold text-amber-400">{total}</span>
                          : <span className="text-xs text-gray-500">—</span>}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
          </table>
        </div>
      )}

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

            {/* ── SALON modal header ── */}
            {isSalon ? (
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50 rounded-t-2xl shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                    <Building2 size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">
                      {editingId ? 'Editar Evento' : 'Reservar Salón'}
                    </h3>
                    <p className="text-xs text-indigo-600 font-medium">SALÓN DE EVENTOS</p>
                  </div>
                </div>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                <h3 className="font-bold text-gray-900">
                  {editingId ? 'Editar Reserva' : 'Nueva Reserva'} — {form.room_id}
                </h3>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
            )}

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

              {/* ══════════════════════════════
                  SALON FORM
                  ══════════════════════════════ */}
              {isSalon ? (
                <>
                  {/* Es Empresa toggle */}
                  <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={form.is_empresa}
                        onChange={e => setForm(f => ({ ...f, is_empresa: e.target.checked, ...(e.target.checked ? { guest_purpose: 'Trabajo' } : {}) }))}
                        className="w-4 h-4 rounded accent-indigo-500" />
                      <Building2 size={15} className="text-indigo-600" />
                      <span className="text-sm font-medium text-gray-700">Es Empresa</span>
                    </label>
                    {form.is_empresa && (
                      <>
                        <input type="text" list="empresas-list-salon" value={form.empresa_name}
                          onChange={e => setForm(f => ({ ...f, empresa_name: e.target.value }))}
                          className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                          placeholder="Nombre de la empresa..." autoComplete="off" />
                        <datalist id="empresas-list-salon">
                          {empresas.map((name, i) => <option key={i} value={name} />)}
                        </datalist>
                      </>
                    )}
                  </div>

                  {/* Cliente / Empresa */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {form.is_empresa ? 'Nombre del contacto' : 'Cliente / Empresa'} *
                    </label>
                    <input
                      type="text"
                      value={form.guest_name}
                      onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="Ej: Empresa ABC, Juan García..."
                      autoFocus
                    />
                  </div>

                  {/* Fecha + N° personas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                      <DatePicker
                        value={form.check_in}
                        onChange={v => setForm(f => ({ ...f, check_in: v, check_out: v }))}
                        placeholder="Fecha del evento"
                        accentClass="border-indigo-400 ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">N° personas</label>
                      <input
                        type="number"
                        min={1} max={100}
                        value={form.num_guests}
                        onChange={e => setForm(f => ({ ...f, num_guests: parseInt(e.target.value) || 1 }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-indigo-400 focus:ring-indigo-100"
                      />
                    </div>
                  </div>

                  {/* Hora inicio → Hora fin */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio</label>
                      <TimePicker
                        value={form.start_time}
                        onChange={v => setForm(f => ({ ...f, start_time: v }))}
                        placeholder="-- : --"
                        emoji="▶️"
                        accentClass="border-indigo-400 ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hora fin</label>
                      <TimePicker
                        value={form.end_time}
                        onChange={v => setForm(f => ({ ...f, end_time: v }))}
                        placeholder="-- : --"
                        emoji="⏹️"
                        accentClass="border-indigo-400 ring-indigo-100"
                      />
                    </div>
                  </div>

                  {/* Precio total */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio total (Bs.)</label>
                    <input
                      type="number"
                      min={0} step={0.01}
                      value={form.price_per_night}
                      onChange={e => setForm(f => ({ ...f, price_per_night: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Catering */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Catering</label>
                    <div className="flex gap-3">
                      {([
                        ['catering_coffee',   '☕ Café'],
                        ['catering_sandwich', '🥪 Sándwich'],
                        ['catering_water',    '💧 Agua'],
                      ] as [keyof typeof form, string][]).map(([key, label]) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            form[key]
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={form[key] as boolean}
                            onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                            className="sr-only"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Estado + Factura */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                      <select
                        value={form.status}
                        onChange={e => setForm(f => ({ ...f, status: e.target.value as ReservationStatus }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {(Object.entries(STATUS_CONFIG) as [ReservationStatus, typeof STATUS_CONFIG[ReservationStatus]][]).map(([key, cfg]) => (
                          <option key={key} value={key}>{cfg.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.wants_invoice}
                          onChange={e => setForm(f => ({ ...f, wants_invoice: e.target.checked }))}
                          className="w-4 h-4 rounded accent-indigo-500"
                        />
                        <Receipt size={14} className="text-gray-500" />
                        <span className="text-sm text-gray-700">Factura</span>
                      </label>
                    </div>
                  </div>

                  {/* Notas */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      placeholder="Requerimientos especiales, equipamiento, etc."
                    />
                  </div>
                </>
              ) : (
                /* ══════════════════════════════
                   REGULAR ROOM FORM
                   ══════════════════════════════ */
                <>
                  {/* Room selector + subtype */}
                  <div className="grid grid-cols-2 gap-3">
                    {!editingId ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Habitación <span className="text-red-400">*</span></label>
                        <CustomSelect
                          value={form.room_id}
                          onChange={v => setForm(f => ({ ...f, room_id: v, room_subtype: '' }))}
                          options={rooms.filter(r => r.id !== 'SALON').map(r => ({ value: r.id, label: `${r.id} — ${r.type}` }))}
                          placeholder="— Habitación —"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Habitación</label>
                        <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600">{form.room_id}</div>
                      </div>
                    )}
                    {(() => {
                      const room = rooms.find(r => r.id === form.room_id);
                      const opts = room ? subtypeOptions(room.type) : [];
                      return opts.length > 0 ? (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo <span className="text-red-400">*</span></label>
                          <CustomSelect
                            value={form.room_subtype}
                            onChange={v => setForm(f => ({ ...f, room_subtype: v }))}
                            options={opts.map(o => ({ value: o, label: o }))}
                            placeholder="— Tipo —"
                          />
                        </div>
                      ) : <div />;
                    })()}
                  </div>

                  {/* ── Tipo de llegada ── */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tipo de llegada</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['reserva', '📅', 'Es Reserva',       'bg-amber-400 text-gray-900 border-amber-400', 'border-gray-200 text-gray-500 hover:border-amber-300 hover:text-gray-700'],
                        ['directo', '🚶', 'Llegó de la nada', 'bg-blue-500 text-white border-blue-500',       'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-gray-700'],
                      ] as [string, string, string, string, string][]).map(([type, emoji, label, activeClass, inactiveClass]) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setForm(f => ({
                            ...f,
                            arrival_type: type as 'reserva' | 'directo',
                            status: type === 'reserva' ? 'reserva' : 'ocupado',
                          }))}
                          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all select-none ${
                            form.arrival_type === type ? activeClass : inactiveClass
                          }`}
                        >
                          <span>{emoji}</span>
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>


                  {/* ══ ES RESERVA — formulario ligero ══ */}
                  {form.arrival_type === 'reserva' && (
                    <>
                      {/* Es Empresa / Nombre */}
                      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre <span className="text-red-400">*</span></span>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={form.is_empresa}
                            onChange={e => setForm(f => ({ ...f, is_empresa: e.target.checked, ...(e.target.checked ? { guest_purpose: 'Trabajo' } : {}) }))}
                            className="w-4 h-4 rounded accent-blue-500" />
                          <Building2 size={15} className="text-blue-600" />
                          <span className="text-sm font-medium text-gray-700">Es Empresa</span>
                        </label>
                        {form.is_empresa ? (
                          <>
                            <input type="text" list="empresas-list" value={form.empresa_name}
                              onChange={e => setForm(f => ({ ...f, empresa_name: e.target.value }))}
                              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              placeholder="Nombre de la empresa..." autoComplete="off" />
                            <datalist id="empresas-list">
                              {empresas.map((name, i) => <option key={i} value={name} />)}
                            </datalist>
                            <label className="block text-xs font-medium text-gray-500 mt-1">Nombre del huésped</label>
                            <input type="text" value={form.guest_name}
                              onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                              onBlur={e => { if (!form.guest_gender) setForm(f => ({ ...f, guest_gender: guessGender(e.target.value) })); }}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                              placeholder="Nombre del huésped que reserva" />
                          </>
                        ) : (
                          <input type="text" value={form.guest_name}
                            onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                            onBlur={e => { if (!form.guest_gender) setForm(f => ({ ...f, guest_gender: guessGender(e.target.value) })); }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder="Nombre del huésped que reserva" />
                        )}
                      </div>

                      {/* Fecha entrada + hora posible */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha entrada <span className="text-red-400">*</span></label>
                          <DatePicker value={form.check_in} onChange={v => setForm(f => ({ ...f, check_in: v }))} placeholder="Fecha de llegada" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Hora posible</label>
                          <TimePicker value={form.arrival_time} onChange={v => setForm(f => ({ ...f, arrival_time: v }))} placeholder="-- : --" emoji="🛬" />
                        </div>
                      </div>

                      {/* N° noches + precio */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">N° noches <span className="text-red-400">*</span></label>
                          <input type="number" min={1} max={60} value={form.num_nights}
                            onChange={e => setForm(f => ({ ...f, num_nights: parseInt(e.target.value) || 1 }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Precio/noche (Bs.) <span className="text-red-400">*</span></label>
                          <input type="number" min={0} step={0.5} value={form.price_per_night}
                            onChange={e => setForm(f => ({ ...f, price_per_night: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder="0.00" />
                        </div>
                      </div>

                      {/* Resumen rápido del total */}
                      {form.price_per_night && form.num_nights > 0 && (() => {
                        const total = parseFloat(form.price_per_night) * form.num_nights;
                        return (
                          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
                            <span className="text-gray-500">Total: <strong>Bs. {total.toFixed(2)}</strong></span>
                          </div>
                        );
                      })()}

                      {/* Mascota */}
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, has_pet: !f.has_pet }))}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all select-none ${
                          form.has_pet
                            ? 'bg-orange-50 border-orange-400 text-orange-700'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300'
                        }`}>
                        <span>🐾</span><span>Mascota</span>
                      </button>

                      {/* Notas */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                          rows={2} placeholder="Requerimientos, preferencias..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                      </div>
                    </>
                  )}

                  {/* ══ LLEGÓ DE LA NADA — formulario completo ══ */}
                  {form.arrival_type === 'directo' && (
                    <>
                      {/* Guest name + N° huéspedes */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del huésped <span className="text-red-400">*</span></label>
                          <input type="text" value={form.guest_name}
                            onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
                            onBlur={e => { if (!form.guest_gender) setForm(f => ({ ...f, guest_gender: guessGender(e.target.value) })); }}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder="Ej: García López" autoFocus />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">N° huéspedes</label>
                          <input type="number" min={1} max={10} value={form.num_guests}
                            onChange={e => setForm(f => ({ ...f, num_guests: parseInt(e.target.value) || 1 }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                      </div>

                      {/* Check-in + hora llegada */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha entrada <span className="text-red-400">*</span></label>
                          <DatePicker value={form.check_in} onChange={v => setForm(f => ({ ...f, check_in: v }))} placeholder="Check-in" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Hora llegada</label>
                          <TimePicker value={form.arrival_time} onChange={v => setForm(f => ({ ...f, arrival_time: v }))} placeholder="-- : --" emoji="🛬" />
                        </div>
                      </div>

                      {/* N° noches + precio */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">N° noches <span className="text-red-400">*</span></label>
                          <input type="number" min={1} max={60} value={form.num_nights}
                            onChange={e => setForm(f => ({ ...f, num_nights: parseInt(e.target.value) || 1 }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Precio/noche (Bs.) <span className="text-red-400">*</span></label>
                          <input type="number" min={0} step={0.5} value={form.price_per_night}
                            onChange={e => setForm(f => ({ ...f, price_per_night: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                            placeholder="0.00" />
                        </div>
                      </div>

                      {/* Resumen rápido */}
                      {form.price_per_night && form.num_nights > 0 && (() => {
                        const total = parseFloat(form.price_per_night) * form.num_nights;
                        return (
                          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm">
                            <span className="text-gray-500">📅 {form.check_in || '?'} → <strong>{form.check_out || '?'}</strong></span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-500">Total: <strong>Bs. {total.toFixed(2)}</strong></span>
                          </div>
                        );
                      })()}

                      {/* Estado */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                          <CustomSelect
                            value={form.status}
                            onChange={v => setForm(f => ({ ...f, status: v as ReservationStatus }))}
                            options={(Object.entries(STATUS_CONFIG) as [ReservationStatus, typeof STATUS_CONFIG[ReservationStatus]][]).map(([k, c]) => ({ value: k, label: c.label }))}
                            placeholder="— Estado —"
                          />
                        </div>
                        <div />
                      </div>

                      {/* Es Empresa */}
                      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input type="checkbox" checked={form.is_empresa}
                            onChange={e => setForm(f => ({ ...f, is_empresa: e.target.checked, ...(e.target.checked ? { guest_purpose: 'Trabajo' } : {}) }))}
                            className="w-4 h-4 rounded accent-blue-500" />
                          <Building2 size={15} className="text-blue-600" />
                          <span className="text-sm font-medium text-gray-700">Es Empresa</span>
                        </label>
                        {form.is_empresa && (
                          <>
                            <input type="text" list="empresas-list2" value={form.empresa_name}
                              onChange={e => setForm(f => ({ ...f, empresa_name: e.target.value }))}
                              className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                              placeholder="Nombre de la empresa..." autoComplete="off" />
                            <datalist id="empresas-list2">
                              {empresas.map((name, i) => <option key={i} value={name} />)}
                            </datalist>
                          </>
                        )}
                      </div>

                      {/* Flags */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Opciones</label>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['has_pet',       '🐾', 'Mascota',      'bg-orange-50 border-orange-400 text-orange-700'],
                            ['wants_invoice', '🧾', 'Factura',      'bg-green-50 border-green-400 text-green-700'],
                            ...( form.arrival_type !== 'directo' ? [['late_checkout', '🌙', 'Late Checkout','bg-purple-50 border-purple-400 text-purple-700']] : []),
                          ] as [keyof typeof form, string, string, string][]).map(([key, emoji, label, activeClass]) => (
                            <button key={key} type="button"
                              onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all select-none ${
                                form[key as keyof typeof form] ? activeClass : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}>
                              <span>{emoji}</span><span>{label}</span>
                            </button>
                          ))}
                          {form.arrival_type !== 'directo' && (
                            <button type="button" onClick={() => setForm(f => ({ ...f, is_blacklist: !f.is_blacklist }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all select-none ${
                                form.is_blacklist ? 'bg-red-50 border-red-400 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'
                              }`}>
                              <span>🚫</span><span>Lista negra</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                          rows={2} placeholder="Observaciones adicionales..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                      </div>

                      {/* Datos de huéspedes — Parte Diario */}
                      <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
                        <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">📋 Datos huéspedes — Parte Diario</p>

                        {/* Huésped 1 */}
                        <div className="border border-amber-100 rounded-lg p-3 bg-white space-y-2">
                          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Huésped 1 — {form.guest_name || 'Principal'}</p>
                          {/* Celular + CI con lookup automático */}
                          <div className="grid grid-cols-2 gap-2">
                            <input type="tel" placeholder="Celular"
                              value={form.guest_phone}
                              onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value.replace(/\D/g, '') }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <input type="text" placeholder="CI / Pasaporte"
                              value={form.guest_document}
                              onChange={e => setForm(f => ({ ...f, guest_document: e.target.value.replace(/[^a-zA-Z0-9]/g, '') }))}
                              onBlur={e => lookupGuest(e.target.value, 'guest_document')}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          </div>
                          {guestAutoFilled && (
                            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                              ✓ Datos del huésped cargados automáticamente
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Género</label>
                              <CustomSelect size="sm" value={form.guest_gender}
                                onChange={v => setForm(f => ({ ...f, guest_gender: v as any }))}
                                options={[{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }]}
                                placeholder="—" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Nac.</label>
                              <DatePicker birthdateMode value={form.guest_birthdate}
                                onChange={v => setForm(f => ({ ...f, guest_birthdate: v }))}
                                placeholder="dd/mm/aaaa" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Est. Civil</label>
                              <input type="text" list="bastille-marital-opts"
                                value={form.guest_marital_status}
                                onChange={e => setForm(f => ({ ...f, guest_marital_status: e.target.value }))}
                                placeholder="S / C / D / V"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="País de origen" value={form.guest_country}
                              onChange={e => setForm(f => ({ ...f, guest_country: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="Profesión" value={form.guest_profession}
                              onChange={e => setForm(f => ({ ...f, guest_profession: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <input type="text" list="bastille-purpose-opts"
                              value={form.guest_purpose}
                              onChange={e => setForm(f => ({ ...f, guest_purpose: e.target.value }))}
                              placeholder="Objeto —"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <input type="text" placeholder="Procedencia" value={form.guest_origin}
                              onChange={e => setForm(f => ({ ...f, guest_origin: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <input type="text" placeholder="Próx. Destino" value={form.guest_next_dest}
                              onChange={e => setForm(f => ({ ...f, guest_next_dest: e.target.value }))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <CustomSelect size="sm" value={form.guest_transport}
                              onChange={v => setForm(f => ({ ...f, guest_transport: v as any }))}
                              options={[{ value:'T', label:'T' },{ value:'A', label:'A' }]}
                              placeholder="Vía —" />
                          </div>
                        </div>

                        {/* Huéspedes adicionales */}
                        {additionalGuests.map((ag, idx) => (
                          <div key={`adult-${idx}`} className="border border-amber-100 rounded-lg p-3 bg-white space-y-2">
                            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Huésped {idx + 2}</p>
                            <input type="text" placeholder="Nombre y apellidos" value={ag.name}
                              onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, name: e.target.value } : g))}
                              onBlur={e => { if (!ag.gender) setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, gender: guessGender(e.target.value) as any } : g)); }}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="tel" placeholder="Celular" value={ag.phone}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, phone: e.target.value.replace(/\D/g, '') } : g))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              <input type="text" placeholder="CI / Pasaporte" value={ag.document}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, document: e.target.value.replace(/[^a-zA-Z0-9]/g, '') } : g))}
                                onBlur={e => lookupAdditionalGuest(e.target.value, 'guest_document', idx)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Género</label>
                                <CustomSelect size="sm" value={ag.gender}
                                  onChange={v => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, gender: v as any } : g))}
                                  options={[{ value:'M', label:'M' },{ value:'F', label:'F' }]} placeholder="—" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Fecha Nac.</label>
                                <DatePicker birthdateMode value={ag.birthdate}
                                  onChange={v => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, birthdate: v } : g))}
                                  placeholder="dd/mm/aaaa" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-0.5">Est. Civil</label>
                                <input type="text" list="bastille-marital-opts"
                                  value={ag.marital_status}
                                  onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, marital_status: e.target.value } : g))}
                                  placeholder="S / C / D / V"
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" placeholder="País de origen" value={ag.country}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, country: e.target.value } : g))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <input type="text" placeholder="Profesión" value={ag.profession}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, profession: e.target.value } : g))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              <input type="text" list="bastille-purpose-opts"
                                value={ag.purpose}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, purpose: e.target.value } : g))}
                                placeholder="Objeto —"
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <input type="text" placeholder="Procedencia" value={ag.origin}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, origin: e.target.value } : g))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              <input type="text" placeholder="Próx. Destino" value={ag.next_dest}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, next_dest: e.target.value } : g))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              <CustomSelect size="sm" value={ag.transport}
                                onChange={v => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, transport: v as any } : g))}
                                options={[{ value:'T', label:'T' },{ value:'A', label:'A' },{ value:'F', label:'F' }]}
                                placeholder="Vía —" />
                            </div>
                          </div>
                        ))}

                        {/* Niños */}
                        <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">👧 Niños</p>
                            <div className="flex items-center gap-1.5">
                              <button type="button"
                                onClick={() => setChildGuests(prev => prev.length > 0 ? prev.slice(0, -1) : prev)}
                                disabled={childGuests.length === 0}
                                className="w-6 h-6 rounded bg-white border border-blue-200 hover:bg-blue-50 flex items-center justify-center disabled:opacity-30">
                                <Minus size={11} />
                              </button>
                              <span className="text-sm font-bold text-blue-700 w-5 text-center">{childGuests.length}</span>
                              <button type="button"
                                onClick={() => setChildGuests(prev => [...prev, emptyChildGuest()])}
                                className="w-6 h-6 rounded bg-white border border-blue-200 hover:bg-blue-50 flex items-center justify-center">
                                <Plus size={11} />
                              </button>
                            </div>
                          </div>
                          {childGuests.map((child, idx) => (
                            <div key={`child-${idx}`} className="border border-blue-100 rounded-lg p-2 bg-white space-y-2">
                              <p className="text-[10px] font-semibold text-blue-600 uppercase">Niño {idx + 1}</p>
                              <input type="text" placeholder="Nombre completo" value={child.name}
                                onChange={e => setChildGuests(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                              <div className="grid grid-cols-2 gap-2">
                                <input type="text" placeholder="CI / Documento (opcional)" value={child.document}
                                  onChange={e => setChildGuests(prev => prev.map((c, i) => i === idx ? { ...c, document: e.target.value } : c))}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                <DatePicker birthdateMode value={child.birthdate}
                                  onChange={v => setChildGuests(prev => prev.map((c, i) => i === idx ? { ...c, birthdate: v } : c))}
                                  placeholder="Fecha Nac." />
                              </div>
                            </div>
                          ))}
                          {childGuests.length === 0 && (
                            <p className="text-xs text-blue-400 text-center py-1">Sin niños registrados</p>
                          )}
                        </div>

                        {/* Bebés */}
                        <div className="border border-pink-100 rounded-lg p-3 bg-pink-50/30">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-pink-700 uppercase tracking-wide">🍼 Bebés</p>
                            <div className="flex items-center gap-1.5">
                              <button type="button"
                                onClick={() => setNumBabies(n => Math.max(0, n - 1))}
                                disabled={numBabies === 0}
                                className="w-6 h-6 rounded bg-white border border-pink-200 hover:bg-pink-50 flex items-center justify-center disabled:opacity-30">
                                <Minus size={11} />
                              </button>
                              <span className="text-sm font-bold text-pink-700 w-5 text-center">{numBabies}</span>
                              <button type="button"
                                onClick={() => setNumBabies(n => n + 1)}
                                className="w-6 h-6 rounded bg-white border border-pink-200 hover:bg-pink-50 flex items-center justify-center">
                                <Plus size={11} />
                              </button>
                            </div>
                          </div>
                          {numBabies > 0 && (
                            <p className="text-xs text-pink-600 mt-1">
                              {numBabies === 1 ? '1 bebé registrado' : `${numBabies} bebés registrados`} — sin documento requerido
                            </p>
                          )}
                        </div>

                      </div>
                    </>
                  )}
                </>
              )}

              {formError && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{formError}</p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 shrink-0 bg-white rounded-b-2xl">
              <div>
                {editingId && (
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm font-medium transition-colors"
                  >
                    <Trash2 size={15} />
                    Eliminar
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 ${
                    isSalon
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-amber-400 hover:bg-amber-300 text-gray-900'
                  }`}
                >
                  {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CONFIRM ARRIVAL MODAL
          ══════════════════════════════════════════ */}
      {confirmModal.open && confirmModal.res && (() => {
        const res = confirmModal.res!;
        const d = new Date(res.check_in + 'T00:00:00');
        d.setDate(d.getDate() + confirmModal.num_nights);
        const checkOutPreview = toDateStr(d);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-green-50 rounded-t-2xl shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900">Confirmar llegada</h3>
                  <p className="text-xs text-green-700 font-semibold mt-0.5">
                    {res.room_id} — {res.guest_name}
                  </p>
                </div>
                <button onClick={() => setConfirmModal(m => ({ ...m, open: false }))} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                {/* Hora exacta + N° noches */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora exacta de llegada</label>
                    <TimePicker
                      value={confirmModal.arrival_time}
                      onChange={v => setConfirmModal(m => ({ ...m, arrival_time: v }))}
                      placeholder="-- : --" emoji="🛬"
                      accentClass="border-green-400 ring-green-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">N° noches</label>
                    <input type="number" min={1} max={60}
                      value={confirmModal.num_nights}
                      onChange={e => setConfirmModal(m => ({ ...m, num_nights: parseInt(e.target.value) || 1 }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>
                </div>

                {/* Check-in → Check-out preview */}
                <div className="flex items-center gap-3 bg-green-50 rounded-xl px-4 py-3 text-sm">
                  <span className="font-semibold text-gray-700">📅 {res.check_in}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-semibold text-green-700">📅 {checkOutPreview}</span>
                  <span className="ml-auto text-xs text-green-600 font-medium">{confirmModal.num_nights} noche{confirmModal.num_nights !== 1 ? 's' : ''}</span>
                </div>

                {/* Datos del huésped */}
                <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-3">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">📋 Datos del huésped — Parte Diario</p>

                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Nombre y apellidos" value={confirmModal.guest_name_edit}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_name_edit: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <input type="tel" placeholder="Celular" value={confirmModal.guest_phone}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_phone: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="CI / Pasaporte" value={confirmModal.guest_document}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_document: e.target.value }))}
                      onBlur={async e => {
                        const v = e.target.value;
                        if (v.length < 4) return;
                        const { data } = await supabase.from('reservations').select('guest_name,guest_phone,guest_gender,guest_birthdate,guest_marital_status,guest_country,guest_document,guest_profession,guest_purpose,guest_origin,guest_next_dest,guest_transport').eq('guest_document', v).not('guest_name','is',null).order('updated_at',{ascending:false}).limit(1);
                        const g = data?.[0]; if (!g) return;
                        setConfirmModal(m => ({ ...m, guest_name_edit: g.guest_name ?? m.guest_name_edit, guest_phone: g.guest_phone ?? m.guest_phone, guest_gender: g.guest_gender ?? m.guest_gender, guest_birthdate: g.guest_birthdate ?? m.guest_birthdate, guest_marital_status: g.guest_marital_status ?? m.guest_marital_status, guest_country: g.guest_country ?? m.guest_country, guest_profession: g.guest_profession ?? m.guest_profession, guest_purpose: g.guest_purpose ?? m.guest_purpose, guest_origin: g.guest_origin ?? m.guest_origin, guest_next_dest: g.guest_next_dest ?? m.guest_next_dest, guest_transport: g.guest_transport ?? m.guest_transport }));
                      }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <input type="text" placeholder="País de origen" value={confirmModal.guest_country}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_country: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Género</label>
                      <CustomSelect size="sm" value={confirmModal.guest_gender}
                        onChange={v => setConfirmModal(m => ({ ...m, guest_gender: v }))}
                        options={[{ value: 'M', label: 'M — Masc.' }, { value: 'F', label: 'F — Fem.' }]}
                        placeholder="—" accent="green" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Nac.</label>
                      <DatePicker birthdateMode value={confirmModal.guest_birthdate}
                        onChange={v => setConfirmModal(m => ({ ...m, guest_birthdate: v }))}
                        placeholder="dd/mm/aaaa"
                        accentClass="border-green-400 ring-green-100" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Est. Civil</label>
                      <input type="text" list="bastille-marital-opts"
                        value={confirmModal.guest_marital_status}
                        onChange={e => setConfirmModal(m => ({ ...m, guest_marital_status: e.target.value }))}
                        placeholder="S / C / D / V"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Profesión" value={confirmModal.guest_profession}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_profession: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <input type="text" list="bastille-purpose-opts"
                      value={confirmModal.guest_purpose}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_purpose: e.target.value }))}
                      placeholder="Objeto —"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="Procedencia" value={confirmModal.guest_origin}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_origin: e.target.value }))}
                      onBlur={e => { const v = e.target.value; if (v) setConfirmAdditionalGuests(p => p.map(ag => ({ ...ag, origin: ag.origin || v }))); }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <input type="text" placeholder="Próx. Destino" value={confirmModal.guest_next_dest}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_next_dest: e.target.value }))}
                      onBlur={e => { const v = e.target.value; if (v) setConfirmAdditionalGuests(p => p.map(ag => ({ ...ag, next_dest: ag.next_dest || v }))); }}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <CustomSelect size="sm" value={confirmModal.guest_transport}
                      onChange={v => { setConfirmModal(m => ({ ...m, guest_transport: v })); setConfirmAdditionalGuests(p => p.map(ag => ({ ...ag, transport: (ag.transport || v) as any }))); }}
                      options={[{ value:'T', label:'T' },{ value:'A', label:'A' }]}
                      placeholder="Vía —" accent="green" />
                  </div>

                  {/* Huéspedes adicionales */}
                  {confirmAdditionalGuests.map((ag, idx) => (
                    <div key={idx} className="border border-amber-100 rounded-lg p-3 bg-white space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Huésped {idx + 2}</p>
                        <button type="button" onClick={() => setConfirmAdditionalGuests(p => p.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-xs">✕ Quitar</button>
                      </div>
                      <input type="text" placeholder="Nombre y apellidos" value={ag.name}
                        onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, name: e.target.value } : g))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="tel" placeholder="Celular" value={ag.phone}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, phone: e.target.value } : g))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        <input type="text" placeholder="CI / Pasaporte" value={ag.document}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, document: e.target.value } : g))}
                          onBlur={async e => {
                            const v = e.target.value; if (v.length < 4) return;
                            const { data } = await supabase.from('reservations').select('guest_name,guest_phone,guest_gender,guest_birthdate,guest_marital_status,guest_country,guest_document,guest_profession,guest_purpose,guest_origin,guest_next_dest,guest_transport').eq('guest_document',v).not('guest_name','is',null).order('updated_at',{ascending:false}).limit(1);
                            const g2 = data?.[0]; if (!g2) return;
                            setConfirmAdditionalGuests(p => p.map((g, i) => i !== idx ? g : { ...g, name: g2.guest_name ?? g.name, phone: g2.guest_phone ?? g.phone, gender: g2.guest_gender ?? g.gender, birthdate: g2.guest_birthdate ?? g.birthdate, marital_status: g2.guest_marital_status ?? g.marital_status, country: g2.guest_country ?? g.country, profession: g2.guest_profession ?? g.profession, purpose: g2.guest_purpose ?? g.purpose, origin: g2.guest_origin ?? g.origin, next_dest: g2.guest_next_dest ?? g.next_dest, transport: g2.guest_transport ?? g.transport }));
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <CustomSelect size="sm" value={ag.gender} accent="green"
                          onChange={v => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, gender: v as any } : g))}
                          options={[{ value:'M', label:'M' },{ value:'F', label:'F' }]} placeholder="Género" />
                        <DatePicker birthdateMode value={ag.birthdate}
                          onChange={v => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, birthdate: v } : g))}
                          placeholder="dd/mm/aaaa"
                          accentClass="border-green-400 ring-green-100" />
                        <input type="text" list="bastille-marital-opts"
                          value={ag.marital_status}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, marital_status: e.target.value } : g))}
                          placeholder="E.Civil"
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                      </div>
                      <input type="text" placeholder="País" value={ag.country}
                        onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, country: e.target.value } : g))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                      <div className="grid grid-cols-3 gap-2">
                        <input type="text" placeholder="Procedencia" value={ag.origin}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, origin: e.target.value } : g))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        <input type="text" placeholder="Próx. Destino" value={ag.next_dest}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, next_dest: e.target.value } : g))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        <CustomSelect size="sm" value={ag.transport} accent="green"
                          onChange={v => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, transport: v as any } : g))}
                          options={[{ value:'T', label:'T' },{ value:'A', label:'A' }]} placeholder="Vía" />
                      </div>
                    </div>
                  ))}

                  <button type="button"
                    onClick={() => setConfirmAdditionalGuests(p => [...p, { ...emptyAdditionalGuest(), country: 'Boliviana' }])}
                    className="w-full mt-2 py-2 border-2 border-dashed border-amber-300 rounded-xl text-sm font-medium text-amber-600 hover:bg-amber-50 transition-colors">
                    + Agregar huésped
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 shrink-0 bg-white rounded-b-2xl">
                <button onClick={() => setConfirmModal(m => ({ ...m, open: false }))}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button onClick={handleConfirmArrival}
                  className="px-6 py-2 text-sm font-semibold bg-green-500 hover:bg-green-400 text-white rounded-lg transition-colors">
                  ✓ Confirmar llegada
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════
          CHECKOUT MODAL
          ══════════════════════════════════════════ */}
      {/* ══ Custom confirm dialog ══ */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="font-bold text-gray-900 text-base mb-1">{confirmDialog.title}</h3>
            <p className="text-sm text-gray-500 mb-6">{confirmDialog.body}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDialog(d => ({ ...d, open: false }))}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmDialog(d => ({ ...d, open: false })); confirmDialog.onConfirm(); }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-500 hover:bg-red-400 rounded-xl transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutModal.open && checkoutModal.res && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-orange-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">Check out</h3>
                <p className="text-xs text-orange-700 font-semibold mt-0.5">
                  {checkoutModal.res.room_id} — {checkoutModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setCheckoutModal(m => ({ ...m, open: false }))} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              {/* Hora de salida */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hora de salida</label>
                <TimePicker
                  value={checkoutModal.departure_time}
                  onChange={v => setCheckoutModal(m => ({ ...m, departure_time: v }))}
                  placeholder="-- : --" emoji="🛫"
                  accentClass="border-orange-400 ring-orange-100"
                />
              </div>

              {/* Lista negra */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div
                  onClick={() => setCheckoutModal(m => ({ ...m, is_blacklist: !m.is_blacklist }))}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                    checkoutModal.is_blacklist ? 'bg-red-500 border-red-500' : 'border-gray-300'
                  }`}
                >
                  {checkoutModal.is_blacklist && <span className="text-white text-xs font-bold">✓</span>}
                </div>
                <span className="text-sm font-medium text-gray-700">💀 Agregar a lista negra</span>
              </label>

              {/* Factura */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div
                    onClick={() => setCheckoutModal(m => ({ ...m, is_invoice: !m.is_invoice, siaat_number: '' }))}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      checkoutModal.is_invoice ? 'bg-green-500 border-green-500' : 'border-gray-300'
                    }`}
                  >
                    {checkoutModal.is_invoice && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <span className="text-sm font-medium text-gray-700">🧾 ¿Requiere factura?</span>
                </label>
                {checkoutModal.is_invoice && (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">N° SIAAT</label>
                      <input
                        type="text"
                        value={checkoutModal.siaat_number}
                        onChange={e => setCheckoutModal(m => ({ ...m, siaat_number: e.target.value }))}
                        placeholder="Ej. 12345678"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">N° Factura</label>
                      <input
                        type="text"
                        value={checkoutModal.invoice_number}
                        onChange={e => setCheckoutModal(m => ({ ...m, invoice_number: e.target.value }))}
                        placeholder="Ej. 001-001-00000001"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Pagos por sección ── */}
              {(() => {
                const r = checkoutModal.res!;
                const nights = Math.max(1, Math.round(
                  (new Date(r.check_out + 'T00:00:00').getTime() - new Date(r.check_in + 'T00:00:00').getTime()) / 86400000
                ));
                const pricePer    = r.price_per_night ?? 0;
                const hospTotal   = nights * pricePer;
                const hospPaid    = checkoutModal.checkoutPaid;
                const hospPending = Math.max(0, hospTotal - hospPaid);
                const vitItems    = pendingVitrina[r.id] ?? [];
                const hasLate     = !!(r as any).late_checkout;

                return (
                  <div className="space-y-3">

                    {/* ── Hospedaje ── */}
                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                      <div className="px-4 py-2 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-500">🏨 Hospedaje</div>
                      <div className="px-4 py-3 space-y-1 text-sm">
                        <div className="flex justify-between text-gray-600">
                          <span>📅 {r.check_in} → {r.check_out}</span>
                          <span className="font-semibold">{nights} noche{nights !== 1 ? 's' : ''}</span>
                        </div>
                        {pricePer > 0 && <>
                          <div className="flex justify-between text-gray-500 text-xs">
                            <span>Precio / noche</span><span>Bs. {pricePer.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1">
                            <span>Total</span><span>Bs. {hospTotal.toFixed(2)}</span>
                          </div>
                          {hospPaid > 0 && (
                            <div className="flex justify-between items-center text-green-700 text-xs">
                              <span>✓ Ya pagado — Bs. {hospPaid.toFixed(2)}</span>
                              <button onClick={checkoutAnularHosp}
                                className="text-[10px] text-red-400 hover:text-red-600 underline ml-2">
                                Anular último
                              </button>
                            </div>
                          )}
                          {hospPending > 0 ? (
                            <>
                              <div className="flex justify-between font-bold text-red-600">
                                <span>Pendiente</span><span>Bs. {hospPending.toFixed(2)}</span>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutHospPayAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutHospPayAmt: e.target.value }))}
                                  placeholder={`${hospPending.toFixed(2)}`}
                                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                                <CustomSelect
                                  value={checkoutModal.checkoutHospPayCaja}
                                  onChange={v => setCheckoutModal(m => ({ ...m, checkoutHospPayCaja: v }))}
                                  options={[{ value: 'CAJA MAYOR', label: 'Efectivo' }, { value: 'CUENTA BNB', label: 'QR' }]}
                                  placeholder="Caja" />
                                <button onClick={checkoutPayHosp}
                                  className="px-3 py-1.5 text-xs font-bold bg-green-500 hover:bg-green-400 text-white rounded-lg whitespace-nowrap">
                                  💳 Pagar
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="text-center text-xs font-semibold text-green-700 pt-1">✓ Pagado completamente</div>
                          )}
                        </>}
                      </div>
                    </div>

                    {/* ── Late Checkout ── */}
                    {hasLate && (
                      <div className="bg-purple-50 rounded-xl overflow-hidden border border-purple-200">
                        <div className="px-4 py-2 bg-purple-100 text-xs font-bold uppercase tracking-wider text-purple-700">🌙 Late Checkout</div>
                        <div className="px-4 py-3 space-y-1 text-sm">
                          {checkoutModal.checkoutLateTotal > 0 ? (
                            <div className="flex justify-between items-center text-green-700 font-semibold">
                              <span>✓ Ya registrado — Bs. {checkoutModal.checkoutLateTotal.toFixed(2)}</span>
                              <button onClick={checkoutAnularLate}
                                className="text-[10px] font-normal text-red-400 hover:text-red-600 underline ml-2">
                                Anular
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-purple-600 mb-1">Sin cargo registrado — registrar ahora:</p>
                              <div className="flex gap-2">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutLatePayAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutLatePayAmt: e.target.value }))}
                                  placeholder="Monto Bs."
                                  className="flex-1 border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                                <CustomSelect
                                  value={checkoutModal.checkoutLatePayCaja}
                                  onChange={v => setCheckoutModal(m => ({ ...m, checkoutLatePayCaja: v }))}
                                  options={[{ value: 'CAJA MAYOR', label: 'Efectivo' }, { value: 'CUENTA BNB', label: 'QR' }]}
                                  placeholder="Caja" />
                                <button onClick={checkoutPayLate}
                                  className="px-3 py-1.5 text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white rounded-lg whitespace-nowrap">
                                  💳 Pagar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Vitrina pendiente ── */}
                    {vitItems.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-amber-100 text-xs font-bold uppercase tracking-wider text-amber-700">🛒 Vitrina</div>
                        <div className="px-4 py-3 space-y-2">
                          {vitItems.map(item => (
                            <div key={item.productId} className="flex items-center justify-between gap-2">
                              <div className="flex-1 text-sm text-gray-700">
                                <span>{item.productName}{item.qty > 1 ? ` x${item.qty}` : ''}</span>
                                <span className="text-xs text-gray-400 ml-1">({item.caja === 'CUENTA BNB' ? 'QR' : 'Efectivo'})</span>
                              </div>
                              <span className="text-sm font-semibold text-amber-700 flex-shrink-0">Bs. {item.total.toFixed(2)}</span>
                              <button onClick={() => checkoutPayVitrinaItem(item)}
                                className="px-2 py-1 text-[10px] font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-lg flex-shrink-0">
                                💳 Pagar
                              </button>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold text-amber-700 border-t border-amber-200 pt-1 text-sm">
                            <span>Total vitrina</span>
                            <span>Bs. {vitItems.reduce((s, i) => s + i.total, 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Vitrina ya pagada en esta sesión ── */}
                    {checkoutModal.checkoutPaidVitrina.length > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-green-100 text-xs font-bold uppercase tracking-wider text-green-700">✓ Vitrina pagada</div>
                        <div className="px-4 py-3 space-y-2">
                          {checkoutModal.checkoutPaidVitrina.map((item, idx) => (
                            <div key={`${item.productId}-${idx}`} className="flex items-center justify-between gap-2">
                              <div className="flex-1 text-sm text-gray-700">
                                <span>{item.productName}{item.qty > 1 ? ` x${item.qty}` : ''}</span>
                                <span className="text-xs text-gray-400 ml-1">({item.caja === 'CUENTA BNB' ? 'QR' : 'Efectivo'})</span>
                              </div>
                              <span className="text-sm font-semibold text-green-700 flex-shrink-0">Bs. {item.total.toFixed(2)}</span>
                              <button
                                onClick={async () => {
                                  await checkoutAnularVitrinaItem(r.id, item.productName, item.productId, item.qty, item.total);
                                  setPendingVitrina(prev => ({ ...prev, [r.id]: [...(prev[r.id] ?? []), item] }));
                                  setCheckoutModal(m => ({ ...m, checkoutPaidVitrina: m.checkoutPaidVitrina.filter((_, i) => i !== idx) }));
                                }}
                                className="text-[10px] text-red-400 hover:text-red-600 underline flex-shrink-0">
                                Anular
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-white rounded-b-2xl">
              <button onClick={() => setCheckoutModal(m => ({ ...m, open: false }))}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={handleCheckout}
                className="px-6 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors">
                ✓ Check out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Card context menu ── */}
      {cardMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCardMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-52 overflow-y-auto"
            style={{
              left: Math.min(cardMenu.x, window.innerWidth - 216),
              top:  Math.min(cardMenu.y + 4, window.innerHeight - 40),
              maxHeight: Math.min(400, window.innerHeight - cardMenu.y - 16),
            }}
          >
            {cardMenu.res.status === 'reserva' && (
              <button onClick={async e => {
                setCardMenu(null);
                if (cardMenu.res.room_id === 'SALON') {
                  await supabase.from('reservations').update({ status: 'ocupado', updated_at: new Date().toISOString() }).eq('id', cardMenu.res.id);
                  fetchData();
                } else { openConfirmModal(e as any, cardMenu.res); }
              }} className="w-full text-left px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
                ✓ Confirmar llegada
              </button>
            )}
            {cardMenu.res.status === 'ocupado' && (<>
              <button onClick={e => { setCardMenu(null); openCheckoutModal(e as any, cardMenu.res); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50">
                ⬆ Check out
              </button>
              <button onClick={() => { setLateCheckoutModal({ res: cardMenu.res, time: '', extra_price: '', caja: 'CAJA MAYOR' }); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-purple-600 hover:bg-purple-50">
                🌙 Late Checkout
              </button>
              <button onClick={() => { setVitrinaSaleRes(cardMenu.res); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-50">
                🛒 Vitrina
              </button>
              <button onClick={() => { openRoomChange(cardMenu.res); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                🔄 Cambiar habitación
              </button>
            </>)}
            {cardMenu.res.status === 'limpieza' && (
              <button onClick={async () => {
                await supabase.from('reservations').delete().eq('id', cardMenu.res.id);
                setCardMenu(null); fetchData();
              }} className="w-full text-left px-4 py-2 text-sm font-semibold text-cyan-600 hover:bg-cyan-50">
                ✅ Limpieza completada
              </button>
            )}
            {cardMenu.res.status === 'habilitacion' && (
              <button onClick={async () => {
                await supabase.from('reservations').delete().eq('id', cardMenu.res.id);
                setCardMenu(null); fetchData();
              }} className="w-full text-left px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                ✅ Ya está limpio
              </button>
            )}
            {cardMenu.res.status === 'mantenimiento' && (
              <button onClick={async () => {
                await supabase.from('reservations').delete().eq('id', cardMenu.res.id);
                setCardMenu(null); fetchData();
              }} className="w-full text-left px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                🔧 Ya está arreglado
              </button>
            )}
            {/* Nota rápida — todas las habitaciones */}
            <>
              <div className="border-t border-gray-100 my-1" />
              <button onClick={() => { setNotaModal({ res: cardMenu.res, text: (cardMenu.res as any).notes ?? '' }); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
                📝 {(cardMenu.res as any).notes ? 'Editar nota' : 'Agregar nota'}
              </button>
              {(cardMenu.res as any).notes && (
                <button onClick={async () => {
                  await supabase.from('reservations').update({ notes: null, updated_at: new Date().toISOString() }).eq('id', cardMenu.res.id);
                  setCardMenu(null); fetchData();
                }} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-50">
                  🗑 Borrar nota
                </button>
              )}
            </>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => { setCardMenu(null); openEdit(cardMenu.res); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              ✏️ Editar
            </button>
            {cardMenu.res.status === 'ocupado' && (
              <button onClick={() => { const r = cardMenu.res; setCardMenu(null); handleAnularCheckin(r); }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 font-semibold hover:bg-red-50">
                ⚠️ Anular check-in completo
              </button>
            )}
            <button onClick={e => { setCardMenu(null); handleDeleteRes(e as any, cardMenu.res.id); }}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50">
              🗑 Borrar
            </button>
          </div>
        </>
      )}

      {/* ── Quick cell menu (empty cell + click) ── */}
      {quickMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setQuickMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-52"
            style={{
              left: Math.min(quickMenu.x, window.innerWidth - 216),
              top: (() => {
                const h = quickMenu.roomId === 'SALON' ? 130 : 210;
                return quickMenu.y + h > window.innerHeight
                  ? quickMenu.y - h - 8
                  : quickMenu.y + 4;
              })(),
            }}
          >
            <button onClick={() => openNew(quickMenu.roomId, quickMenu.day, 'reserva', 'reserva')}
              className="w-full text-left px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
              📅 Reserva
            </button>
            <button onClick={() => openNew(quickMenu.roomId, quickMenu.day, 'ocupado', 'directo')}
              className="w-full text-left px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
              🚶 Check-in directo
            </button>
            {quickMenu.roomId !== 'SALON' && (<>
              <button onClick={() => { setMaintenanceForm({ roomId: quickMenu.roomId, day: quickMenu.day, detail: '', endDate: '' }); setQuickMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                🔧 Mantenimiento
              </button>
              <button onClick={() => quickCreateStatus(quickMenu.roomId, quickMenu.day, 'habilitacion', 'Habilitación')}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">
                🧹 Habilitación
              </button>
            </>)}
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => { setQuickNotaModal({ roomId: quickMenu.roomId, day: quickMenu.day, text: '' }); setQuickMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
              📝 Agregar nota
            </button>
          </div>
        </>
      )}

      {/* ── Quick nota modal (from empty cell) ── */}
      {quickNotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50 rounded-t-2xl">
              <h3 className="font-bold text-gray-900">📝 Agregar nota — {quickNotaModal.roomId}</h3>
              <button onClick={() => setQuickNotaModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5">
              <textarea
                autoFocus
                value={quickNotaModal.text}
                onChange={e => setQuickNotaModal(n => n ? { ...n, text: e.target.value } : n)}
                rows={3}
                placeholder="Escribe una nota para este día..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setQuickNotaModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                disabled={!quickNotaModal.text.trim()}
                onClick={handleSaveQuickNota}
                className="px-5 py-2 text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg disabled:opacity-40">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mantenimiento creation popup ── */}
      {maintenanceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-red-50 rounded-t-2xl">
              <h3 className="font-bold text-gray-900">🔧 Mantenimiento — {maintenanceForm.roomId}</h3>
              <button onClick={() => setMaintenanceForm(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Detalle del problema *</label>
                <textarea
                  value={maintenanceForm.detail}
                  onChange={e => setMaintenanceForm(f => f ? { ...f, detail: e.target.value } : f)}
                  rows={3}
                  placeholder="Ej: Ducha sin agua caliente, cerradura rota..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha estimada de arreglo</label>
                <DatePicker
                  value={maintenanceForm.endDate}
                  onChange={v => setMaintenanceForm(f => f ? { ...f, endDate: v } : f)}
                  accentClass="border-red-400 ring-red-100"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setMaintenanceForm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                disabled={!maintenanceForm.detail.trim()}
                onClick={async () => {
                  const date = toDateStr(new Date(year, month, maintenanceForm.day));
                  const endDate = maintenanceForm.endDate || toDateStr(new Date(year, month, maintenanceForm.day + 1));
                  await supabase.from('reservations').insert({
                    room_id: maintenanceForm.roomId, guest_name: 'Mantenimiento',
                    num_guests: 0, check_in: date, check_out: endDate,
                    status: 'mantenimiento', notes: maintenanceForm.detail,
                    updated_at: new Date().toISOString(),
                  });
                  setMaintenanceForm(null);
                  fetchData();
                }}
                className="px-5 py-2 text-sm font-semibold bg-red-500 hover:bg-red-400 text-white rounded-lg disabled:opacity-40">
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vitrina sale picker (multi-product cart) ── */}
      {vitrinaSaleRes && (
        <VitrinaProductPicker
          onClose={() => setVitrinaSaleRes(null)}
          onConfirm={(items: VitrinaCartItem[]) => {
            const res = vitrinaSaleRes;
            setPendingVitrina(prev => {
              const existing = prev[res.id] ?? [];
              const merged = [...existing];
              for (const item of items) {
                const idx = merged.findIndex(m => m.productId === item.product.id);
                if (idx >= 0) {
                  merged[idx] = { ...merged[idx], qty: merged[idx].qty + item.qty, total: merged[idx].total + item.total };
                } else {
                  merged.push({ productId: item.product.id, productName: item.product.name, price: item.product.price, qty: item.qty, total: item.total, caja: item.caja });
                }
              }
              return { ...prev, [res.id]: merged };
            });
            logActivity(profile?.id, profile?.name, 'Vitrina al carrito', 'transaction', res.id,
              `${items.map(i => `${i.product.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')} — ${res.room_id} ${res.guest_name}`);
            setVitrinaSaleRes(null);
          }}
          onPayNow={async (items: VitrinaCartItem[]) => {
            const res = vitrinaSaleRes;
            const now = new Date();
            const today = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
            const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
            for (const item of items) {
              await supabase.from('transactions').insert({
                type: 'ingreso', category: 'H03-VITRINA',
                description: `${item.product.name}${item.qty > 1 ? ` x${item.qty}` : ''} — ${res.room_id} ${res.guest_name}`,
                amount: item.total, date: today, time: timeStr,
                reservation_id: res.id, room_id: res.room_id, caja: item.caja,
              });
              await supabase.from('vitrina_products').update({ quantity: item.product.quantity - item.qty }).eq('id', item.product.id);
            }
            logActivity(profile?.id, profile?.name, 'Vitrina pagada', 'transaction', res.id,
              `${items.map(i => `${i.product.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join(', ')} — ${res.room_id} ${res.guest_name}`);
            setVitrinaSaleRes(null);
          }}
        />
      )}

      {/* ── Room Change modal ── */}
      {roomChangeModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-blue-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">🔄 Cambiar habitación</h3>
                <p className="text-xs text-blue-700 font-semibold mt-0.5">
                  {roomChangeModal.res.room_id} — {roomChangeModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setRoomChangeModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {roomChangeModal.step === 'room' ? (
              /* ── Step 1: pick new room ── */
              <div className="px-6 py-5 space-y-4">
                {roomChangeModal.loading ? (
                  <div className="flex items-center justify-center h-24">
                    <div className="w-6 h-6 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : roomChangeModal.availableRooms.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No hay habitaciones disponibles para esas fechas.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-500">
                      Noches: <span className="font-semibold text-gray-800">{roomChangeModal.res.check_in} → {roomChangeModal.res.check_out}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {roomChangeModal.availableRooms.map(r => (
                        <button
                          key={r.id}
                          onClick={() => setRoomChangeModal(m => m ? { ...m, newRoomId: r.id } : m)}
                          className={`text-left px-3 py-2.5 rounded-xl border-2 transition-all ${
                            roomChangeModal.newRoomId === r.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <p className="font-bold text-gray-900 text-sm">{r.id}</p>
                          <p className="text-[11px] text-gray-500 truncate">{r.type}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                  <button onClick={() => setRoomChangeModal(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button
                    disabled={!roomChangeModal.newRoomId}
                    onClick={() => setRoomChangeModal(m => m ? { ...m, step: 'reason' } : m)}
                    className="px-5 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white rounded-lg disabled:opacity-40">
                    Siguiente →
                  </button>
                </div>
              </div>
            ) : (
              /* ── Step 2: pick reason ── */
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-gray-500">
                  Nueva habitación: <span className="font-bold text-gray-900">{roomChangeModal.newRoomId}</span>
                </p>
                <p className="text-sm font-medium text-gray-700">¿Por qué cambia de habitación?</p>
                <div className="space-y-2">
                  {([
                    { value: 'damaged', label: '🔨 Habitación dañada', desc: 'Se generará un card de mantenimiento' },
                    { value: 'upgrade', label: '⭐ Quería mejor habitación', desc: 'Se generará un card de limpieza suave' },
                    { value: 'other',   label: '📝 Otro motivo', desc: '' },
                  ] as const).map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        roomChangeModal.reason === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input type="radio" className="mt-0.5 accent-blue-500" name="room_change_reason"
                        checked={roomChangeModal.reason === opt.value}
                        onChange={() => setRoomChangeModal(m => m ? { ...m, reason: opt.value } : m)}
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                        {opt.desc && <p className="text-[11px] text-gray-400 mt-0.5">{opt.desc}</p>}
                      </div>
                    </label>
                  ))}
                </div>

                {(roomChangeModal.reason === 'damaged' || roomChangeModal.reason === 'other') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {roomChangeModal.reason === 'damaged' ? 'Descripción del daño *' : 'Descripción (opcional)'}
                    </label>
                    <textarea
                      rows={2}
                      value={roomChangeModal.description}
                      onChange={e => setRoomChangeModal(m => m ? { ...m, description: e.target.value } : m)}
                      placeholder={roomChangeModal.reason === 'damaged' ? 'Ej: Fuga en baño, cerradura rota...' : 'Motivo del cambio...'}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    />
                  </div>
                )}

                {/* Nuevo precio — siempre visible */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-700">
                    Precio actual: Bs. {(roomChangeModal.res as any).price_per_night?.toFixed(2) ?? '—'}/noche
                  </p>
                  <label className="block text-sm font-medium text-gray-700">
                    Nuevo precio/noche (Bs.) <span className="text-gray-400 font-normal text-xs">— dejar vacío para mantener</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={roomChangeModal.newPrice}
                    onChange={e => setRoomChangeModal(m => m ? { ...m, newPrice: e.target.value } : m)}
                    placeholder={`Ej: ${(roomChangeModal.res as any).price_per_night ?? 0}`}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <div className="flex justify-between gap-3 border-t border-gray-100 pt-4">
                  <button onClick={() => setRoomChangeModal(m => m ? { ...m, step: 'room' } : m)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                    ← Atrás
                  </button>
                  <button
                    disabled={!roomChangeModal.reason || (roomChangeModal.reason === 'damaged' && !roomChangeModal.description.trim())}
                    onClick={handleRoomChange}
                    className="px-5 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white rounded-lg disabled:opacity-40">
                    ✓ Confirmar cambio
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pagos Pendientes modal ── */}
      {pagosOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-green-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">💰 Pagos Pendientes</h3>
                <p className="text-xs text-green-700 font-semibold mt-0.5">Habitaciones con saldo sin registrar</p>
              </div>
              <button onClick={() => { setPagosOpen(false); setPagoForm(null); }} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {pagosLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-7 h-7 border-4 border-green-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : pagoRows.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">Sin pagos pendientes ✓</div>
              ) : pagoRows.map(row => {
                const liveItems = pendingVitrina[row.res.id] ?? [];
                const liveTotal = liveItems.reduce((s, i) => s + i.total, 0);
                return (
                <div key={row.res.id} className={`rounded-xl border px-4 py-3 ${row.pending > 0 ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{row.res.room_id} — <span className="font-semibold">{row.res.guest_name}</span></p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {row.res.check_in} → {row.res.check_out} · Total: <span className="font-semibold">Bs. {row.total.toFixed(2)}</span>
                        {row.paid > 0 && <> · Ya pagado: <span className="text-green-700 font-semibold">Bs. {row.paid.toFixed(2)}</span></>}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {row.pending > 0 ? (
                        <>
                          <p className="text-xs text-amber-700 font-bold">Pendiente</p>
                          <p className="text-lg font-bold text-amber-700">Bs. {row.pending.toFixed(2)}</p>
                        </>
                      ) : (
                        <p className="text-sm font-bold text-green-600">✓ Pagado</p>
                      )}
                    </div>
                  </div>

                  {/* Vitrina pending items — editable, reads live from pendingVitrina */}
                  {liveItems.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-200">
                      <p className="text-xs font-semibold text-amber-700 mb-1">🛒 Vitrina pendiente:</p>
                      {liveItems.map(item => (
                        <div key={item.productId} className="py-1 border-b border-amber-50 last:border-0">
                          <div className="flex items-center gap-1 text-xs text-gray-600">
                            <span className="flex-1 truncate">{item.productName}</span>
                            <button onClick={() => setPendingVitrina(prev => {
                              const items = (prev[row.res.id] ?? []).map(i => i.productId === item.productId
                                ? { ...i, qty: Math.max(1, i.qty - 1), total: Math.max(1, i.qty - 1) * i.price }
                                : i);
                              return { ...prev, [row.res.id]: items };
                            })} className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0">
                              <Minus size={9} />
                            </button>
                            <span className="w-5 text-center font-bold text-gray-800">{item.qty}</span>
                            <button onClick={() => setPendingVitrina(prev => {
                              const items = (prev[row.res.id] ?? []).map(i => i.productId === item.productId
                                ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.price }
                                : i);
                              return { ...prev, [row.res.id]: items };
                            })} className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0">
                              <Plus size={9} />
                            </button>
                            <span className="font-semibold w-14 text-right">Bs. {item.total.toFixed(2)}</span>
                            <button onClick={() => setPendingVitrina(prev => ({
                              ...prev,
                              [row.res.id]: (prev[row.res.id] ?? []).filter(i => i.productId !== item.productId),
                            }))} className="text-red-300 hover:text-red-500 flex-shrink-0 ml-0.5">
                              <Trash2 size={11} />
                            </button>
                          </div>
                          {/* Caja toggle per item */}
                          <div className="flex gap-1 mt-1">
                            <button
                              onClick={() => setPendingVitrina(prev => ({ ...prev, [row.res.id]: (prev[row.res.id] ?? []).map(i => i.productId === item.productId ? { ...i, caja: 'CAJA MAYOR' } : i) }))}
                              className={`flex-1 text-[9px] font-semibold py-0.5 rounded transition-colors ${(item.caja || 'CAJA MAYOR') === 'CAJA MAYOR' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                              Efectivo
                            </button>
                            <button
                              onClick={() => setPendingVitrina(prev => ({ ...prev, [row.res.id]: (prev[row.res.id] ?? []).map(i => i.productId === item.productId ? { ...i, caja: 'CUENTA BNB' } : i) }))}
                              className={`flex-1 text-[9px] font-semibold py-0.5 rounded transition-colors ${item.caja === 'CUENTA BNB' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                              QR
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold text-amber-700 mt-1 pt-1 border-t border-amber-100">
                        <span>Total vitrina</span>
                        <span>Bs. {liveTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Mini pago form */}
                  {(row.pending > 0 || liveTotal > 0) && (
                    pagoForm?.resId === row.res.id ? (
                      <div className="mt-3 pt-3 border-t border-amber-200 space-y-2">
                        {/* Toggle split */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">Método de pago</span>
                          <button
                            onClick={() => setPagoForm(f => f ? { ...f, split: !f.split, amount_qr: '', amount_cash: '' } : f)}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${pagoForm.split ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
                          >
                            {pagoForm.split ? '✓ Dividir QR + Efectivo' : 'Dividir QR + Efectivo'}
                          </button>
                        </div>

                        {pagoForm.split ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-28 flex-shrink-0">QR (CUENTA BNB)</span>
                              <input
                                type="number" min={0} step={0.5}
                                value={pagoForm.amount_qr}
                                onChange={e => setPagoForm(f => f ? { ...f, amount_qr: e.target.value } : f)}
                                placeholder="0.00"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-28 flex-shrink-0">Efectivo (CAJA)</span>
                              <input
                                type="number" min={0} step={0.5}
                                value={pagoForm.amount_cash}
                                onChange={e => setPagoForm(f => f ? { ...f, amount_cash: e.target.value } : f)}
                                placeholder="0.00"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                            </div>
                            {(parseFloat(pagoForm.amount_qr) || 0) + (parseFloat(pagoForm.amount_cash) || 0) > 0 && (
                              <p className="text-xs text-gray-500 text-right">
                                Total: <span className="font-bold text-gray-800">Bs. {((parseFloat(pagoForm.amount_qr) || 0) + (parseFloat(pagoForm.amount_cash) || 0)).toFixed(2)}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="number" min={0} step={0.5}
                              value={pagoForm.amount}
                              onChange={e => setPagoForm(f => f ? { ...f, amount: e.target.value } : f)}
                              placeholder="Monto Bs."
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                            />
                            <CustomSelect
                              value={pagoForm.caja}
                              onChange={v => setPagoForm(f => f ? { ...f, caja: v } : f)}
                              options={[
                                { value: 'CAJA MAYOR', label: 'CAJA MAYOR' },
                                { value: 'CUENTA BNB', label: 'CUENTA BNB' },
                              ]}
                              placeholder="Caja"
                            />
                          </div>
                        )}

                        {liveTotal > 0 && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                            🛒 Se agregarán Bs. {liveTotal.toFixed(2)} de vitrina a CAJA MAYOR
                          </p>
                        )}

                        <div className="flex gap-2">
                          <button onClick={() => setPagoForm(null)}
                            className="flex-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                            Cancelar
                          </button>
                          <button onClick={confirmarPago} disabled={isPaying}
                            className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-500 text-white rounded-lg disabled:opacity-50">
                            {isPaying ? '...' : '✓ Registrar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setPagoForm({ resId: row.res.id, amount: (row.pending + liveTotal).toFixed(2), caja: 'CAJA MAYOR', split: false, amount_qr: '', amount_cash: '' })}
                        className="mt-2 w-full text-xs font-semibold text-green-700 border border-green-300 bg-green-100 hover:bg-green-200 rounded-lg px-3 py-1.5 transition-colors">
                        + Registrar pago {liveTotal > 0 ? `· Total: Bs. ${(row.pending + liveTotal).toFixed(2)}` : ''}
                      </button>
                    )
                  )}
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Late Checkout popup ── */}
      {lateCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-purple-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">🌙 Late Checkout</h3>
                <p className="text-xs text-purple-700 font-semibold mt-0.5">
                  {lateCheckoutModal.res.room_id} — {lateCheckoutModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setLateCheckoutModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hora de salida</label>
                <TimePicker
                  value={lateCheckoutModal.time}
                  onChange={v => setLateCheckoutModal(m => m ? { ...m, time: v } : m)}
                  placeholder="-- : --" emoji="🕐"
                  accentClass="border-purple-400 ring-purple-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio extra a cobrar (Bs.)</label>
                <input
                  type="number" min={0} step={0.5}
                  value={lateCheckoutModal.extra_price}
                  onChange={e => setLateCheckoutModal(m => m ? { ...m, extra_price: e.target.value } : m)}
                  placeholder="0.00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              {parseFloat(lateCheckoutModal.extra_price || '0') > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registrar en caja</label>
                  <CustomSelect
                    value={lateCheckoutModal.caja}
                    onChange={v => setLateCheckoutModal(m => m ? { ...m, caja: v } : m)}
                    options={[
                      { value: 'CAJA MAYOR', label: 'CAJA MAYOR' },
                      { value: 'CAJA CHICA', label: 'CAJA CHICA' },
                      { value: 'CUENTA BNB', label: 'CUENTA BNB' },
                    ]}
                    placeholder="— Seleccionar —"
                  />
                </div>
              )}
              {parseFloat(lateCheckoutModal.extra_price || '0') > 0 && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 text-sm font-semibold text-purple-700 flex justify-between">
                  <span>Total a cobrar por late checkout</span>
                  <span>Bs. {parseFloat(lateCheckoutModal.extra_price).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setLateCheckoutModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const r = lateCheckoutModal.res;
                  const extraPrice = parseFloat(lateCheckoutModal.extra_price || '0');
                  await supabase.from('reservations').update({
                    late_checkout: true,
                    departure_time: lateCheckoutModal.time || null,
                    updated_at: new Date().toISOString(),
                  }).eq('id', r.id);
                  if (extraPrice > 0 && lateCheckoutModal.caja) {
                    await supabase.from('transactions').insert({
                      date:        new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' }),
                      type:        'ingreso',
                      category:    'H02-LATE CHECKOUT',
                      room_id:     r.room_id,
                      amount:      extraPrice,
                      description: `Late Checkout — ${r.guest_name}`,
                      caja:        lateCheckoutModal.caja,
                      responsible_id: profile?.id ?? null,
                    });
                    logActivity(profile?.id, profile?.name, 'Late Checkout', 'transaction', r.id, `${r.room_id} — ${r.guest_name} · Bs. ${extraPrice.toFixed(2)} (${lateCheckoutModal.caja})`);
                  }
                  logActivity(profile?.id, profile?.name, 'Reserva editada', 'reservation', r.id, `Late checkout ${r.room_id} — ${r.guest_name}`);
                  setLateCheckoutModal(null);
                  fetchData();
                }}
                className="px-5 py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg">
                ✓ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick action menu for empty cells ── */}
      {quickMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setQuickMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-44"
            style={{ top: quickMenu.y + 4, left: Math.min(quickMenu.x, window.innerWidth - 184) }}
          >
            {[
              { label: '📅 Reserva',         action: () => openNew(quickMenu.roomId, quickMenu.day, 'reserva', 'reserva') },
              { label: '✅ Check-in directo', action: () => openNew(quickMenu.roomId, quickMenu.day, 'ocupado', 'directo') },
              { label: '🔧 Mantenimiento',   action: () => { setMaintenanceForm({ roomId: quickMenu.roomId, day: quickMenu.day, detail: '', endDate: toDateStr(new Date(year, month, quickMenu.day + 1)) }); setQuickMenu(null); } },
              { label: '🧹 Habilitación',    action: () => quickCreateStatus(quickMenu.roomId, quickMenu.day, 'habilitacion', 'Habilitación') },
            ].map(opt => (
              <button
                key={opt.label}
                onClick={opt.action}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-800 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
      {/* ── Nota rápida modal (salon) ── */}
      {notaModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-indigo-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">📝 Nota del salón</h3>
                <p className="text-xs text-indigo-700 font-semibold mt-0.5">{notaModal.res.guest_name} — {notaModal.res.check_in}</p>
              </div>
              <button onClick={() => setNotaModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="px-6 py-5">
              <textarea
                rows={4}
                value={notaModal.text}
                onChange={e => setNotaModal(m => m ? { ...m, text: e.target.value } : m)}
                placeholder="Escribe una nota para este día..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setNotaModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={handleSaveNota}
                className="px-5 py-2 text-sm font-semibold bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg">
                Guardar nota
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Global datalists for combobox inputs ── */}
      <datalist id="bastille-marital-opts">
        <option value="S" />
        <option value="C" />
        <option value="D" />
        <option value="V" />
      </datalist>
      <datalist id="bastille-purpose-opts">
        <option value="Turismo" />
        <option value="Trabajo" />
        <option value="Estudio" />
        <option value="Salud" />
        <option value="Negocios" />
        <option value="Otro" />
      </datalist>
    </div>
  );
}
