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
  if (roomType.includes('S/M/MC/F') || roomType.includes('S/M/F')) return ['Simple', 'Matrimonial', 'Doble', 'Matri más Camita', 'Familiar'];
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
  gender:    '' | 'M' | 'F';
}
const emptyChildGuest = (): ChildGuest => ({ name: '', document: '', birthdate: '', gender: '' });

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
  early_checkin:     false,
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
  // Adelanto
  adelanto:          '',
  adelanto_caja:     'CAJA MAYOR' as string,
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
    checkoutPaidList:   [] as { id: string; amount: number; date: string; description: string | null }[],
    // inline adelanto form
    checkoutAdelantoOpen: false,
    checkoutAdelantoAmt:  '',
    checkoutAdelantoDate: '',
    checkoutAdelantoCaja: 'CAJA MAYOR' as string,
    // hospedaje payment form
    checkoutHospPayAmt: '',
    checkoutHospPayCaja:'CAJA MAYOR' as string,
    checkoutHospSplit:  false,
    checkoutHospAmt_cash: '',
    checkoutHospAmt_qr:   '',
    checkoutHospAmt_card: '',
    // late checkout (fetched on open)
    checkoutLatePaid:   0,
    checkoutLateTotal:  0,
    // late checkout payment form (if not yet paid)
    checkoutLatePayAmt: '',
    checkoutLatePayCaja:'CAJA MAYOR' as string,
    // early check-in
    checkoutEarlyPaid:   0,
    checkoutEarlyPayAmt: '',
    checkoutEarlyPayCaja:'CAJA MAYOR' as string,
    // mascota
    checkoutMascotaPaid:    0,
    checkoutMascotaPayAmt:  '',
    checkoutMascotaPayCaja: 'CAJA MAYOR' as string,
    // desayuno extra
    checkoutDesayunoPaid:    0,
    checkoutDesayunoPayAmt:  '',
    checkoutDesayunoPayCaja: 'CAJA MAYOR' as string,
    // per-night prices (editable breakdown)
    checkoutNightPrices: [] as number[],
    // vitrina items paid in this session (for Anular)
    checkoutPaidVitrina: [] as PendingVitrinaItem[],
    // room change: previous room info (null if single room stay)
    prevRoomInfo: null as { room: string; checkin: string; checkout: string; price: number; nights: number; paid: number } | null,
  });

  // Late checkout popup (from card menu)
  const [lateCheckoutModal, setLateCheckoutModal] = useState<{
    res: Reservation; time: string; extra_price: string; caja: string;
  } | null>(null);
  // Stores late checkout price per reservation (in-session, used to pre-fill checkout modal)
  const [pendingLatePrice, setPendingLatePrice] = useState<Record<string, string>>({});

  // Early Check-in popup (from card menu)
  const [earlyCheckinModal, setEarlyCheckinModal] = useState<{
    res: Reservation; time: string; extra_price: string; caja: string;
  } | null>(null);
  const [pendingEarlyPrice, setPendingEarlyPrice] = useState<Record<string, string>>({});

  // Mascota popup (from card menu)
  const [mascotaModal, setMascotaModal] = useState<{
    res: Reservation; extra_price: string; caja: string;
  } | null>(null);
  const [pendingMascotaPrice, setPendingMascotaPrice] = useState<Record<string, string>>({});

  // Desayuno extra popup (from card menu)
  const [desayunoModal, setDesayunoModal] = useState<{
    res: Reservation; qty: number; caja: string;
  } | null>(null);
  const DESAYUNO_PRICE = 30;
  const [pendingDesayunoAmt, setPendingDesayunoAmt] = useState<Record<string, string>>({});

  // Adelanto popup (from card menu)
  const [adelantoModal, setAdelantoModal] = useState<{
    res: Reservation; amount: string; date: string; time: string; caja: string;
  } | null>(null);
  // Snapshot of DB values when checkout modal opens (used to revert on Cancel)
  const checkoutOriginalRef = useRef<{ departure_time: string; is_blacklist: boolean; wants_invoice: boolean; siaat_number: string; invoice_number: string } | null>(null);

  // Vitrina sale from card menu
  type VitrinaProduct = { id: string; name: string; price: number; quantity: number; image_filename: string };
  type VitrinaCartItem = { product: VitrinaProduct; qty: number; total: number; caja: 'CAJA MAYOR' | 'CUENTA BNB' | 'TARJETA' };
  type PendingVitrinaItem = { productId: string; productName: string; price: number; qty: number; total: number; caja: string };
  const [vitrinaSaleRes, setVitrinaSaleRes] = useState<Reservation | null>(null);
  // pendingVitrina: keyed by reservation_id, items not yet registered as transactions
  const [pendingVitrina, setPendingVitrina] = useState<Record<string, PendingVitrinaItem[]>>({});

  // Nota modal (existing cards — all rooms)
  const [notaModal, setNotaModal] = useState<{ res: Reservation; text: string } | null>(null);
  const [notaError, setNotaError] = useState('');
  async function handleSaveNota() {
    if (!notaModal) return;
    setNotaError('');
    const { error } = await supabase
      .from('reservations')
      .update({ notes: notaModal.text || null })
      .eq('id', notaModal.res.id);
    if (error) { setNotaError('Error: ' + error.message); return; }
    setNotaModal(null);
    fetchData();
  }

  // Quick nota modal (from empty cell — creates a 1-day placeholder)
  const [quickNotaModal, setQuickNotaModal] = useState<{ roomId: string; day: number; text: string } | null>(null);
  const [quickNotaError, setQuickNotaError] = useState('');
  async function handleSaveQuickNota() {
    if (!quickNotaModal) return;
    setQuickNotaError('');
    const date = toDateStr(new Date(year, month, quickNotaModal.day));
    const next = toDateStr(new Date(year, month, quickNotaModal.day + 1));
    const { error } = await supabase.from('reservations').insert({
      room_id:    quickNotaModal.roomId,
      guest_name: '📝 Nota',
      num_guests: 0,
      check_in:   date,
      check_out:  next,
      status:     'reserva' as ReservationStatus,
      notes:      quickNotaModal.text,
    });
    if (error) { setQuickNotaError('Error: ' + error.message); return; }
    setQuickNotaModal(null);
    fetchData();
  }

  // Room change flow
  const [roomChangeSaving, setRoomChangeSaving] = useState(false);
  const [roomChangeError,  setRoomChangeError]  = useState('');
  const [roomChangeModal, setRoomChangeModal] = useState<{
    step: 'room' | 'reason';
    res: Reservation;
    newRoomId: string;
    moveDate: string;          // first night in new room
    reason: 'damaged' | 'upgrade' | 'other' | '';
    description: string;
    newPrice: string;
    availableRooms: Room[];
    loading: boolean;
  } | null>(null);

  async function loadRoomsForMove(res: Reservation, fromDate: string) {
    setRoomChangeModal(prev => prev ? { ...prev, loading: true, newRoomId: '' } : null);
    // Only rooms free from fromDate → res.check_out are valid
    const { data: conflicts } = await supabase
      .from('reservations')
      .select('room_id')
      .in('status', ['ocupado', 'reserva', 'mantenimiento', 'habilitacion', 'limpieza'])
      .neq('id', res.id)
      .lt('check_in', res.check_out)
      .gt('check_out', fromDate);
    const blockedIds = new Set((conflicts ?? []).map((r: any) => r.room_id));
    blockedIds.add(res.room_id);
    const available = rooms.filter(r => !blockedIds.has(r.id));
    setRoomChangeModal(prev => prev ? { ...prev, availableRooms: available, loading: false } : null);
  }

  async function openRoomChange(res: Reservation) {
    setMenuOpenId(null);
    const today = toDateStr(new Date());
    // moveDate defaults to today, clamped to within the stay
    const moveDate = today < res.check_in ? res.check_in : today >= res.check_out ? res.check_in : today;
    setRoomChangeModal({ step: 'room', res, newRoomId: '', moveDate, reason: '', description: '', newPrice: '', availableRooms: [], loading: true });
    await loadRoomsForMove(res, moveDate);
  }

  async function handleRoomChange() {
    if (!roomChangeModal || !roomChangeModal.newRoomId || !roomChangeModal.reason) return;
    if (roomChangeSaving) return;   // prevent double-submit
    setRoomChangeSaving(true);
    setRoomChangeError('');

    const { res, newRoomId, reason, description, newPrice, moveDate } = roomChangeModal;
    const parsedPrice   = parseFloat(newPrice);
    const newPriceNight = (!isNaN(parsedPrice) && parsedPrice > 0) ? parsedPrice : (res.price_per_night ?? 0);
    const r             = res as any;
    const originalCheckOut = res.check_out;   // capture before update

    try {
      // ── 1. Shorten original reservation to moveDate ────────────────────────
      const { error: e1 } = await supabase.from('reservations')
        .update({ check_out: moveDate, updated_at: new Date().toISOString() })
        .eq('id', res.id);
      if (e1) throw new Error('Error al acortar reserva: ' + e1.message);

      // ── 2. New reservation for new room (moveDate → original check_out) ────
      const changeNotes = JSON.stringify({
        __room_change: true,
        from_room:     res.room_id,
        from_checkin:  res.check_in,
        from_checkout: moveDate,
        from_price:    res.price_per_night ?? 0,
        parent_id:     res.id,
      });
      const { error: e2 } = await supabase.from('reservations').insert({
        room_id:              newRoomId,
        guest_name:           res.guest_name,
        num_guests:           res.num_guests,
        check_in:             moveDate,
        check_out:            originalCheckOut,
        status:               'ocupado',
        price_per_night:      newPriceNight,
        notes:                changeNotes,
        additional_guests:    r.additional_guests     ?? null,
        guest_document:       r.guest_document        ?? null,
        guest_phone:          r.guest_phone           ?? null,
        guest_gender:         r.guest_gender          ?? null,
        guest_birthdate:      r.guest_birthdate       ?? null,
        guest_marital_status: r.guest_marital_status  ?? null,
        guest_country:        r.guest_country         ?? null,
        guest_profession:     r.guest_profession      ?? null,
        guest_purpose:        r.guest_purpose         ?? null,
        guest_origin:         r.guest_origin          ?? null,
        guest_next_dest:      r.guest_next_dest       ?? null,
        guest_transport:      r.guest_transport       ?? null,
        wants_invoice:        res.wants_invoice,
        siaat_number:         r.siaat_number          ?? null,
        has_pet:              res.has_pet,
        is_empresa:           res.is_empresa,
        created_by:           profile?.id             ?? null,
      });
      if (e2) throw new Error('Error al crear reserva en nueva hab.: ' + e2.message);

      // ── 3. Habilitación card on original room (1 day only) ────────────────
      const moveDateNext = toDateStr(new Date(new Date(moveDate + 'T00:00:00').getTime() + 86400000));
      const { error: e3 } = await supabase.from('reservations').insert({
        room_id:         res.room_id,
        guest_name:      '🏠 Habilitación',
        num_guests:      0,
        check_in:        moveDate,
        check_out:       moveDateNext,
        status:          'habilitacion',
        price_per_night: 0,
      });
      if (e3) throw new Error('Error al crear habilitación: ' + e3.message);

      // ── 4. Mantenimiento card if damaged ────────────────────────────────────
      if (reason === 'damaged') {
        await supabase.from('reservations').insert({
          room_id:         res.room_id,
          guest_name:      `⚠️ ${description.trim() || 'Daño reportado'}`,
          num_guests:      0,
          check_in:        moveDate,
          check_out:       originalCheckOut,
          status:          'mantenimiento',
          price_per_night: 0,
        });
      }

      logActivity(profile?.id, profile?.name, 'Cambio de habitación', 'reservation', res.id,
        `${res.room_id} → ${newRoomId} desde ${moveDate} (${reason})`);
      setRoomChangeModal(null);
      await fetchData();
    } catch (err: any) {
      setRoomChangeError(err.message ?? 'Error desconocido');
    } finally {
      setRoomChangeSaving(false);
    }
  }

  // Calendar hover highlight
  const [hoveredCell, setHoveredCell] = useState<{ roomId: string; day: number } | null>(null);

  // Note tooltip (Excel-style hover)
  const [noteTooltip, setNoteTooltip] = useState<{ notes: string; x: number; y: number } | null>(null);

  // ── Multi-room reservation handler ──
  async function handleSaveMultiRoom() {
    if (!multiRoomModal) return;
    const { checkIn, checkOut, guestName, numGuests, pricePerNight, selectedRooms } = multiRoomModal;
    if (!guestName.trim()) { setMultiRoomModal(m => m ? { ...m, error: 'Ingresa el nombre de la reserva.' } : m); return; }
    if (!checkIn || !checkOut || checkIn >= checkOut) { setMultiRoomModal(m => m ? { ...m, error: 'Fechas inválidas.' } : m); return; }
    if (selectedRooms.size === 0) { setMultiRoomModal(m => m ? { ...m, error: 'Selecciona al menos una habitación.' } : m); return; }
    setMultiRoomModal(m => m ? { ...m, saving: true, error: '' } : m);
    const price = parseFloat(pricePerNight) || 0;
    const rows = Array.from(selectedRooms).map(roomId => ({
      room_id: roomId, guest_name: guestName.trim(),
      num_guests: numGuests, check_in: checkIn, check_out: checkOut,
      status: 'reserva' as ReservationStatus, price_per_night: price,
    }));
    const { error } = await supabase.from('reservations').insert(rows);
    if (error) { setMultiRoomModal(m => m ? { ...m, saving: false, error: error.message } : m); return; }
    logActivity(profile?.id, profile?.name, 'Reserva múltiple creada', 'reservation', undefined,
      `${Array.from(selectedRooms).join(', ')} — ${guestName} (${checkIn} → ${checkOut})`);
    setMultiRoomModal(null);
    fetchData();
  }

  // Pagos Pendientes panel
  const [pagosOpen, setPagosOpen] = useState(false);
  type PagoRow = { res: Reservation; total: number; paid: number; pending: number; vitrinaItems: PendingVitrinaItem[]; vitrinaTotal: number };
  const [pagoRows, setPagoRows]   = useState<PagoRow[]>([]);
  const [pagosLoading, setPagosLoading] = useState(false);
  type PagoForm = { resId: string; amount: string; caja: string; split: boolean; amount_qr: string; amount_cash: string; amount_tarjeta: string };
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

    const _now     = new Date();
    const today    = _now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr  = _now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    const ciDate   = new Date(row.res.check_in  + 'T00:00:00');
    const coDate   = new Date(row.res.check_out + 'T00:00:00');
    const nights   = Math.max(1, Math.round((coDate.getTime() - ciDate.getTime()) / 86400000));
    const nightStr = `${nights} noche${nights === 1 ? '' : 's'}`;
    const desc     = `Hospedaje — ${row.res.guest_name} — ${nightStr}`;

    if (pagoForm.split) {
      const amtQr      = parseFloat(pagoForm.amount_qr)      || 0;
      const amtCash    = parseFloat(pagoForm.amount_cash)     || 0;
      const amtTarjeta = parseFloat(pagoForm.amount_tarjeta)  || 0;
      if (amtQr <= 0 && amtCash <= 0 && amtTarjeta <= 0) return;
      const splitInserts = [
        amtQr      > 0 && { caja: 'CUENTA BNB', amount: amtQr      },
        amtCash    > 0 && { caja: 'CAJA MAYOR',  amount: amtCash    },
        amtTarjeta > 0 && { caja: 'TARJETA',     amount: amtTarjeta },
      ].filter(Boolean) as { caja: string; amount: number }[];
      for (const ins of splitInserts) {
        await supabase.from('transactions').insert({
          date: today, time: timeStr, type: 'ingreso', category: 'H01-HOSPEDAJE',
          room_id: row.res.room_id, reservation_id: row.res.id,
          amount: ins.amount, description: desc, caja: ins.caja,
          responsible_id: profile?.id ?? null,
        });
      }
      const parts = splitInserts.map(i =>
        `${i.caja === 'CUENTA BNB' ? 'QR' : i.caja === 'TARJETA' ? 'Tarjeta' : 'Efectivo'}: Bs. ${i.amount.toFixed(2)}`
      ).join(', ');
      logActivity(profile?.id, profile?.name, 'Pago registrado', 'transaction', row.res.id,
        `${row.res.room_id} — ${row.res.guest_name} · ${parts}`);
    } else {
      const amount = parseFloat(pagoForm.amount);
      if (!amount || amount <= 0 || !pagoForm.caja) return;
      await supabase.from('transactions').insert({
        date: today, time: timeStr, type: 'ingreso', category: 'H01-HOSPEDAJE',
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
  // Multi-room reservation modal
  const [multiRoomModal, setMultiRoomModal] = useState<{
    checkIn: string; checkOut: string; guestName: string; numGuests: number;
    pricePerNight: string; selectedRooms: Set<string>; saving: boolean; error: string;
  } | null>(null);
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
      .from('rooms').select('*').eq('is_active', true).order('id');

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

  // ── Real-time sync: refresh when any user changes reservations or transactions ──
  useEffect(() => {
    const channel = supabase
      .channel('calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => { fetchData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' },  () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

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
      early_checkin:     r.early_checkin ?? false,
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
      adelanto:             '',
      adelanto_caja:        'CAJA MAYOR',
    });
    const allGuestData = (r.additional_guests ?? []) as any[];
    setAdditionalGuests(allGuestData.filter((g: any) => !g.role || g.role === 'adult') as AdditionalGuest[]);
    setChildGuests(allGuestData.filter((g: any) => g.role === 'child').map((g: any) => ({ name: g.name ?? '', document: g.document ?? '', birthdate: g.birthdate ?? '', gender: g.gender ?? '' })));
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
      check_out:       isSalon ? (form.check_out || form.check_in) : form.check_out,
      status:          form.status,
      room_subtype:    !isSalon && form.room_subtype ? form.room_subtype : null,
      arrival_time:    !isSalon && form.arrival_time   ? form.arrival_time   : null,
      departure_time:  !isSalon && form.departure_time ? form.departure_time : null,
      late_checkout:   !isSalon ? form.late_checkout  : false,
      early_checkin:   !isSalon ? form.early_checkin  : false,
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
          name: c.name, document: c.document, birthdate: c.birthdate, gender: c.gender,
          role: 'child',
        })),
        ...(numBabies > 0 ? [{ role: 'babies', count: numBabies }] : []),
      ] : [],
      created_by:      profile?.id ?? null,
      updated_at:      new Date().toISOString(),
    };

    let savedId = editingId;
    if (editingId) {
      const { error } = await supabase.from('reservations').update(payload).eq('id', editingId);
      setSaving(false);
      if (error) { setFormError('Error al guardar: ' + error.message); return; }
    } else {
      const { data: ins, error } = await supabase.from('reservations').insert(payload).select('id').single();
      setSaving(false);
      if (error) { setFormError('Error al guardar: ' + error.message); return; }
      savedId = ins?.id ?? null;
    }

    // Register adelanto transaction if provided
    const adelantoAmt = parseFloat(form.adelanto || '0');
    if (adelantoAmt > 0) {
      const _aNow     = new Date();
      const adelantoDate = _aNow.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
      const adelantoTime = _aNow.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
      await supabase.from('transactions').insert({
        date:           adelantoDate,
        time:           adelantoTime,
        description:    `Adelanto pagado — ${resolvedName}`,
        amount:         adelantoAmt,
        type:           'ingreso',
        category:       isSalon ? 'H02-ALQUILER DE SALÓN' : 'H01-HOSPEDAJE',
        caja:           form.adelanto_caja,
        room_id:        form.room_id || null,
        reservation_id: savedId,
        responsible_id: profile?.id ?? null,
      });
    }

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
      num_guests:           1 + confirmAdditionalGuests.length,
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

    // Always re-fetch the reservation from DB to get fresh vitrina_cart and other fields
    const { data: freshRes } = await supabase.from('reservations').select('*').eq('id', res.id).single();
    if (freshRes) res = freshRes as any;

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
      .from('transactions').select('id, amount, date, description')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H01-HOSPEDAJE')
      .order('date', { ascending: true });
    const paidList = (paidTxs ?? []) as { id: string; amount: number; date: string; description: string | null }[];
    const alreadyPaid = paidList.reduce((s, t) => s + t.amount, 0);

    // Fetch late checkout transactions for this room (by room_id + category)
    const { data: lateTxs } = await supabase
      .from('transactions').select('amount')
      .eq('room_id', res.room_id).eq('type', 'ingreso').eq('category', 'H02-LATE CHECKOUT')
      .gte('date', res.check_in);
    const latePaid  = (lateTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);
    const lateTotal = latePaid; // already paid from late checkout popup; show it

    // Fetch early check-in transactions
    const { data: earlyTxs } = await supabase
      .from('transactions').select('amount')
      .eq('room_id', res.room_id).eq('type', 'ingreso').eq('category', 'H04-EARLY CHECK-IN')
      .gte('date', res.check_in);
    const earlyPaid = (earlyTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);

    // Fetch mascota transactions
    const { data: mascotaTxs } = await supabase
      .from('transactions').select('amount')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H05-MASCOTAS');
    const mascotaPaid = (mascotaTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);

    const { data: desayunoTxs } = await supabase
      .from('transactions').select('amount')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H06-DESAYUNO');
    const desayunoPaid = (desayunoTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);

    const nights = Math.max(1, Math.round(
      (new Date(res.check_out + 'T00:00:00').getTime() - new Date(res.check_in + 'T00:00:00').getTime()) / 86400000
    ));
    // Build per-night prices: use saved array if it matches, else default to price_per_night
    const savedNightPrices = (res as any).night_prices as number[] | null;
    const nightPrices: number[] = (savedNightPrices && savedNightPrices.length === nights)
      ? savedNightPrices
      : Array(nights).fill(res.price_per_night ?? 0);

    // Detect room change split (notes contains __room_change JSON)
    let prevRoomInfo: { room: string; checkin: string; checkout: string; price: number; nights: number; paid: number } | null = null;
    try {
      const notesStr = (res as any).notes ?? '';
      if (notesStr.includes('__room_change')) {
        const parsed = JSON.parse(notesStr);
        if (parsed.__room_change && parsed.parent_id) {
          const prevNights = Math.max(1, Math.round(
            (new Date(parsed.from_checkout + 'T00:00:00').getTime() - new Date(parsed.from_checkin + 'T00:00:00').getTime()) / 86400000
          ));
          const { data: parentTxs } = await supabase
            .from('transactions').select('amount')
            .eq('reservation_id', parsed.parent_id).eq('type', 'ingreso').eq('category', 'H01-HOSPEDAJE');
          const parentPaid = (parentTxs ?? []).reduce((s: number, t: any) => s + t.amount, 0);
          prevRoomInfo = {
            room:     parsed.from_room,
            checkin:  parsed.from_checkin,
            checkout: parsed.from_checkout,
            price:    parsed.from_price ?? 0,
            nights:   prevNights,
            paid:     parentPaid,
          };
        }
      }
    } catch (_) { /* ignore malformed JSON */ }

    const prevPaid    = prevRoomInfo?.paid ?? 0;
    const prevTotal   = prevRoomInfo ? prevRoomInfo.nights * prevRoomInfo.price : 0;
    const hospTotal   = nightPrices.reduce((s, p) => s + p, 0) + prevTotal;
    const hospPending = Math.max(0, hospTotal - alreadyPaid - prevPaid);

    // Snapshot original DB values so Cancel can revert them
    checkoutOriginalRef.current = {
      departure_time: (res as any).departure_time ?? '',
      is_blacklist:   (res as any).is_blacklist ?? false,
      wants_invoice:  wantInv,
      siaat_number:   siaat,
      invoice_number: invoice,
    };

    setCheckoutModal({
      open: true, res,
      departure_time: (res as any).departure_time ?? '',
      is_invoice: wantInv,
      siaat_number:   siaat,
      invoice_number: invoice,
      is_blacklist:   (res as any).is_blacklist ?? false,
      checkoutPaid:        alreadyPaid,
      checkoutPaidList:    paidList,
      checkoutAdelantoOpen: false,
      checkoutAdelantoAmt:  '',
      checkoutAdelantoDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' }),
      checkoutAdelantoCaja: 'CAJA MAYOR',
      checkoutHospPayAmt:  hospPending > 0 ? hospPending.toFixed(2) : '',
      checkoutHospPayCaja: 'CAJA MAYOR',
      checkoutHospSplit:   false,
      checkoutHospAmt_cash: '',
      checkoutHospAmt_qr:   '',
      checkoutHospAmt_card: '',
      checkoutLatePaid:    latePaid,
      checkoutLateTotal:   lateTotal,
      checkoutLatePayAmt:  pendingLatePrice[res.id] ?? '',
      checkoutLatePayCaja: 'CAJA MAYOR',
      checkoutEarlyPaid:   earlyPaid,
      checkoutEarlyPayAmt: pendingEarlyPrice[res.id] ?? '',
      checkoutEarlyPayCaja:'CAJA MAYOR',
      checkoutMascotaPaid:    mascotaPaid,
      checkoutMascotaPayAmt:  pendingMascotaPrice[res.id] ?? '',
      checkoutMascotaPayCaja: 'CAJA MAYOR',
      checkoutDesayunoPaid:    desayunoPaid,
      checkoutDesayunoPayAmt:  pendingDesayunoAmt[res.id] || ((res as any).desayuno_pending > 0 ? String((res as any).desayuno_pending) : ''),
      checkoutDesayunoPayCaja: 'CAJA MAYOR',
      checkoutNightPrices: nightPrices,
      checkoutPaidVitrina: [],
      prevRoomInfo,
    });
    // Seed pendingVitrina from DB cart (so any user sees what others added)
    const dbCart: PendingVitrinaItem[] = (res as any).vitrina_cart ?? [];
    if (dbCart.length > 0) {
      setPendingVitrina(prev => ({ ...prev, [res.id]: dbCart }));
    }
  }

  async function cancelCheckout() {
    // Revert any saved changes back to original DB values
    if (checkoutModal.res && checkoutOriginalRef.current) {
      const orig = checkoutOriginalRef.current;
      await supabase.from('reservations').update({
        departure_time: orig.departure_time || null,
        wants_invoice:  orig.wants_invoice,
        siaat_number:   orig.wants_invoice ? (orig.siaat_number || null) : null,
        invoice_number: orig.wants_invoice ? (orig.invoice_number || null) : null,
        is_blacklist:   orig.is_blacklist,
        updated_at:     new Date().toISOString(),
      }).eq('id', checkoutModal.res.id);
    }
    setCheckoutModal(m => ({ ...m, open: false }));
  }

  async function saveCheckoutFields() {
    if (!checkoutModal.res) return;
    await supabase.from('reservations').update({
      departure_time:  checkoutModal.departure_time || null,
      wants_invoice:   checkoutModal.is_invoice,
      siaat_number:    checkoutModal.is_invoice ? (checkoutModal.siaat_number   || null) : null,
      invoice_number:  checkoutModal.is_invoice ? (checkoutModal.invoice_number || null) : null,
      is_blacklist:    checkoutModal.is_blacklist,
      night_prices:    checkoutModal.checkoutNightPrices.length > 0 ? checkoutModal.checkoutNightPrices : null,
      updated_at:      new Date().toISOString(),
    }).eq('id', checkoutModal.res.id);
    logActivity(profile?.id, profile?.name, 'Checkout guardado', 'reservation', checkoutModal.res.id,
      `${checkoutModal.res.room_id} — ${checkoutModal.res.guest_name}`);
    setCheckoutModal(m => ({ ...m, open: false }));
    fetchData();
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
      departure_time:  checkoutModal.departure_time || null,
      wants_invoice:   checkoutModal.is_invoice,
      siaat_number:    checkoutModal.is_invoice ? (checkoutModal.siaat_number   || null) : null,
      invoice_number:  checkoutModal.is_invoice ? (checkoutModal.invoice_number || null) : null,
      is_blacklist:    checkoutModal.is_blacklist,
      night_prices:    checkoutModal.checkoutNightPrices.length > 0 ? checkoutModal.checkoutNightPrices : null,
      vitrina_cart:    [],
      updated_at:      new Date().toISOString(),
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
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const now     = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    const nights  = Math.max(1, Math.round(
      (new Date(res.check_out + 'T00:00:00').getTime() - new Date(res.check_in + 'T00:00:00').getTime()) / 86400000
    ));
    const desc = `Hospedaje ${nights} noche${nights === 1 ? '' : 's'} — ${res.guest_name}`;

    if (checkoutModal.checkoutHospSplit) {
      const amtCash = parseFloat(checkoutModal.checkoutHospAmt_cash) || 0;
      const amtQr   = parseFloat(checkoutModal.checkoutHospAmt_qr)   || 0;
      const amtCard = parseFloat(checkoutModal.checkoutHospAmt_card)  || 0;
      const total   = amtCash + amtQr + amtCard;
      if (total <= 0) return;
      const inserts = [
        amtCash > 0 && { caja: 'CAJA MAYOR',  amount: amtCash },
        amtQr   > 0 && { caja: 'CUENTA BNB',  amount: amtQr   },
        amtCard > 0 && { caja: 'TARJETA',      amount: amtCard },
      ].filter(Boolean) as { caja: string; amount: number }[];
      for (const ins of inserts) {
        await supabase.from('transactions').insert({
          date: today, time: timeStr, type: 'ingreso', category: 'H01-HOSPEDAJE',
          room_id: res.room_id, reservation_id: res.id,
          amount: ins.amount, description: desc, caja: ins.caja, responsible_id: profile?.id ?? null,
        });
      }
      const parts = inserts.map(i => `${i.caja === 'CUENTA BNB' ? 'QR' : i.caja === 'TARJETA' ? 'Tarjeta' : 'Efectivo'}: Bs. ${i.amount.toFixed(2)}`).join(', ');
      logActivity(profile?.id, profile?.name, 'Pago hospedaje', 'transaction', res.id,
        `${res.room_id} — ${res.guest_name} · ${parts}`);
      const newEntries = inserts.map(i => ({ id: `tmp-${Date.now()}-${i.caja}`, amount: i.amount, date: today, description: desc }));
      setCheckoutModal(m => ({ ...m, checkoutPaid: m.checkoutPaid + total, checkoutPaidList: [...m.checkoutPaidList, ...newEntries], checkoutHospSplit: false, checkoutHospAmt_cash: '', checkoutHospAmt_qr: '', checkoutHospAmt_card: '' }));
    } else {
      const amt = parseFloat(checkoutModal.checkoutHospPayAmt) || 0;
      if (amt <= 0) return;
      const { data: ins } = await supabase.from('transactions').insert({
        date: today, time: timeStr, type: 'ingreso', category: 'H01-HOSPEDAJE',
        room_id: res.room_id, reservation_id: res.id, amount: amt,
        description: desc, caja: checkoutModal.checkoutHospPayCaja, responsible_id: profile?.id ?? null,
      }).select('id').single();
      logActivity(profile?.id, profile?.name, 'Pago hospedaje', 'transaction', res.id,
        `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutHospPayCaja})`);
      const newEntry = { id: (ins as any)?.id ?? `tmp-${Date.now()}`, amount: amt, date: today, description: desc };
      setCheckoutModal(m => ({ ...m, checkoutPaid: m.checkoutPaid + amt, checkoutPaidList: [...m.checkoutPaidList, newEntry], checkoutHospPayAmt: '' }));
    }
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
    const newCart = (pendingVitrina[res.id] ?? []).filter(i => i.productId !== item.productId);
    setPendingVitrina(prev => ({ ...prev, [res.id]: newCart }));
    // Sync removed item back to DB (awaited so the request actually fires)
    await supabase.from('reservations').update({ vitrina_cart: newCart, updated_at: new Date().toISOString() }).eq('id', res.id);
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
    setCheckoutModal(m => ({
      ...m,
      checkoutPaid: Math.max(0, m.checkoutPaid - tx.amount),
      checkoutPaidList: m.checkoutPaidList.filter(t => t.id !== tx.id),
    }));
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

  async function checkoutPayEarly() {
    const amt = parseFloat(checkoutModal.checkoutEarlyPayAmt) || 0;
    if (amt <= 0 || !checkoutModal.res) return;
    const res = checkoutModal.res;
    const now  = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    await supabase.from('transactions').insert({
      date: today, time: timeStr, type: 'ingreso', category: 'H04-EARLY CHECK-IN',
      room_id: res.room_id, reservation_id: res.id, amount: amt,
      description: `Early Check-in — ${res.guest_name}`,
      caja: checkoutModal.checkoutEarlyPayCaja, responsible_id: profile?.id ?? null,
    });
    logActivity(profile?.id, profile?.name, 'Pago early check-in', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutEarlyPayCaja})`);
    setCheckoutModal(m => ({ ...m, checkoutEarlyPaid: m.checkoutEarlyPaid + amt, checkoutEarlyPayAmt: '' }));
  }

  async function checkoutAnularEarly() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const { data: txs } = await supabase.from('transactions').select('id, amount')
      .eq('room_id', res.room_id).eq('type', 'ingreso').eq('category', 'H04-EARLY CHECK-IN')
      .gte('date', res.check_in).order('created_at', { ascending: false }).limit(1);
    const tx = txs?.[0];
    if (!tx) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    logActivity(profile?.id, profile?.name, 'Pago anulado (early check-in)', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${tx.amount.toFixed(2)}`);
    setCheckoutModal(m => ({ ...m, checkoutEarlyPaid: Math.max(0, m.checkoutEarlyPaid - tx.amount) }));
  }

  async function checkoutPayMascota() {
    const amt = parseFloat(checkoutModal.checkoutMascotaPayAmt) || 0;
    if (amt <= 0 || !checkoutModal.res) return;
    const res = checkoutModal.res;
    const now  = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    await supabase.from('transactions').insert({
      date: today, time: timeStr, type: 'ingreso', category: 'H05-MASCOTAS',
      room_id: res.room_id, reservation_id: res.id, amount: amt,
      description: `Mascota — ${res.guest_name}`,
      caja: checkoutModal.checkoutMascotaPayCaja, responsible_id: profile?.id ?? null,
    });
    logActivity(profile?.id, profile?.name, 'Pago mascota', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutMascotaPayCaja})`);
    setCheckoutModal(m => ({ ...m, checkoutMascotaPaid: m.checkoutMascotaPaid + amt, checkoutMascotaPayAmt: '' }));
  }

  async function checkoutAnularMascota() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const { data: txs } = await supabase.from('transactions').select('id, amount')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H05-MASCOTAS')
      .order('created_at', { ascending: false }).limit(1);
    const tx = txs?.[0];
    if (!tx) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    logActivity(profile?.id, profile?.name, 'Pago anulado (mascota)', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${tx.amount.toFixed(2)}`);
    setCheckoutModal(m => ({ ...m, checkoutMascotaPaid: Math.max(0, m.checkoutMascotaPaid - tx.amount) }));
  }

  async function checkoutPayDesayuno() {
    const amt = parseFloat(checkoutModal.checkoutDesayunoPayAmt) || 0;
    if (amt <= 0 || !checkoutModal.res) return;
    const res = checkoutModal.res;
    const now = new Date();
    const today   = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
    await supabase.from('transactions').insert({
      date: today, time: timeStr, type: 'ingreso', category: 'H06-DESAYUNO',
      room_id: res.room_id, reservation_id: res.id, amount: amt,
      description: `Desayuno extra — ${res.guest_name}`,
      caja: checkoutModal.checkoutDesayunoPayCaja, responsible_id: profile?.id ?? null,
    });
    logActivity(profile?.id, profile?.name, 'Pago desayuno', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutDesayunoPayCaja})`);
    setPendingDesayunoAmt(prev => { const n = { ...prev }; delete n[res.id]; return n; });
    await supabase.from('reservations').update({ desayuno_pending: 0, updated_at: new Date().toISOString() }).eq('id', res.id);
    setCheckoutModal(m => ({ ...m, checkoutDesayunoPaid: m.checkoutDesayunoPaid + amt, checkoutDesayunoPayAmt: '' }));
  }

  async function checkoutAnularDesayuno() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;
    const { data: txs } = await supabase.from('transactions').select('id, amount')
      .eq('reservation_id', res.id).eq('type', 'ingreso').eq('category', 'H06-DESAYUNO')
      .order('created_at', { ascending: false }).limit(1);
    const tx = txs?.[0];
    if (!tx) return;
    await supabase.from('transactions').delete().eq('id', tx.id);
    logActivity(profile?.id, profile?.name, 'Pago anulado (desayuno)', 'transaction', res.id,
      `${res.room_id} — ${res.guest_name} · Bs. ${tx.amount.toFixed(2)}`);
    setCheckoutModal(m => ({ ...m, checkoutDesayunoPaid: Math.max(0, m.checkoutDesayunoPaid - tx.amount) }));
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

  // ── responsive ──
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  const CELL_W    = isMobile ? 30 : 116;
  const ROOM_W    = isMobile ? 48 : 130;
  const CELL_H    = isMobile ? 'h-8' : 'h-16';

  return (
    <div className="flex flex-col h-full gap-2 md:gap-4">
      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg md:text-xl font-bold text-gray-900">Calendario de Reservas</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-0.5">
            {MONTH_NAMES[month]} {year}
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-2">
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
      <div className="flex flex-wrap gap-2 md:gap-3">
        {(Object.entries(STATUS_CONFIG) as [ReservationStatus, typeof STATUS_CONFIG[ReservationStatus]][]).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-sm ${cfg.bg}`} />
            <span className="text-[10px] md:text-xs text-gray-600">{cfg.label}</span>
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
          <table className="border-collapse" style={{ minWidth: `${ROOM_W + numDays * CELL_W}px` }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-50">
                {/* Room header */}
                <th className="sticky left-0 z-30 bg-gray-50 text-left px-2 md:px-4 py-2 md:py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b-2 border-r-2 border-gray-300" style={{ width: ROOM_W, minWidth: ROOM_W }}>
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
                      style={{ width: CELL_W, minWidth: CELL_W }}
                      className={`text-center border-b-2 border-r border-gray-300 px-0.5 py-1.5 md:py-2.5 transition-colors ${
                        isToday
                          ? 'bg-amber-50 border-b-amber-400'
                          : isWeekend
                          ? 'bg-gray-100 border-b-gray-400'
                          : hoveredCell?.day === d
                          ? 'bg-amber-50 border-b-amber-400'
                          : 'bg-gray-50 border-b-gray-400'
                      }`}
                    >
                      <div className={`text-xs md:text-sm font-bold ${isToday ? 'text-amber-600' : 'text-gray-700'}`}>{d}</div>
                      <div className={`text-[10px] md:text-xs font-medium ${isToday ? 'text-amber-500' : 'text-gray-400'}`}>
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
                  <td style={{ width: ROOM_W, minWidth: ROOM_W }} className={`sticky left-0 z-10 border-r-2 border-b border-gray-300 px-2 md:px-4 py-1 md:py-2 transition-colors ${
                    hoveredCell?.roomId === room.id ? 'bg-amber-50' : ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }`}>
                    <div className={`font-bold text-xs md:text-sm transition-colors flex items-center gap-1 ${hoveredCell?.roomId === room.id ? 'text-amber-700' : 'text-gray-900'}`}>
                      {room.id}
                      {/^A\d/.test(room.id) && <span title="Ducha eléctrica" className="text-[11px]">🚿⚡</span>}
                    </div>
                    <div className="hidden md:block text-xs text-gray-400 truncate mt-0.5">{room.type}</div>
                  </td>

                  {/* Day cells */}
                  {days.map(d => {
                    const res = cellMap[room.id]?.[d];
                    const isNota = res?.guest_name?.startsWith('📝');
                    const cfg = isNota
                      ? { bg: 'bg-red-500', text: 'text-white', border: 'border-red-600', label: 'Nota', dot: 'bg-red-500' }
                      : res ? STATUS_CONFIG[res.status] : null;
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
                        className={`border-r border-b border-gray-300 p-0.5 md:p-1 ${CELL_H} align-top transition-colors ${
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
                            onMouseEnter={e => {
                              setHoveredCell({ roomId: room.id, day: d });
                              const rawNotes = (res as any).notes ?? '';
                              if (!isNota && rawNotes && !rawNotes.includes('__room_change')) {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                setNoteTooltip({ notes: rawNotes, x: rect.right + 8, y: rect.top });
                              }
                            }}
                            onMouseLeave={() => { setHoveredCell(null); setNoteTooltip(null); }}
                          >
                          <button
                            onClick={e => {
                              if (selectMode) { toggleCellSelect(res); return; }
                              setCardMenu({ res, x: e.clientX, y: e.clientY });
                            }}
                            className={`w-full h-full rounded-sm md:rounded-lg ${isMobile ? 'px-0.5 py-0.5' : 'px-2 py-1'} text-left transition-all ${cfg?.bg ?? 'bg-gray-400'} ${cfg?.text ?? 'text-white'} ${
                              selectMode
                                ? selectedIds.has(res.id)
                                  ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent brightness-110'
                                  : selectedType && selectedType !== res.status
                                    ? 'cursor-not-allowed'
                                    : 'hover:brightness-110 cursor-pointer'
                                : 'hover:opacity-80 cursor-pointer'
                            }`}
                          >
                            {isMobile ? (
                              /* ── Mobile: minimal — just guest count on check-in ── */
                              isCheckIn && !isNota && res.status !== 'mantenimiento' && res.status !== 'habilitacion' ? (
                                <span className="text-[9px] font-bold leading-none opacity-90">{res.num_guests}p</span>
                              ) : isNota ? (
                                <span className="text-[9px]">📝</span>
                              ) : res.status === 'mantenimiento' ? (
                                <span className="text-[9px]">🔧</span>
                              ) : res.status === 'habilitacion' ? (
                                <span className="text-[9px]">🧹</span>
                              ) : null
                            ) : isNota ? (
                              <div className="text-[10px] font-bold leading-tight break-words">
                                📝 {(res as any).notes || 'Nota'}
                              </div>
                            ) : res.status === 'mantenimiento' ? (
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
                                  {(res as any).early_checkin && (
                                    <span className="text-[10px] font-bold bg-orange-600 text-white rounded px-1 py-px leading-none">EC</span>
                                  )}
                                  {(res as any).late_checkout ? (
                                    <span className="text-[10px] font-bold bg-purple-700 text-white rounded px-1 py-px leading-none">
                                      {departureTime ? `LC ${departureTime}` : 'LC'}
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
                                  {(res as any).early_checkin && (
                                    <span className="text-[10px] font-bold bg-orange-600 text-white rounded px-1 py-px leading-none">EC</span>
                                  )}
                                  {(res as any).late_checkout ? (
                                    <span className="text-[10px] font-bold bg-purple-700 text-white rounded px-1 py-px leading-none">
                                      {departureTime ? `LC ${departureTime}` : 'LC'}
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

                          {/* ── Note indicator (Excel-style corner triangle) ── */}
                          {!isNota && (res as any).notes && !((res as any).notes ?? '').includes('__room_change') && (
                            <div
                              className="absolute top-0 right-0 w-0 h-0 pointer-events-none z-10"
                              style={{ borderTop: '9px solid #facc15', borderLeft: '9px solid transparent' }}
                            />
                          )}

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
                  <td style={{ width: ROOM_W, minWidth: ROOM_W }} className="sticky left-0 z-30 bg-gray-900 px-2 md:px-4 py-1.5 md:py-2 text-[10px] md:text-xs font-bold uppercase tracking-wider text-white border-t-2 border-gray-700">
                    <div># Personas</div>
                    <div className="text-[9px] font-normal text-blue-300 mt-0.5">+Niños</div>
                  </td>
                  {days.map(d => {
                    let adults = 0;
                    let kids = 0;
                    rooms.forEach(room => {
                      const res = cellMap[room.id]?.[d];
                      if (!res || room.id === 'SALON') return;
                      adults += res.num_guests;
                      const allGuests = (res as any).additional_guests ?? [];
                      kids += allGuests.filter((g: any) => g.role === 'child').length;
                      kids += allGuests.find((g: any) => g.role === 'babies')?.count ?? 0;
                    });
                    return (
                      <td key={d} className="bg-gray-900 text-center border-t-2 border-gray-700 border-r border-gray-800 py-1.5">
                        {adults > 0 || kids > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            {adults > 0 && <span className="text-sm font-bold text-amber-400">{adults}</span>}
                            {kids > 0 && <span className="text-[10px] font-semibold text-blue-300">+{kids}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
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

                  {/* Fecha inicio → Fecha fin */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio *</label>
                      <DatePicker
                        value={form.check_in}
                        onChange={v => setForm(f => ({ ...f, check_in: v }))}
                        placeholder="Inicio del evento"
                        accentClass="border-indigo-400 ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                      <DatePicker
                        value={form.check_out}
                        onChange={v => setForm(f => ({ ...f, check_out: v }))}
                        placeholder="Fin (opcional)"
                        accentClass="border-indigo-400 ring-indigo-100"
                      />
                    </div>
                  </div>

                  {/* N° personas */}
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

                  {/* Adelanto */}
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                    <label className="block text-sm font-semibold text-green-800">💵 Adelanto (opcional)</label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number" min={0} step={0.01}
                        value={form.adelanto}
                        onChange={e => setForm(f => ({ ...f, adelanto: e.target.value }))}
                        className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                        placeholder="0.00"
                      />
                      <select
                        value={form.adelanto_caja}
                        onChange={e => setForm(f => ({ ...f, adelanto_caja: e.target.value }))}
                        className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                      >
                        <option value="CAJA MAYOR">Efectivo</option>
                        <option value="CUENTA BNB">QR</option>
                        <option value="TARJETA">Tarjeta</option>
                      </select>
                    </div>
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

                      {/* N° noches + N° huéspedes + precio */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">N° noches <span className="text-red-400">*</span></label>
                          <input type="number" min={1} max={60} value={form.num_nights}
                            onChange={e => setForm(f => ({ ...f, num_nights: parseInt(e.target.value) || 1 }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">N° huéspedes</label>
                          <input type="number" min={1} max={20} value={form.num_guests}
                            onChange={e => setForm(f => ({ ...f, num_guests: parseInt(e.target.value) || 1 }))}
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

                      {/* Adelanto */}
                      <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                        <label className="block text-sm font-semibold text-green-800">💵 Adelanto (opcional)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number" min={0} step={0.01}
                            value={form.adelanto}
                            onChange={e => setForm(f => ({ ...f, adelanto: e.target.value }))}
                            className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                            placeholder="0.00"
                          />
                          <select
                            value={form.adelanto_caja}
                            onChange={e => setForm(f => ({ ...f, adelanto_caja: e.target.value }))}
                            className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                          >
                            <option value="CAJA MAYOR">Efectivo</option>
                            <option value="CUENTA BNB">QR</option>
                            <option value="TARJETA">Tarjeta</option>
                          </select>
                        </div>
                      </div>

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

                      {/* Adelanto */}
                      <div className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
                        <label className="block text-sm font-semibold text-green-800">💵 Adelanto (opcional)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="number" min={0} step={0.01}
                            value={form.adelanto}
                            onChange={e => setForm(f => ({ ...f, adelanto: e.target.value }))}
                            className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                            placeholder="0.00"
                          />
                          <select
                            value={form.adelanto_caja}
                            onChange={e => setForm(f => ({ ...f, adelanto_caja: e.target.value }))}
                            className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
                          >
                            <option value="CAJA MAYOR">Efectivo</option>
                            <option value="CUENTA BNB">QR</option>
                            <option value="TARJETA">Tarjeta</option>
                          </select>
                        </div>
                      </div>

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
                            ...( form.arrival_type !== 'directo' ? [
                              ['early_checkin', '🌅', 'Early Check-in','bg-orange-50 border-orange-400 text-orange-700'],
                              ['late_checkout',  '🌙', 'Late Checkout', 'bg-purple-50 border-purple-400 text-purple-700'],
                            ] : []),
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
                              <div className="grid grid-cols-3 gap-2">
                                <CustomSelect size="sm"
                                  value={child.gender}
                                  onChange={v => setChildGuests(prev => prev.map((c, i) => i === idx ? { ...c, gender: v as '' | 'M' | 'F' } : c))}
                                  options={[{ value: 'M', label: 'M — Masc.' }, { value: 'F', label: 'F — Fem.' }]}
                                  placeholder="Género" />
                                <input type="text" placeholder="CI / Doc." value={child.document}
                                  onChange={e => setChildGuests(prev => prev.map((c, i) => i === idx ? { ...c, document: e.target.value } : c))}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                <DatePicker birthdateMode useFixed value={child.birthdate}
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
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Profesión" value={ag.profession}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, profession: e.target.value } : g))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        <input type="text" list="bastille-purpose-opts" placeholder="Motivo de viaje" value={ag.purpose}
                          onChange={e => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, purpose: e.target.value } : g))}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                      </div>
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
              <button onClick={cancelCheckout} className="text-gray-400 hover:text-gray-600">
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
                const prev = checkoutModal.prevRoomInfo;
                const nights = Math.max(1, Math.round(
                  (new Date(r.check_out + 'T00:00:00').getTime() - new Date(r.check_in + 'T00:00:00').getTime()) / 86400000
                ));
                const nightPrices = checkoutModal.checkoutNightPrices.length === nights
                  ? checkoutModal.checkoutNightPrices
                  : Array(nights).fill(r.price_per_night ?? 0);
                const currentTotal = nightPrices.reduce((s, p) => s + p, 0);
                const prevTotal    = prev ? prev.nights * prev.price : 0;
                const hospTotal    = currentTotal + prevTotal;
                const hospPaid     = checkoutModal.checkoutPaid + (prev?.paid ?? 0);
                const hospPending  = Math.max(0, hospTotal - hospPaid);
                const vitItems    = pendingVitrina[r.id] ?? [];
                const hasLate     = !!(r as any).late_checkout;

                return (
                  <div className="space-y-3">

                    {/* ── Hospedaje ── */}
                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                      <div className="px-4 py-2 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-500">🏨 Hospedaje</div>
                      <div className="px-4 py-3 space-y-1 text-sm">

                        {/* Previous room section (room change) */}
                        {prev && (
                          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 mb-2 space-y-0.5">
                            <div className="flex justify-between text-xs font-bold text-gray-700">
                              <span>🏠 {prev.room} <span className="font-normal text-gray-400">({prev.checkin} → {prev.checkout})</span></span>
                              <span>{prev.nights} noche{prev.nights !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>Bs. {prev.price.toFixed(2)}/noche</span>
                              <span className="font-semibold text-gray-700">Bs. {prevTotal.toFixed(2)}</span>
                            </div>
                            {prev.paid > 0 && (
                              <div className="flex justify-between text-xs text-green-600">
                                <span>✓ Ya pagado</span>
                                <span>Bs. {prev.paid.toFixed(2)}</span>
                              </div>
                            )}
                            {prev.paid < prevTotal && (
                              <div className="flex justify-between text-xs text-red-500">
                                <span>Pendiente</span>
                                <span>Bs. {(prevTotal - prev.paid).toFixed(2)}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Current room */}
                        <div className="flex justify-between text-gray-600">
                          <span>{prev ? `🔄 ${r.room_id} ` : '📅 '}{r.check_in} → {r.check_out}</span>
                          <span className="font-semibold">{nights} noche{nights !== 1 ? 's' : ''}</span>
                        </div>
                        {nightPrices.length > 0 && <>
                          <div className="space-y-1 pt-0.5">
                            {nightPrices.map((price, i) => {
                              const d = new Date(r.check_in + 'T00:00:00');
                              d.setDate(d.getDate() + i);
                              const label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
                              return (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 w-16 flex-shrink-0">Noche {i+1} · {label}</span>
                                  <div className="flex-1 border-b border-dashed border-gray-200" />
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-xs text-gray-400">Bs.</span>
                                    <input
                                      type="number" min={0} step={0.5}
                                      value={price}
                                      onChange={e => {
                                        const newPrices = [...checkoutModal.checkoutNightPrices];
                                        newPrices[i] = parseFloat(e.target.value) || 0;
                                        const newTotal = newPrices.reduce((s, p) => s + p, 0) + (checkoutModal.prevRoomInfo ? checkoutModal.prevRoomInfo.nights * checkoutModal.prevRoomInfo.price : 0);
                                        const newPending = Math.max(0, newTotal - checkoutModal.checkoutPaid - (checkoutModal.prevRoomInfo?.paid ?? 0));
                                        setCheckoutModal(m => ({
                                          ...m,
                                          checkoutNightPrices: newPrices,
                                          checkoutHospPayAmt: newPending > 0 ? newPending.toFixed(2) : '',
                                        }));
                                      }}
                                      className="w-20 text-right border border-amber-200 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 bg-white"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-1">
                            <span>Total</span><span>Bs. {hospTotal.toFixed(2)}</span>
                          </div>
                          {/* Payment list */}
                          {checkoutModal.checkoutPaidList.length > 0 && (
                            <div className="space-y-1 border border-green-100 rounded-xl bg-green-50 px-3 py-2">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-semibold text-green-800">Pagos registrados</span>
                                <button onClick={checkoutAnularHosp}
                                  className="text-[10px] text-red-400 hover:text-red-600 underline">
                                  Anular último
                                </button>
                              </div>
                              {checkoutModal.checkoutPaidList.map((p, i) => (
                                <div key={p.id ?? i} className="flex justify-between text-xs text-green-700">
                                  <span className="truncate max-w-[60%]">{p.date} · {p.description ?? 'Pago'}</span>
                                  <span className="font-semibold">Bs. {p.amount.toFixed(2)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs font-bold text-green-800 border-t border-green-200 pt-1 mt-1">
                                <span>✓ Total pagado</span>
                                <span>Bs. {hospPaid.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                          {/* Inline adelanto button / form */}
                          {!checkoutModal.checkoutAdelantoOpen ? (
                            <button
                              onClick={() => setCheckoutModal(m => ({ ...m, checkoutAdelantoOpen: true }))}
                              className="w-full text-xs text-green-700 border border-dashed border-green-300 rounded-lg py-1.5 hover:bg-green-50 transition-colors">
                              + Registrar adelanto con fecha
                            </button>
                          ) : (
                            <div className="border border-green-200 rounded-xl bg-green-50 p-3 space-y-2">
                              <p className="text-xs font-semibold text-green-800">Adelanto</p>
                              <div className="flex gap-2 items-center">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutAdelantoAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutAdelantoAmt: e.target.value }))}
                                  placeholder="Monto Bs."
                                  className="w-28 border border-green-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                                <div className="flex-1">
                                  <DatePicker
                                    value={checkoutModal.checkoutAdelantoDate}
                                    onChange={d => setCheckoutModal(m => ({ ...m, checkoutAdelantoDate: d }))}
                                    useFixed
                                  />
                                </div>
                              </div>
                              <div className="flex gap-1">
                                {(['CAJA MAYOR','CUENTA BNB','TARJETA','CAJA CHICA'] as const).map(c => (
                                  <button key={c} type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutAdelantoCaja: c }))}
                                    className={`flex-1 text-[10px] py-1 rounded-lg font-semibold border transition-colors ${checkoutModal.checkoutAdelantoCaja === c ? 'bg-green-600 text-white border-green-600' : 'text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                                    {c === 'CAJA MAYOR' ? 'Efectivo' : c === 'CUENTA BNB' ? 'QR' : c === 'TARJETA' ? 'Tarjeta' : 'Ch.Chica'}
                                  </button>
                                ))}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => setCheckoutModal(m => ({ ...m, checkoutAdelantoOpen: false, checkoutAdelantoAmt: '' }))}
                                  className="flex-1 text-xs py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50">
                                  Cancelar
                                </button>
                                <button
                                  disabled={!checkoutModal.checkoutAdelantoAmt || parseFloat(checkoutModal.checkoutAdelantoAmt) <= 0}
                                  onClick={async () => {
                                    const res = checkoutModal.res!;
                                    const amt = parseFloat(checkoutModal.checkoutAdelantoAmt);
                                    if (!amt || amt <= 0) return;
                                    const now = new Date();
                                    const timeStr = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
                                    const desc = `Adelanto — ${res.guest_name}`;
                                    const { data: ins } = await supabase.from('transactions').insert({
                                      date:           checkoutModal.checkoutAdelantoDate,
                                      time:           timeStr,
                                      description:    desc,
                                      amount:         amt,
                                      type:           'ingreso',
                                      category:       'H01-HOSPEDAJE',
                                      caja:           checkoutModal.checkoutAdelantoCaja,
                                      room_id:        res.room_id,
                                      reservation_id: res.id,
                                      responsible_id: profile?.id ?? null,
                                    }).select('id').single();
                                    logActivity(profile?.id, profile?.name, 'Adelanto registrado', 'reservation', res.id,
                                      `${res.room_id} — ${res.guest_name} · Bs. ${amt.toFixed(2)} (${checkoutModal.checkoutAdelantoCaja})`);
                                    const newEntry = { id: (ins as any)?.id ?? `tmp-${Date.now()}`, amount: amt, date: checkoutModal.checkoutAdelantoDate, description: desc };
                                    const newPaid = checkoutModal.checkoutPaid + amt;
                                    const hospTotalNow = checkoutModal.checkoutNightPrices.reduce((s, p) => s + p, 0) + (checkoutModal.prevRoomInfo ? checkoutModal.prevRoomInfo.nights * checkoutModal.prevRoomInfo.price : 0);
                                    const newPending = Math.max(0, hospTotalNow - newPaid - (checkoutModal.prevRoomInfo?.paid ?? 0));
                                    setCheckoutModal(m => ({
                                      ...m,
                                      checkoutPaid:     newPaid,
                                      checkoutPaidList: [...m.checkoutPaidList, newEntry],
                                      checkoutAdelantoOpen: false,
                                      checkoutAdelantoAmt:  '',
                                      checkoutHospPayAmt: newPending > 0 ? newPending.toFixed(2) : '',
                                    }));
                                  }}
                                  className="flex-1 text-xs py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg font-semibold">
                                  ✓ Registrar
                                </button>
                              </div>
                            </div>
                          )}
                          {hospPending > 0 ? (
                            <>
                              <div className="flex justify-between font-bold text-red-600">
                                <span>Pendiente</span><span>Bs. {hospPending.toFixed(2)}</span>
                              </div>
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-gray-500">Forma de pago</span>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutHospSplit: !m.checkoutHospSplit, checkoutHospAmt_cash: '', checkoutHospAmt_qr: '', checkoutHospAmt_card: '' }))}
                                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${checkoutModal.checkoutHospSplit ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>
                                    {checkoutModal.checkoutHospSplit ? '✓ Pago mixto' : 'Pago mixto'}
                                  </button>
                                </div>
                                {checkoutModal.checkoutHospSplit ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 w-20 flex-shrink-0">Efectivo</span>
                                      <input type="number" min={0} step={0.5}
                                        value={checkoutModal.checkoutHospAmt_cash}
                                        onChange={e => setCheckoutModal(m => ({ ...m, checkoutHospAmt_cash: e.target.value }))}
                                        placeholder="0.00"
                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 w-20 flex-shrink-0">QR</span>
                                      <input type="number" min={0} step={0.5}
                                        value={checkoutModal.checkoutHospAmt_qr}
                                        onChange={e => setCheckoutModal(m => ({ ...m, checkoutHospAmt_qr: e.target.value }))}
                                        placeholder="0.00"
                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-500 w-20 flex-shrink-0">Tarjeta</span>
                                      <input type="number" min={0} step={0.5}
                                        value={checkoutModal.checkoutHospAmt_card}
                                        onChange={e => setCheckoutModal(m => ({ ...m, checkoutHospAmt_card: e.target.value }))}
                                        placeholder="0.00"
                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                                    </div>
                                    {(parseFloat(checkoutModal.checkoutHospAmt_cash)||0)+(parseFloat(checkoutModal.checkoutHospAmt_qr)||0)+(parseFloat(checkoutModal.checkoutHospAmt_card)||0) > 0 && (
                                      <p className="text-xs text-right text-gray-500">
                                        Total: <span className="font-bold text-gray-800">Bs. {((parseFloat(checkoutModal.checkoutHospAmt_cash)||0)+(parseFloat(checkoutModal.checkoutHospAmt_qr)||0)+(parseFloat(checkoutModal.checkoutHospAmt_card)||0)).toFixed(2)}</span>
                                      </p>
                                    )}
                                    <button onClick={checkoutPayHosp}
                                      className="w-full px-3 py-1.5 text-xs font-bold bg-green-500 hover:bg-green-400 text-white rounded-lg">
                                      💳 Registrar pago mixto
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <input type="number" min={0} step={0.5}
                                      value={checkoutModal.checkoutHospPayAmt}
                                      onChange={e => setCheckoutModal(m => ({ ...m, checkoutHospPayAmt: e.target.value }))}
                                      placeholder={`${hospPending.toFixed(2)}`}
                                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                                    <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                      <button type="button"
                                        onClick={() => setCheckoutModal(m => ({ ...m, checkoutHospPayCaja: 'CAJA MAYOR' }))}
                                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${checkoutModal.checkoutHospPayCaja === 'CAJA MAYOR' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        Efectivo
                                      </button>
                                      <button type="button"
                                        onClick={() => setCheckoutModal(m => ({ ...m, checkoutHospPayCaja: 'CUENTA BNB' }))}
                                        className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutHospPayCaja === 'CUENTA BNB' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        QR
                                      </button>
                                      <button type="button"
                                        onClick={() => setCheckoutModal(m => ({ ...m, checkoutHospPayCaja: 'TARJETA' }))}
                                        className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutHospPayCaja === 'TARJETA' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                        Tarjeta
                                      </button>
                                    </div>
                                    <button onClick={checkoutPayHosp}
                                      className="px-3 py-1.5 text-xs font-bold bg-green-500 hover:bg-green-400 text-white rounded-lg whitespace-nowrap flex-shrink-0">
                                      💳 Pagar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-center text-xs font-semibold text-green-700 pt-1">✓ Pagado completamente</div>
                          )}
                        </>}
                      </div>
                    </div>

                    {/* ── Early Check-in ── */}
                    {!!(r as any).early_checkin && (
                      <div className="bg-orange-50 rounded-xl overflow-hidden border border-orange-200">
                        <div className="px-4 py-2 bg-orange-100 text-xs font-bold uppercase tracking-wider text-orange-700 flex items-center justify-between">
                          <span>🌅 Early Check-in</span>
                          <button
                            onClick={async () => {
                              await supabase.from('reservations').update({
                                early_checkin: false, updated_at: new Date().toISOString(),
                              }).eq('id', r.id);
                              setPendingEarlyPrice(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                              fetchData();
                              setCheckoutModal(m => ({ ...m, open: false }));
                            }}
                            className="text-orange-400 hover:text-red-500 transition-colors"
                            title="Eliminar early check-in">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="px-4 py-3 space-y-1 text-sm">
                          {checkoutModal.checkoutEarlyPaid > 0 ? (
                            <div className="flex justify-between items-center text-green-700 font-semibold">
                              <span>✓ Ya registrado — Bs. {checkoutModal.checkoutEarlyPaid.toFixed(2)}</span>
                              <button onClick={checkoutAnularEarly}
                                className="text-[10px] font-normal text-red-400 hover:text-red-600 underline ml-2">
                                Anular
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-orange-600 mb-1">Sin cargo registrado — registrar ahora:</p>
                              <div className="flex gap-2 items-center">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutEarlyPayAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutEarlyPayAmt: e.target.value }))}
                                  placeholder="Monto Bs."
                                  className="flex-1 border border-orange-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutEarlyPayCaja: 'CAJA MAYOR' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${checkoutModal.checkoutEarlyPayCaja === 'CAJA MAYOR' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Efectivo
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutEarlyPayCaja: 'CUENTA BNB' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutEarlyPayCaja === 'CUENTA BNB' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    QR
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutEarlyPayCaja: 'TARJETA' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutEarlyPayCaja === 'TARJETA' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Tarjeta
                                  </button>
                                </div>
                                <button onClick={checkoutPayEarly}
                                  className="px-3 py-1.5 text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-lg whitespace-nowrap flex-shrink-0">
                                  💳 Pagar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Mascota ── */}
                    {!!(r as any).has_pet && (
                      <div className="bg-teal-50 rounded-xl overflow-hidden border border-teal-200">
                        <div className="px-4 py-2 bg-teal-100 text-xs font-bold uppercase tracking-wider text-teal-700 flex items-center justify-between">
                          <span>🐾 Mascota</span>
                          <button
                            onClick={async () => {
                              await supabase.from('reservations').update({
                                has_pet: false, updated_at: new Date().toISOString(),
                              }).eq('id', r.id);
                              setPendingMascotaPrice(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                              fetchData();
                              setCheckoutModal(m => ({ ...m, open: false }));
                            }}
                            className="text-teal-400 hover:text-red-500 transition-colors"
                            title="Quitar mascota">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="px-4 py-3 space-y-1 text-sm">
                          {checkoutModal.checkoutMascotaPaid > 0 ? (
                            <div className="flex justify-between items-center text-green-700 font-semibold">
                              <span>✓ Ya registrado — Bs. {checkoutModal.checkoutMascotaPaid.toFixed(2)}</span>
                              <button onClick={checkoutAnularMascota}
                                className="text-[10px] font-normal text-red-400 hover:text-red-600 underline ml-2">
                                Anular
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-teal-600 mb-1">Sin cargo registrado — registrar ahora:</p>
                              <div className="flex gap-2 items-center">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutMascotaPayAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutMascotaPayAmt: e.target.value }))}
                                  placeholder="Monto Bs."
                                  className="flex-1 border border-teal-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                                <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutMascotaPayCaja: 'CAJA MAYOR' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${checkoutModal.checkoutMascotaPayCaja === 'CAJA MAYOR' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Efectivo
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutMascotaPayCaja: 'CUENTA BNB' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutMascotaPayCaja === 'CUENTA BNB' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    QR
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutMascotaPayCaja: 'TARJETA' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutMascotaPayCaja === 'TARJETA' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Tarjeta
                                  </button>
                                </div>
                                <button onClick={checkoutPayMascota}
                                  className="px-3 py-1.5 text-xs font-bold bg-teal-500 hover:bg-teal-400 text-white rounded-lg whitespace-nowrap flex-shrink-0">
                                  💳 Pagar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Desayuno extra ── */}
                    {(checkoutModal.checkoutDesayunoPaid > 0 || checkoutModal.checkoutDesayunoPayAmt) && (
                      <div className="bg-yellow-50 rounded-xl overflow-hidden border border-yellow-200">
                        <div className="px-4 py-2 bg-yellow-100 text-xs font-bold uppercase tracking-wider text-yellow-800 flex items-center justify-between">
                          <span>🍳 Desayuno extra</span>
                        </div>
                        <div className="px-4 py-3 space-y-1 text-sm">
                          {checkoutModal.checkoutDesayunoPaid > 0 ? (
                            <div className="flex justify-between items-center text-green-700 font-semibold">
                              <span>✓ Ya registrado — Bs. {checkoutModal.checkoutDesayunoPaid.toFixed(2)}</span>
                              <button onClick={checkoutAnularDesayuno}
                                className="text-[10px] font-normal text-red-400 hover:text-red-600 underline ml-2">
                                Anular
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-xs text-yellow-700 mb-1">Sin cargo registrado — registrar ahora:</p>
                              <div className="flex gap-2 items-center">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutDesayunoPayAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutDesayunoPayAmt: e.target.value }))}
                                  placeholder="Monto Bs."
                                  className="flex-1 border border-yellow-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                                <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutDesayunoPayCaja: 'CAJA MAYOR' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${checkoutModal.checkoutDesayunoPayCaja === 'CAJA MAYOR' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Efectivo
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutDesayunoPayCaja: 'CUENTA BNB' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutDesayunoPayCaja === 'CUENTA BNB' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    QR
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutDesayunoPayCaja: 'TARJETA' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutDesayunoPayCaja === 'TARJETA' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Tarjeta
                                  </button>
                                </div>
                                <button onClick={checkoutPayDesayuno}
                                  className="px-3 py-1.5 text-xs font-bold bg-yellow-500 hover:bg-yellow-400 text-white rounded-lg whitespace-nowrap flex-shrink-0">
                                  💳 Pagar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Late Checkout ── */}
                    {hasLate && (
                      <div className="bg-purple-50 rounded-xl overflow-hidden border border-purple-200">
                        <div className="px-4 py-2 bg-purple-100 text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center justify-between">
                          <span>🌙 Late Checkout</span>
                          <button
                            onClick={async () => {
                              await supabase.from('reservations').update({
                                late_checkout: false, updated_at: new Date().toISOString(),
                              }).eq('id', r.id);
                              setPendingLatePrice(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                              // Update snapshot so cancel doesn't re-add it
                              if (checkoutOriginalRef.current) checkoutOriginalRef.current = { ...checkoutOriginalRef.current };
                              fetchData();
                              setCheckoutModal(m => ({ ...m, open: false }));
                            }}
                            className="text-purple-400 hover:text-red-500 transition-colors"
                            title="Eliminar late checkout">
                            <Trash2 size={13} />
                          </button>
                        </div>
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
                              <div className="flex gap-2 items-center">
                                <input type="number" min={0} step={0.5}
                                  value={checkoutModal.checkoutLatePayAmt}
                                  onChange={e => setCheckoutModal(m => ({ ...m, checkoutLatePayAmt: e.target.value }))}
                                  placeholder="Monto Bs."
                                  className="flex-1 border border-purple-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                                <div className="flex rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutLatePayCaja: 'CAJA MAYOR' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold transition-colors ${checkoutModal.checkoutLatePayCaja === 'CAJA MAYOR' ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Efectivo
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutLatePayCaja: 'CUENTA BNB' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutLatePayCaja === 'CUENTA BNB' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    QR
                                  </button>
                                  <button type="button"
                                    onClick={() => setCheckoutModal(m => ({ ...m, checkoutLatePayCaja: 'TARJETA' }))}
                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 transition-colors ${checkoutModal.checkoutLatePayCaja === 'TARJETA' ? 'bg-purple-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    Tarjeta
                                  </button>
                                </div>
                                <button onClick={checkoutPayLate}
                                  className="px-3 py-1.5 text-xs font-bold bg-purple-500 hover:bg-purple-400 text-white rounded-lg whitespace-nowrap flex-shrink-0">
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
                          {vitItems.map(item => {
                            const vitCaja = item.caja || 'CAJA MAYOR';
                            return (
                            <div key={item.productId} className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex-1 text-sm text-gray-700 min-w-0">{item.productName}{item.qty > 1 ? ` x${item.qty}` : ''}</span>
                                <span className="text-sm font-semibold text-amber-700 flex-shrink-0">Bs. {item.total.toFixed(2)}</span>
                                <button onClick={() => checkoutPayVitrinaItem(item)}
                                  className="px-2 py-1 text-[10px] font-bold bg-amber-500 hover:bg-amber-400 text-white rounded-lg flex-shrink-0">
                                  💳 Pagar
                                </button>
                                <button
                                  onClick={() => setPendingVitrina(prev => ({ ...prev, [r.id]: (prev[r.id] ?? []).filter(i => i.productId !== item.productId) }))}
                                  className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
                                  title="Eliminar">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <div className="flex gap-1">
                                {(['CAJA MAYOR', 'CUENTA BNB', 'TARJETA'] as const).map(c => (
                                  <button key={c}
                                    onClick={() => setPendingVitrina(prev => ({
                                      ...prev,
                                      [r.id]: (prev[r.id] ?? []).map(i => i.productId === item.productId ? { ...i, caja: c } : i)
                                    }))}
                                    className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-colors ${
                                      vitCaja === c
                                        ? c === 'CAJA MAYOR' ? 'bg-green-500 text-white'
                                          : c === 'CUENTA BNB' ? 'bg-blue-500 text-white'
                                          : 'bg-purple-500 text-white'
                                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                    }`}>
                                    {c === 'CAJA MAYOR' ? 'Efectivo' : c === 'CUENTA BNB' ? 'QR' : 'Tarjeta'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            );
                          })}
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
                                <span className="text-xs text-gray-400 ml-1">({item.caja === 'CUENTA BNB' ? 'QR' : item.caja === 'TARJETA' ? 'Tarjeta' : 'Efectivo'})</span>
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
              <button onClick={cancelCheckout}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg transition-colors">
                Cancelar
              </button>
              <button onClick={saveCheckoutFields}
                className="px-5 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white rounded-lg transition-colors">
                💾 Guardar cambios
              </button>
              <button onClick={handleCheckout}
                className="px-6 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg transition-colors">
                ✓ Check out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note tooltip (Excel-style, fixed positioned) ── */}
      {noteTooltip && (
        <div
          className="fixed z-[600] pointer-events-none"
          style={{ top: noteTooltip.y, left: noteTooltip.x }}
        >
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-xl px-3 py-2 max-w-[240px]">
            <div className="text-[10px] font-bold text-yellow-700 mb-1 uppercase tracking-wide">📝 Nota</div>
            <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{noteTooltip.notes}</p>
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
              <button onClick={() => {
                const now = new Date();
                const d = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
                const t = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
                setAdelantoModal({ res: cardMenu.res, amount: '', date: d, time: t, caja: 'CAJA MAYOR' });
                setCardMenu(null);
              }} className="w-full text-left px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
                💵 Adelanto
              </button>
              <button onClick={() => { setEarlyCheckinModal({ res: cardMenu.res, time: '', extra_price: '', caja: 'CAJA MAYOR' }); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50">
                🌅 Early Check-in
              </button>
              <button onClick={() => { setMascotaModal({ res: cardMenu.res, extra_price: '', caja: 'CAJA MAYOR' }); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-teal-600 hover:bg-teal-50">
                🐾 Mascota
              </button>
              <button onClick={() => { setDesayunoModal({ res: cardMenu.res, qty: 1, caja: 'CAJA MAYOR' }); setCardMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm font-semibold text-yellow-700 hover:bg-yellow-50">
                🍳 Desayuno extra
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
            {cardMenu.res.status === 'reserva' && (<>
              <button onClick={() => {
                const now = new Date();
                const d = now.toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
                const t = now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
                setAdelantoModal({ res: cardMenu.res, amount: '', date: d, time: t, caja: 'CAJA MAYOR' });
                setCardMenu(null);
              }} className="w-full text-left px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">
                💵 Adelanto
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
            {cardMenu.res.status !== 'ocupado' && (
              <button onClick={e => { setCardMenu(null); handleDeleteRes(e as any, cardMenu.res.id); }}
                className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50">
                🗑 Borrar
              </button>
            )}
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
            <button onClick={() => {
              const date = toDateStr(new Date(year, month, quickMenu.day));
              const next = toDateStr(new Date(year, month, quickMenu.day + 1));
              setMultiRoomModal({ checkIn: date, checkOut: next, guestName: '', numGuests: 1, pricePerNight: '', selectedRooms: new Set([quickMenu.roomId]), saving: false, error: '' });
              setQuickMenu(null);
            }} className="w-full text-left px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">
              🏨 Reserva varias habitaciones
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
            <div className="px-6 py-5 space-y-2">
              <textarea
                autoFocus
                value={quickNotaModal.text}
                onChange={e => { setQuickNotaError(''); setQuickNotaModal(n => n ? { ...n, text: e.target.value } : n); }}
                rows={3}
                placeholder="Escribe una nota para este día..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              {quickNotaError && <p className="text-red-500 text-xs">{quickNotaError}</p>}
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
          onConfirm={async (items: VitrinaCartItem[]) => {
            const res = vitrinaSaleRes!;
            const existing = pendingVitrina[res.id] ?? [];
            const merged = [...existing];
            for (const item of items) {
              const idx = merged.findIndex(m => m.productId === item.product.id);
              if (idx >= 0) {
                merged[idx] = { ...merged[idx], qty: merged[idx].qty + item.qty, total: merged[idx].total + item.total };
              } else {
                merged.push({ productId: item.product.id, productName: item.product.name, price: item.product.price, qty: item.qty, total: item.total, caja: item.caja });
              }
            }
            setPendingVitrina(prev => ({ ...prev, [res.id]: merged }));
            // Persist cart to DB so other users (other browsers/sessions) see it
            await supabase.from('reservations').update({ vitrina_cart: merged, updated_at: new Date().toISOString() }).eq('id', res.id);
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
              /* ── Step 1: pick move date + new room ── */
              <div className="px-6 py-5 space-y-4">
                {/* Move date picker */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">¿Desde cuándo cambia de habitación?</p>
                  <p className="text-[11px] text-blue-600">
                    Estancia: <span className="font-semibold">{roomChangeModal.res.check_in} → {roomChangeModal.res.check_out}</span>
                  </p>
                  <DatePicker
                    value={roomChangeModal.moveDate}
                    accentClass="border-blue-400 ring-blue-100"
                    useFixed
                    onChange={async v => {
                      if (!v) return;
                      setRoomChangeModal(m => m ? { ...m, moveDate: v, newRoomId: '' } : m);
                      await loadRoomsForMove(roomChangeModal.res, v);
                    }}
                  />
                  {(() => {
                    const ciMs  = new Date(roomChangeModal.res.check_in  + 'T00:00:00').getTime();
                    const coMs  = new Date(roomChangeModal.res.check_out + 'T00:00:00').getTime();
                    const mvMs  = new Date(roomChangeModal.moveDate       + 'T00:00:00').getTime();
                    const nightsOrig = Math.max(0, Math.round((mvMs - ciMs) / 86400000));
                    const nightsNew  = Math.max(0, Math.round((coMs - mvMs) / 86400000));
                    return (
                      <div className="flex gap-4 text-xs pt-1">
                        <span className="text-gray-600">🏠 <span className="font-semibold">{roomChangeModal.res.room_id}</span>: {nightsOrig} noche{nightsOrig !== 1 ? 's' : ''}</span>
                        <span className="text-blue-600">🔄 Nueva hab.: {nightsNew} noche{nightsNew !== 1 ? 's' : ''}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Available rooms */}
                {roomChangeModal.loading ? (
                  <div className="flex items-center justify-center h-24">
                    <div className="w-6 h-6 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : roomChangeModal.availableRooms.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No hay habitaciones disponibles desde esa fecha.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
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
                  <button onClick={() => { setRoomChangeError(''); setRoomChangeModal(m => m ? { ...m, step: 'room' } : m); }}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                    ← Atrás
                  </button>
                  <button
                    disabled={roomChangeSaving || !roomChangeModal.reason || (roomChangeModal.reason === 'damaged' && !roomChangeModal.description.trim())}
                    onClick={handleRoomChange}
                    className="px-5 py-2 text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white rounded-lg disabled:opacity-40 flex items-center gap-2">
                    {roomChangeSaving
                      ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Guardando...</>
                      : '✓ Confirmar cambio'}
                  </button>
                </div>
                {roomChangeError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                    ⚠️ {roomChangeError}
                  </p>
                )}
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
                            <button
                              onClick={() => setPendingVitrina(prev => ({ ...prev, [row.res.id]: (prev[row.res.id] ?? []).map(i => i.productId === item.productId ? { ...i, caja: 'TARJETA' } : i) }))}
                              className={`flex-1 text-[9px] font-semibold py-0.5 rounded transition-colors ${item.caja === 'TARJETA' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>
                              Tarjeta
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
                            onClick={() => setPagoForm(f => f ? { ...f, split: !f.split, amount_qr: '', amount_cash: '', amount_tarjeta: '' } : f)}
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full border transition-colors ${pagoForm.split ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
                          >
                            {pagoForm.split ? '✓ Pago mixto' : 'Pago mixto'}
                          </button>
                        </div>

                        {pagoForm.split ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-20 flex-shrink-0">Efectivo</span>
                              <input
                                type="number" min={0} step={0.5}
                                value={pagoForm.amount_cash}
                                onChange={e => setPagoForm(f => f ? { ...f, amount_cash: e.target.value } : f)}
                                placeholder="0.00"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-20 flex-shrink-0">QR</span>
                              <input
                                type="number" min={0} step={0.5}
                                value={pagoForm.amount_qr}
                                onChange={e => setPagoForm(f => f ? { ...f, amount_qr: e.target.value } : f)}
                                placeholder="0.00"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-20 flex-shrink-0">Tarjeta</span>
                              <input
                                type="number" min={0} step={0.5}
                                value={pagoForm.amount_tarjeta}
                                onChange={e => setPagoForm(f => f ? { ...f, amount_tarjeta: e.target.value } : f)}
                                placeholder="0.00"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                              />
                            </div>
                            {(parseFloat(pagoForm.amount_cash) || 0) + (parseFloat(pagoForm.amount_qr) || 0) + (parseFloat(pagoForm.amount_tarjeta) || 0) > 0 && (
                              <p className="text-xs text-gray-500 text-right">
                                Total: <span className="font-bold text-gray-800">Bs. {((parseFloat(pagoForm.amount_cash) || 0) + (parseFloat(pagoForm.amount_qr) || 0) + (parseFloat(pagoForm.amount_tarjeta) || 0)).toFixed(2)}</span>
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
                                { value: 'TARJETA',    label: 'TARJETA' },
                              ]}
                              placeholder="Caja"
                            />
                          </div>
                        )}

                        {liveTotal > 0 && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                            🛒 Se agregarán Bs. {liveTotal.toFixed(2)} de vitrina (caja según cada ítem)
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
                        onClick={() => setPagoForm({ resId: row.res.id, amount: (row.pending + liveTotal).toFixed(2), caja: 'CAJA MAYOR', split: false, amount_qr: '', amount_cash: '', amount_tarjeta: '' })}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto a cobrar (Bs.)</label>
                <input
                  type="number" min={0} step={0.5}
                  value={lateCheckoutModal.extra_price}
                  onChange={e => setLateCheckoutModal(m => m ? { ...m, extra_price: e.target.value } : m)}
                  placeholder="0.00"
                  className="w-full border border-purple-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 text-xs text-purple-600">
                💡 El pago se registra desde el popup de <strong>Check out</strong>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setLateCheckoutModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const r = lateCheckoutModal.res;
                  await supabase.from('reservations').update({
                    late_checkout: true,
                    departure_time: lateCheckoutModal.time || null,
                    updated_at: new Date().toISOString(),
                  }).eq('id', r.id);
                  if (lateCheckoutModal.extra_price) {
                    setPendingLatePrice(prev => ({ ...prev, [r.id]: lateCheckoutModal.extra_price }));
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

      {/* ── Early Check-in popup ── */}
      {earlyCheckinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-orange-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">🌅 Early Check-in</h3>
                <p className="text-xs text-orange-700 font-semibold mt-0.5">
                  {earlyCheckinModal.res.room_id} — {earlyCheckinModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setEarlyCheckinModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hora de llegada</label>
                <TimePicker
                  value={earlyCheckinModal.time}
                  onChange={v => setEarlyCheckinModal(m => m ? { ...m, time: v } : m)}
                  placeholder="-- : --" emoji="🕐"
                  accentClass="border-orange-400 ring-orange-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto a cobrar (Bs.)</label>
                <input
                  type="number" min={0} step={0.5}
                  value={earlyCheckinModal.extra_price}
                  onChange={e => setEarlyCheckinModal(m => m ? { ...m, extra_price: e.target.value } : m)}
                  placeholder="0.00"
                  className="w-full border border-orange-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 text-xs text-orange-600">
                💡 El pago se registra desde el popup de <strong>Check out</strong>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEarlyCheckinModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const r = earlyCheckinModal.res;
                  await supabase.from('reservations').update({
                    early_checkin: true,
                    arrival_time: earlyCheckinModal.time || null,
                    updated_at: new Date().toISOString(),
                  }).eq('id', r.id);
                  if (earlyCheckinModal.extra_price) {
                    setPendingEarlyPrice(prev => ({ ...prev, [r.id]: earlyCheckinModal.extra_price }));
                  }
                  logActivity(profile?.id, profile?.name, 'Reserva editada', 'reservation', r.id, `Early check-in ${r.room_id} — ${r.guest_name}`);
                  setEarlyCheckinModal(null);
                  fetchData();
                }}
                className="px-5 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-400 text-white rounded-lg">
                ✓ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mascota popup ── */}
      {mascotaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-teal-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">🐾 Mascota</h3>
                <p className="text-xs text-teal-700 font-semibold mt-0.5">
                  {mascotaModal.res.room_id} — {mascotaModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setMascotaModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Monto a cobrar (Bs.)</label>
                <input
                  type="number" min={0} step={0.5}
                  value={mascotaModal.extra_price}
                  onChange={e => setMascotaModal(m => m ? { ...m, extra_price: e.target.value } : m)}
                  placeholder="0.00"
                  className="w-full border border-teal-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  autoFocus
                />
              </div>
              <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 text-xs text-teal-600">
                💡 El pago se registra desde el popup de <strong>Check out</strong>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setMascotaModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const r = mascotaModal.res;
                  await supabase.from('reservations').update({
                    has_pet: true,
                    updated_at: new Date().toISOString(),
                  }).eq('id', r.id);
                  if (mascotaModal.extra_price) {
                    setPendingMascotaPrice(prev => ({ ...prev, [r.id]: mascotaModal.extra_price }));
                  }
                  logActivity(profile?.id, profile?.name, 'Reserva editada', 'reservation', r.id, `Mascota ${r.room_id} — ${r.guest_name}`);
                  setMascotaModal(null);
                  fetchData();
                }}
                className="px-5 py-2 text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white rounded-lg">
                ✓ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Adelanto modal ── */}
      {adelantoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-green-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">💵 Adelanto</h3>
                <p className="text-xs text-green-700 font-semibold mt-0.5">
                  {adelantoModal.res.room_id} — {adelantoModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setAdelantoModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Monto */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Monto (Bs.)</label>
                <input
                  type="number" min={0} step={0.5}
                  value={adelantoModal.amount}
                  onChange={e => setAdelantoModal(m => m ? { ...m, amount: e.target.value } : m)}
                  placeholder="0.00"
                  className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  autoFocus
                />
              </div>
              {/* Fecha */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha del pago</label>
                <DatePicker
                  value={adelantoModal.date}
                  onChange={d => setAdelantoModal(m => m ? { ...m, date: d } : m)}
                  useFixed
                />
              </div>
              {/* Caja */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Caja</label>
                <CustomSelect
                  value={adelantoModal.caja}
                  onChange={v => setAdelantoModal(m => m ? { ...m, caja: v } : m)}
                  options={[
                    { value: 'CAJA MAYOR', label: 'Efectivo' },
                    { value: 'CUENTA BNB', label: 'QR' },
                    { value: 'TARJETA',    label: 'Tarjeta' },
                    { value: 'CAJA CHICA', label: 'Caja Chica' },
                  ]}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setAdelantoModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const amt = parseFloat(adelantoModal.amount || '0');
                  if (!amt || amt <= 0) return;
                  const r = adelantoModal.res;
                  const now = new Date();
                  const timeStr = adelantoModal.time || now.toLocaleTimeString('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false });
                  await supabase.from('transactions').insert({
                    date:           adelantoModal.date,
                    time:           timeStr,
                    description:    `Adelanto — ${r.guest_name}`,
                    amount:         amt,
                    type:           'ingreso',
                    category:       'H01-HOSPEDAJE',
                    caja:           adelantoModal.caja,
                    room_id:        r.room_id,
                    reservation_id: r.id,
                    responsible_id: profile?.id ?? null,
                  });
                  logActivity(profile?.id, profile?.name, 'Adelanto registrado', 'reservation', r.id,
                    `${r.room_id} — ${r.guest_name} · Bs. ${amt.toFixed(2)} (${adelantoModal.caja})`);
                  setAdelantoModal(null);
                }}
                disabled={!adelantoModal.amount || parseFloat(adelantoModal.amount) <= 0}
                className="px-5 py-2 text-sm font-semibold bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg">
                ✓ Registrar adelanto
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
              { label: '📅 Reserva',                     action: () => openNew(quickMenu.roomId, quickMenu.day, 'reserva', 'reserva') },
              { label: '🏨 Reserva varias habitaciones', action: () => { const date = toDateStr(new Date(year, month, quickMenu.day)); const next = toDateStr(new Date(year, month, quickMenu.day + 1)); setMultiRoomModal({ checkIn: date, checkOut: next, guestName: '', numGuests: 1, pricePerNight: '', selectedRooms: new Set([quickMenu.roomId]), saving: false, error: '' }); setQuickMenu(null); } },
              { label: '✅ Check-in directo',             action: () => openNew(quickMenu.roomId, quickMenu.day, 'ocupado', 'directo') },
              { label: '🔧 Mantenimiento',               action: () => { setMaintenanceForm({ roomId: quickMenu.roomId, day: quickMenu.day, detail: '', endDate: toDateStr(new Date(year, month, quickMenu.day + 1)) }); setQuickMenu(null); } },
              { label: '🧹 Habilitación',                action: () => quickCreateStatus(quickMenu.roomId, quickMenu.day, 'habilitacion', 'Habilitación') },
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
            <div className="px-6 py-5 space-y-2">
              <textarea
                rows={4}
                value={notaModal.text}
                onChange={e => { setNotaError(''); setNotaModal(m => m ? { ...m, text: e.target.value } : m); }}
                placeholder="Escribe una nota para este día..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                autoFocus
              />
              {notaError && <p className="text-red-500 text-xs">{notaError}</p>}
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

      {/* ── Desayuno extra popup ── */}
      {desayunoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-yellow-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">🍳 Desayuno extra</h3>
                <p className="text-xs text-yellow-700 font-semibold mt-0.5">
                  {desayunoModal.res.room_id} — {desayunoModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setDesayunoModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-yellow-50 rounded-xl px-4 py-3 text-sm text-yellow-800">
                Precio por desayuno: <span className="font-bold">Bs. {DESAYUNO_PRICE}</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cantidad de desayunos</label>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setDesayunoModal(m => m ? { ...m, qty: Math.max(1, m.qty - 1) } : m)}
                    className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-bold">
                    <Minus size={16} />
                  </button>
                  <span className="text-2xl font-bold text-gray-900 w-8 text-center">{desayunoModal.qty}</span>
                  <button type="button"
                    onClick={() => setDesayunoModal(m => m ? { ...m, qty: m.qty + 1 } : m)}
                    className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-lg font-bold">
                    <Plus size={16} />
                  </button>
                  <span className="ml-2 text-sm font-semibold text-gray-500">
                    = <span className="text-yellow-700 font-bold text-base">Bs. {(desayunoModal.qty * DESAYUNO_PRICE).toFixed(2)}</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setDesayunoModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const r = desayunoModal.res;
                  const total = desayunoModal.qty * DESAYUNO_PRICE;
                  setPendingDesayunoAmt(prev => ({ ...prev, [r.id]: total.toFixed(2) }));
                  await supabase.from('reservations').update({ desayuno_pending: total, updated_at: new Date().toISOString() }).eq('id', r.id);
                  setDesayunoModal(null);
                }}
                className="px-5 py-2 text-sm font-semibold bg-yellow-500 hover:bg-yellow-400 text-white rounded-lg">
                ✓ Agregar al checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Multi-room reservation modal ── */}
      {multiRoomModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-amber-50 rounded-t-2xl flex-shrink-0">
              <div>
                <h3 className="font-bold text-gray-900">🏨 Reserva varias habitaciones</h3>
                <p className="text-xs text-amber-700 font-semibold mt-0.5">Una reserva bajo el mismo nombre</p>
              </div>
              <button onClick={() => setMultiRoomModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              {/* Guest name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nombre de la reserva *</label>
                <input
                  type="text"
                  value={multiRoomModal.guestName}
                  onChange={e => setMultiRoomModal(m => m ? { ...m, guestName: e.target.value } : m)}
                  placeholder="Ej: Empresa XYZ / Juan Pérez"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Check-in *</label>
                  <DatePicker value={multiRoomModal.checkIn} accentClass="border-amber-400 ring-amber-100" useFixed
                    onChange={v => setMultiRoomModal(m => m ? { ...m, checkIn: v } : m)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Check-out *</label>
                  <DatePicker value={multiRoomModal.checkOut} accentClass="border-amber-400 ring-amber-100" useFixed
                    onChange={v => setMultiRoomModal(m => m ? { ...m, checkOut: v } : m)} />
                </div>
              </div>

              {/* Guests + Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Huéspedes por hab.</label>
                  <input type="number" min={1} value={multiRoomModal.numGuests}
                    onChange={e => setMultiRoomModal(m => m ? { ...m, numGuests: parseInt(e.target.value) || 1 } : m)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Precio/noche (Bs.)</label>
                  <input type="number" min={0} step={0.01} value={multiRoomModal.pricePerNight}
                    onChange={e => setMultiRoomModal(m => m ? { ...m, pricePerNight: e.target.value } : m)}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </div>
              </div>

              {/* Room selector */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Habitaciones <span className="text-amber-600 font-bold">({multiRoomModal.selectedRooms.size} seleccionada{multiRoomModal.selectedRooms.size !== 1 ? 's' : ''})</span>
                </label>
                <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                  {rooms.filter(r => r.id !== 'SALON').map(r => {
                    const checked = multiRoomModal.selectedRooms.has(r.id);
                    return (
                      <button key={r.id} type="button"
                        onClick={() => setMultiRoomModal(m => {
                          if (!m) return m;
                          const next = new Set(m.selectedRooms);
                          if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                          return { ...m, selectedRooms: next };
                        })}
                        className={`text-left px-3 py-2 rounded-xl border-2 transition-all text-xs ${
                          checked ? 'border-amber-500 bg-amber-50 font-bold text-amber-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}>
                        <div className="font-semibold">{r.id}</div>
                        <div className="text-[10px] opacity-70 truncate">{r.type}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {multiRoomModal.error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠️ {multiRoomModal.error}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setMultiRoomModal(null)}
                className="flex-1 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                disabled={multiRoomModal.saving || multiRoomModal.selectedRooms.size === 0}
                onClick={handleSaveMultiRoom}
                className="flex-1 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-white rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
                {multiRoomModal.saving
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                  : `✓ Reservar ${multiRoomModal.selectedRooms.size} hab.`}
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
