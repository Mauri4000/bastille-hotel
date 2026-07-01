export type Role = 'admin' | 'recepcion';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  type: string;
  floor: number;
  capacity: number;
  price_usd: number | null;
  is_active: boolean;
}

export interface Guest {
  id: string;
  first_name: string;
  last_name: string | null;
  nationality: string | null;
  doc_type: string | null;
  doc_number: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}

export type ReservationStatus =
  | 'ocupado'
  | 'reserva'
  | 'mantenimiento'
  | 'habilitacion';

export interface Reservation {
  id: string;
  room_id: string;
  guest_id: string | null;
  guest_name: string;
  num_guests: number;
  check_in: string;
  check_out: string;
  status: ReservationStatus;
  is_empresa: boolean;
  has_pet: boolean;
  wants_invoice: boolean;
  price_per_night: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'ingreso' | 'egreso';
export type CajaType = 'CAJA MAYOR' | 'CAJA CHICA' | 'CUENTA BNB';

export interface Transaction {
  id: string;
  date: string;
  time: string | null;
  description: string | null;
  amount: number;
  type: TransactionType;
  category: string;
  caja: CajaType;
  room_id: string | null;
  reservation_id: string | null;
  responsible_id: string | null;
  notes: string | null;
  created_at: string;
  profiles?: { name: string };
}

export interface PettyCash {
  id: string;
  date: string;
  time: string | null;
  description: string;
  income: number;
  expense: number;
  balance: number;
  responsible_id: string | null;
  created_at: string;
  profiles?: { name: string };
}

export type ShiftType = 'MAÑANA' | 'TARDE' | 'NOCHE';

export interface ShiftHandover {
  id: string;
  date: string;
  shift: ShiftType;
  responsible_id: string | null;
  keys_count: number;
  billing_initial: number;
  billing_final: number;
  cash_register_initial: number;
  cash_register_final: number;
  petty_cash_initial: number;
  petty_cash_final: number;
  observations: string | null;
  created_at: string;
  profiles?: { name: string };
}

export interface BanknoteLog {
  id: string;
  date: string;
  responsible_id: string | null;
  amount: number;
  serial_number: string | null;
  series_letter: string | null;
  notes: string | null;
  created_at: string;
  profiles?: { name: string };
}
