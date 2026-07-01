import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Building2, Trash2, Receipt, PlayCircle, MoreHorizontal, CheckSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Reservation, ReservationStatus, Room } from '../types';
import { STATUS_CONFIG, MONTH_NAMES, DAY_NAMES } from '../constants';
import DatePicker from '../components/DatePicker';
import TimePicker from '../components/TimePicker';
import CustomSelect from '../components/CustomSelect';

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
  if (roomType.includes('S/M/F')) return ['Simple', 'Matrimonial', 'Familiar'];
  if (roomType.includes('DOBLE/FAM')) return ['Doble', 'Familiar'];
  if (roomType.includes('S/M')) return ['Simple', 'Matrimonial'];
  return [];
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
  marital_status: '' | 'S' | 'C' | 'D' | 'V';
  country:        string;
  document:       string;
  profession:     string;
  purpose:        string;
  origin:         string;
  next_dest:      string;
  transport:      '' | 'T' | 'A' | 'B';
}

const emptyAdditionalGuest = (): AdditionalGuest => ({
  name: '', phone: '', gender: '', birthdate: '', marital_status: '',
  country: 'Boliviana', document: '', profession: '', purpose: '',
  origin: '', next_dest: '', transport: '',
});

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
  adelanto:          '',
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
  guest_marital_status: '' as '' | 'S' | 'C' | 'D' | 'V',
  guest_phone:          '',
  guest_country:        'Boliviana',
  guest_document:       '',
  guest_profession:     '',
  guest_purpose:        '',
  guest_origin:         '',
  guest_next_dest:      '',
  guest_transport:      '' as '' | 'T' | 'A' | 'B',
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
  });

  // Additional guests for confirm arrival modal
  const [confirmAdditionalGuests, setConfirmAdditionalGuests] = useState<AdditionalGuest[]>([]);

  // Custom confirm dialog (replaces browser confirm())
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; body: string; onConfirm: () => void;
  }>({ open: false, title: '', body: '', onConfirm: () => {} });

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
      if (prev.length < needed) return [...prev, ...Array(needed - prev.length).fill(null).map(emptyAdditionalGuest)];
      return prev.slice(0, needed);
    });
  }, [form.num_guests, modalOpen]); // eslint-disable-line

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
  function openNew(roomId: string, day: number) {
    const date = toDateStr(new Date(year, month, day));
    const next = toDateStr(new Date(year, month, day + 1));
    setForm({ ...emptyForm, room_id: roomId, check_in: date, check_out: next });
    setAdditionalGuests([]);
    setEditingId(null);
    setFormError('');
    setModalOpen(true);
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
      adelanto:          (r.adelanto?.toString() ?? ''),
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
    setAdditionalGuests((r.additional_guests ?? []) as AdditionalGuest[]);
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
      guest_name:      resolvedName,
      num_guests:      form.num_guests,
      check_in:        form.check_in,
      check_out:       isSalon ? form.check_in : form.check_out,
      status:          form.status,
      room_subtype:    !isSalon && form.room_subtype ? form.room_subtype : null,
      arrival_time:    !isSalon && form.arrival_time   ? form.arrival_time   : null,
      departure_time:  !isSalon && form.departure_time ? form.departure_time : null,
      late_checkout:   !isSalon ? form.late_checkout  : false,
      is_blacklist:    !isSalon ? form.is_blacklist    : false,
      is_empresa:      isSalon ? false : form.is_empresa,
      has_pet:         isSalon ? false : form.has_pet,
      wants_invoice:   form.wants_invoice,
      price_per_night: form.price_per_night ? parseFloat(form.price_per_night) : null,
      adelanto:        form.adelanto ? parseFloat(form.adelanto) : null,
      notes:           form.notes || null,
      start_time:      isSalon && form.start_time ? form.start_time : null,
      end_time:        isSalon && form.end_time   ? form.end_time   : null,
      catering:        isSalon ? (cateringParts.join(',') || null) : null,
      // Empresa
      empresa_name:         !isSalon && form.is_empresa ? (form.empresa_name || null) : null,
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
      additional_guests:    !isSalon ? additionalGuests : [],
      created_by:      profile?.id ?? null,
      updated_at:      new Date().toISOString(),
    };

    const { error } = editingId
      ? await supabase.from('reservations').update(payload).eq('id', editingId)
      : await supabase.from('reservations').insert(payload);

    setSaving(false);
    if (error) { setFormError('Error al guardar: ' + error.message); return; }
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
        await supabase.from('reservations').delete().eq('id', id);
        setModalOpen(false);
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
    setConfirmModal(m => ({ ...m, open: false }));
    setConfirmAdditionalGuests([]);
    fetchData();
  }

  // ── open checkout modal ──
  function openCheckoutModal(e: React.MouseEvent, res: Reservation) {
    e.stopPropagation();
    setMenuOpenId(null);
    setCheckoutModal({
      open: true, res,
      departure_time: (res as any).departure_time ?? '',
    });
  }

  async function handleCheckout() {
    if (!checkoutModal.res) return;
    const res = checkoutModal.res;

    await supabase.from('reservations').update({
      departure_time: checkoutModal.departure_time || null,
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

    setCheckoutModal(m => ({ ...m, open: false }));
    fetchData();
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
                      className={`text-center border-b-2 border-r border-gray-200 px-2 py-2.5 w-[116px] min-w-[116px] ${
                        isToday ? 'bg-amber-50 border-b-amber-300' : isWeekend ? 'bg-gray-100 border-b-gray-300' : 'bg-gray-50 border-b-gray-300'
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
                  <td className="sticky left-0 z-10 bg-inherit border-r-2 border-b border-gray-300 px-4 py-2 w-32">
                    <div className="font-bold text-sm text-gray-900">{room.id}</div>
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

                    // Short name for middle cells
                    const shortName = res
                      ? (res.guest_name.split(' ')[0] ?? res.guest_name)
                      : '';

                    // Arrival / departure times
                    const arrivalTime   = (res as any)?.arrival_time   ? (res as any).arrival_time.slice(0,5)   : null;
                    const departureTime = (res as any)?.departure_time ? (res as any).departure_time.slice(0,5) : null;

                    return (
                      <td
                        key={d}
                        className="border-r border-b border-gray-200 p-1 h-16 align-top"
                      >
                        {res ? (
                          <div className={`relative w-full h-full group ${selectMode && selectedType && selectedType !== res.status ? 'opacity-30' : ''}`}>
                          <button
                            onClick={() => selectMode ? toggleCellSelect(res) : openEdit(res)}
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
                            {isCheckIn ? (
                              /* ── First day: full name + flags + arrival time ── */
                              <>
                                <div className="text-xs font-bold truncate leading-tight">
                                  {res.guest_name}
                                </div>
                                <div className="flex items-center gap-1 mt-1 flex-wrap">
                                  <span className="text-[10px] opacity-80 font-semibold">{res.num_guests}p</span>
                                  {res.is_empresa    && <Building2 size={9} className="opacity-80" />}
                                  {res.has_pet       && <span className="text-[10px] opacity-80">🐾</span>}
                                  {res.wants_invoice && <span className="text-[10px] opacity-80">🧾</span>}
                                  {(res as any).is_blacklist && <span className="text-[10px]">🚫</span>}
                                  {arrivalTime && <span className="text-[10px] opacity-90 ml-auto font-bold">⬇ {arrivalTime}</span>}
                                </div>
                              </>
                            ) : isCheckOut ? (
                              /* ── Last day: short name + departure time ── */
                              <>
                                <div className="text-xs font-bold truncate leading-tight opacity-80">
                                  {shortName}
                                </div>
                                {departureTime && (
                                  <div className="mt-1">
                                    <span className="inline-flex items-center gap-0.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                      ⬆ {departureTime}
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : (
                              /* ── Middle days: short name ── */
                              <div className="flex items-end h-full pb-0.5">
                                <span className="text-xs font-semibold opacity-70 truncate">{shortName}</span>
                              </div>
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

                          {/* ── PlayCircle action menu (check-in day) ── */}
                          {!selectMode && isCheckIn && (
                            <div className="absolute top-0.5 right-0.5 z-10" onClick={e => e.stopPropagation()}>
                              <button
                                onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === res.id ? null : res.id); }}
                                title="Acciones"
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center"
                              >
                                <PlayCircle size={16} className="text-white/80 hover:text-white drop-shadow" />
                              </button>
                              {menuOpenId === res.id && (
                                <div className="absolute right-0 bottom-full mb-1 bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-48 z-[100]">
                                  {res.status === 'reserva' && (
                                    <button
                                      onClick={async e => {
                                        e.stopPropagation();
                                        setMenuOpenId(null);
                                        if (res.room_id === 'SALON') {
                                          // SALON: confirm directly, no popup
                                          await supabase.from('reservations').update({ status: 'ocupado', updated_at: new Date().toISOString() }).eq('id', res.id);
                                          fetchData();
                                        } else {
                                          openConfirmModal(e, res);
                                        }
                                      }}
                                      className="w-full text-left px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-50 flex items-center gap-2">
                                      ✓ Confirmar llegada
                                    </button>
                                  )}
                                  {res.status === 'ocupado' && (
                                    <button onClick={e => openCheckoutModal(e, res)}
                                      className="w-full text-left px-4 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-50 flex items-center gap-2">
                                      ⬆ Registrar salida
                                    </button>
                                  )}
                                  <div className="border-t border-gray-100 my-1" />
                                  <button onClick={e => handleDeleteRes(e, res.id)}
                                    className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2">
                                    🗑 Borrar reserva
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ── Checkout button on last day (multi-night stays) ── */}
                          {!selectMode && res.status === 'ocupado' && isCheckOut && !isCheckIn && (
                            <div className="absolute top-0.5 right-0.5 z-10">
                              <button
                                onClick={e => openCheckoutModal(e, res)}
                                title="Registrar salida"
                                className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center"
                              >
                                <PlayCircle size={16} className="text-white/80 hover:text-white drop-shadow" />
                              </button>
                            </div>
                          )}
                          </div>
                        ) : (
                          <button
                            onClick={() => openNew(room.id, d)}
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
                  {/* Cliente / Empresa */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente / Empresa *</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Precio total (USD)</label>
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
                            onChange={e => setForm(f => ({ ...f, is_empresa: e.target.checked }))}
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
                          </>
                        ) : (
                          <input type="text" value={form.guest_name}
                            onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))}
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

                      {/* N° noches + precio + adelanto */}
                      <div className="grid grid-cols-3 gap-3">
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
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Adelanto (Bs.)</label>
                          <input type="number" min={0} step={0.5} value={form.adelanto}
                            onChange={e => setForm(f => ({ ...f, adelanto: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                            placeholder="0.00" />
                        </div>
                      </div>

                      {/* Resumen rápido del total */}
                      {form.price_per_night && form.num_nights > 0 && (() => {
                        const total = parseFloat(form.price_per_night) * form.num_nights;
                        const adel  = parseFloat(form.adelanto) || 0;
                        const saldo = total - adel;
                        return (
                          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
                            <span className="text-gray-500">Total: <strong>Bs. {total.toFixed(2)}</strong></span>
                            {adel > 0 && <><span className="text-gray-400">—</span><span className="text-green-700">Adelanto: Bs. {adel.toFixed(2)}</span></>}
                            {adel > 0 && <><span className="text-gray-400">—</span><span className="font-bold text-amber-800">Saldo: Bs. {Math.max(0, saldo).toFixed(2)}</span></>}
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

                      {/* N° noches + precio + adelanto */}
                      <div className="grid grid-cols-3 gap-3">
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
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Adelanto (Bs.)</label>
                          <input type="number" min={0} step={0.5} value={form.adelanto}
                            onChange={e => setForm(f => ({ ...f, adelanto: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                            placeholder="0.00" />
                        </div>
                      </div>

                      {/* Resumen rápido */}
                      {form.price_per_night && form.num_nights > 0 && (() => {
                        const total = parseFloat(form.price_per_night) * form.num_nights;
                        const adel  = parseFloat(form.adelanto) || 0;
                        const saldo = total - adel;
                        return (
                          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm">
                            <span className="text-gray-500">📅 {form.check_in || '?'} → <strong>{form.check_out || '?'}</strong></span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-500">Total: <strong>Bs. {total.toFixed(2)}</strong></span>
                            {adel > 0 && <><span className="text-gray-400">—</span><span className="text-green-700">Adelanto: Bs. {adel.toFixed(2)}</span><span className="text-gray-400">—</span><span className="font-bold text-blue-800">Saldo: Bs. {Math.max(0, saldo).toFixed(2)}</span></>}
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
                            onChange={e => setForm(f => ({ ...f, is_empresa: e.target.checked }))}
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
                            ['late_checkout', '🌙', 'Late Checkout','bg-purple-50 border-purple-400 text-purple-700'],
                          ] as [keyof typeof form, string, string, string][]).map(([key, emoji, label, activeClass]) => (
                            <button key={key} type="button"
                              onClick={() => setForm(f => ({ ...f, [key]: !f[key as keyof typeof f] }))}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all select-none ${
                                form[key as keyof typeof form] ? activeClass : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}>
                              <span>{emoji}</span><span>{label}</span>
                            </button>
                          ))}
                          <button type="button" onClick={() => setForm(f => ({ ...f, is_blacklist: !f.is_blacklist }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all select-none ${
                              form.is_blacklist ? 'bg-red-50 border-red-400 text-red-700' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'
                            }`}>
                            <span>🚫</span><span>Lista negra</span>
                          </button>
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
                              onChange={e => setForm(f => ({ ...f, guest_phone: e.target.value }))}
                              onBlur={e => lookupGuest(e.target.value, 'guest_phone')}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <input type="text" placeholder="CI / Pasaporte"
                              value={form.guest_document}
                              onChange={e => setForm(f => ({ ...f, guest_document: e.target.value }))}
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
                                options={[{ value: 'M', label: 'M — Masculino' }, { value: 'F', label: 'F — Femenino' }]}
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
                              <CustomSelect size="sm" value={form.guest_marital_status}
                                onChange={v => setForm(f => ({ ...f, guest_marital_status: v as any }))}
                                options={[{ value:'S', label:'S — Soltero' },{ value:'C', label:'C — Casado' },{ value:'D', label:'D — Divorciado' },{ value:'V', label:'V — Viudo' }]}
                                placeholder="—" />
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
                            <CustomSelect size="sm" value={form.guest_purpose}
                              onChange={v => setForm(f => ({ ...f, guest_purpose: v }))}
                              options={['Turismo','Trabajo','Estudio','Salud','Negocios','Otro'].map(v => ({ value: v, label: v }))}
                              placeholder="Objeto —" />
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
                              options={[{ value:'T', label:'T' },{ value:'A', label:'A' },{ value:'B', label:'B' }]}
                              placeholder="Vía —" />
                          </div>
                        </div>

                        {/* Huéspedes adicionales */}
                        {additionalGuests.map((ag, idx) => (
                          <div key={idx} className="border border-amber-100 rounded-lg p-3 bg-white space-y-2">
                            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Huésped {idx + 2}</p>
                            <input type="text" placeholder="Nombre y apellidos" value={ag.name}
                              onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, name: e.target.value } : g))}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                            <div className="grid grid-cols-2 gap-2">
                              <input type="tel" placeholder="Celular" value={ag.phone}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, phone: e.target.value } : g))}
                                onBlur={e => lookupAdditionalGuest(e.target.value, 'guest_phone', idx)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                              <input type="text" placeholder="CI / Pasaporte" value={ag.document}
                                onChange={e => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, document: e.target.value } : g))}
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
                                <CustomSelect size="sm" value={ag.marital_status}
                                  onChange={v => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, marital_status: v as any } : g))}
                                  options={[{ value:'S', label:'S' },{ value:'C', label:'C' },{ value:'D', label:'D' },{ value:'V', label:'V' }]}
                                  placeholder="—" />
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
                              <CustomSelect size="sm" value={ag.purpose}
                                onChange={v => setAdditionalGuests(prev => prev.map((g, i) => i === idx ? { ...g, purpose: v } : g))}
                                options={['Turismo','Trabajo','Estudio','Salud','Negocios','Otro'].map(v => ({ value: v, label: v }))}
                                placeholder="Objeto —" />
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
                                options={[{ value:'T', label:'Terrestre' },{ value:'A', label:'Aéreo' },{ value:'F', label:'Fluvial' }]}
                                placeholder="Vía —" />
                            </div>
                          </div>
                        ))}
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
                      onBlur={async e => {
                        const v = e.target.value;
                        if (v.length < 4) return;
                        const { data } = await supabase.from('reservations').select('guest_name,guest_phone,guest_gender,guest_birthdate,guest_marital_status,guest_country,guest_document,guest_profession,guest_purpose,guest_origin,guest_next_dest,guest_transport').eq('guest_phone', v).not('guest_name','is',null).order('updated_at',{ascending:false}).limit(1);
                        const g = data?.[0]; if (!g) return;
                        setConfirmModal(m => ({ ...m, guest_name_edit: g.guest_name ?? m.guest_name_edit, guest_gender: g.guest_gender ?? m.guest_gender, guest_birthdate: g.guest_birthdate ?? m.guest_birthdate, guest_marital_status: g.guest_marital_status ?? m.guest_marital_status, guest_country: g.guest_country ?? m.guest_country, guest_document: g.guest_document ?? m.guest_document, guest_profession: g.guest_profession ?? m.guest_profession, guest_purpose: g.guest_purpose ?? m.guest_purpose, guest_origin: g.guest_origin ?? m.guest_origin, guest_next_dest: g.guest_next_dest ?? m.guest_next_dest, guest_transport: g.guest_transport ?? m.guest_transport }));
                      }}
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
                      <CustomSelect size="sm" value={confirmModal.guest_marital_status}
                        onChange={v => setConfirmModal(m => ({ ...m, guest_marital_status: v }))}
                        options={[{ value:'S', label:'S' },{ value:'C', label:'C' },{ value:'D', label:'D' },{ value:'V', label:'V' }]}
                        placeholder="—" accent="green" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Profesión" value={confirmModal.guest_profession}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_profession: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <CustomSelect size="sm" value={confirmModal.guest_purpose}
                      onChange={v => setConfirmModal(m => ({ ...m, guest_purpose: v }))}
                      options={['Turismo','Trabajo','Estudio','Salud','Negocios','Otro'].map(v => ({ value: v, label: v }))}
                      placeholder="Objeto —" accent="green" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <input type="text" placeholder="Procedencia" value={confirmModal.guest_origin}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_origin: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <input type="text" placeholder="Próx. Destino" value={confirmModal.guest_next_dest}
                      onChange={e => setConfirmModal(m => ({ ...m, guest_next_dest: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                    <CustomSelect size="sm" value={confirmModal.guest_transport}
                      onChange={v => setConfirmModal(m => ({ ...m, guest_transport: v }))}
                      options={[{ value:'T', label:'T' },{ value:'A', label:'A' },{ value:'B', label:'B' }]}
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
                          onBlur={async e => {
                            const v = e.target.value; if (v.length < 4) return;
                            const { data } = await supabase.from('reservations').select('guest_name,guest_phone,guest_gender,guest_birthdate,guest_marital_status,guest_country,guest_document,guest_profession,guest_purpose,guest_origin,guest_next_dest,guest_transport').eq('guest_phone',v).not('guest_name','is',null).order('updated_at',{ascending:false}).limit(1);
                            const g2 = data?.[0]; if (!g2) return;
                            setConfirmAdditionalGuests(p => p.map((g, i) => i !== idx ? g : { ...g, name: g2.guest_name ?? g.name, gender: g2.guest_gender ?? g.gender, birthdate: g2.guest_birthdate ?? g.birthdate, marital_status: g2.guest_marital_status ?? g.marital_status, country: g2.guest_country ?? g.country, document: g2.guest_document ?? g.document, profession: g2.guest_profession ?? g.profession, purpose: g2.guest_purpose ?? g.purpose, origin: g2.guest_origin ?? g.origin, next_dest: g2.guest_next_dest ?? g.next_dest, transport: g2.guest_transport ?? g.transport }));
                          }}
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
                        <CustomSelect size="sm" value={ag.marital_status} accent="green"
                          onChange={v => setConfirmAdditionalGuests(p => p.map((g, i) => i === idx ? { ...g, marital_status: v as any } : g))}
                          options={[{ value:'S', label:'S' },{ value:'C', label:'C' },{ value:'D', label:'D' },{ value:'V', label:'V' }]} placeholder="E.Civil" />
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
                          options={[{ value:'T', label:'T' },{ value:'A', label:'A' },{ value:'B', label:'B' }]} placeholder="Vía" />
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-orange-50 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-gray-900">Registrar salida</h3>
                <p className="text-xs text-orange-700 font-semibold mt-0.5">
                  {checkoutModal.res.room_id} — {checkoutModal.res.guest_name}
                </p>
              </div>
              <button onClick={() => setCheckoutModal(m => ({ ...m, open: false }))} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
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

              {/* Resumen financiero */}
              {(() => {
                const r = checkoutModal.res!;
                const nights = Math.max(1, Math.round(
                  (new Date(r.check_out + 'T00:00:00').getTime() - new Date(r.check_in + 'T00:00:00').getTime()) / 86400000
                ));
                const pricePer = r.price_per_night ?? 0;
                const total    = nights * pricePer;
                const adelanto = (r as any).adelanto ?? 0;
                const saldo    = total - adelanto;
                return (
                  <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                    <div className="px-4 py-2 bg-gray-100 text-xs font-bold uppercase tracking-wider text-gray-500">Resumen de estadía</div>
                    <div className="px-4 py-3 space-y-2 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>📅 {r.check_in} → {r.check_out}</span>
                        <span className="font-semibold">{nights} noche{nights !== 1 ? 's' : ''}</span>
                      </div>
                      {pricePer > 0 && (
                        <>
                          <div className="flex justify-between text-gray-600">
                            <span>Precio / noche</span>
                            <span>Bs. {pricePer.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between font-semibold text-gray-800 border-t border-gray-200 pt-2">
                            <span>Total</span>
                            <span>Bs. {total.toFixed(2)}</span>
                          </div>
                          {adelanto > 0 && (
                            <div className="flex justify-between text-green-700">
                              <span>Adelanto recibido</span>
                              <span>− Bs. {adelanto.toFixed(2)}</span>
                            </div>
                          )}
                          <div className={`flex justify-between font-bold text-base border-t border-gray-200 pt-2 ${saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            <span>Saldo a cobrar</span>
                            <span>Bs. {Math.max(0, saldo).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                    </div>
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
                ⬆ Registrar salida
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
