-- ================================================================
-- BASTILLE HOTEL — Database Schema
-- Pegar en: Supabase → SQL Editor → New query → Run
-- ================================================================


-- ================================================================
-- TABLA: profiles (vinculada a Supabase Auth)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id       UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name     TEXT NOT NULL,
  email    TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'recepcion' CHECK (role IN ('admin', 'recepcion')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crea perfil automáticamente al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'recepcion')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ================================================================
-- TABLA: rooms (habitaciones)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT,
  floor      INTEGER DEFAULT 1,
  capacity   INTEGER DEFAULT 2,
  price_usd  NUMERIC(8,2),
  is_active  BOOLEAN DEFAULT TRUE
);

INSERT INTO public.rooms (id, name, type, floor, capacity) VALUES
  ('A1',    'A1',                    'Simple',             1, 1),
  ('A2',    'A2',                    'Matrimonial',        1, 2),
  ('A3',    'A3',                    'Doble',              1, 2),
  ('A4',    'A4',                    'Suite Simple',       1, 1),
  ('A5',    'A5',                    'Suite Matrimonial',  1, 2),
  ('A6',    'A6',                    'Suite Doble',        1, 3),
  ('SALON', 'Salón de Conferencias', 'Salon',              0, 50)
ON CONFLICT (id) DO NOTHING;


-- ================================================================
-- TABLA: guests (huéspedes)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.guests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT,
  nationality  TEXT,
  doc_type     TEXT DEFAULT 'CI',
  doc_number   TEXT,
  phone        TEXT,
  email        TEXT,
  company      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ================================================================
-- TABLA: reservations (calendario de reservas)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.reservations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id         TEXT NOT NULL REFERENCES public.rooms(id),
  guest_id        UUID REFERENCES public.guests(id),
  guest_name      TEXT NOT NULL,
  num_guests      INTEGER DEFAULT 1,
  check_in        DATE NOT NULL,
  check_out       DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'reserva'
                  CHECK (status IN ('ocupado','reserva','cancelado','mantenimiento','habilitacion')),
  is_empresa      BOOLEAN DEFAULT FALSE,
  has_pet         BOOLEAN DEFAULT FALSE,
  wants_invoice   BOOLEAN DEFAULT FALSE,
  price_per_night NUMERIC(8,2),
  notes           TEXT,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ================================================================
-- TABLA: transactions (ingresos y egresos)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  time           TIME DEFAULT CURRENT_TIME,
  description    TEXT,
  amount         NUMERIC(10,2) NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('ingreso','egreso')),
  category       TEXT NOT NULL,
  caja           TEXT NOT NULL DEFAULT 'CAJA MAYOR'
                 CHECK (caja IN ('CAJA MAYOR','CAJA CHICA','CUENTA BNB')),
  room_id        TEXT REFERENCES public.rooms(id),
  reservation_id UUID REFERENCES public.reservations(id),
  responsible_id UUID REFERENCES public.profiles(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ================================================================
-- TABLA: petty_cash (caja chica)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.petty_cash (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  time           TIME DEFAULT CURRENT_TIME,
  description    TEXT NOT NULL,
  income         NUMERIC(10,2) DEFAULT 0,
  expense        NUMERIC(10,2) DEFAULT 0,
  balance        NUMERIC(10,2) NOT NULL DEFAULT 0,
  responsible_id UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ================================================================
-- TABLA: shift_handover (cambio de turno)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.shift_handover (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date                  DATE NOT NULL DEFAULT CURRENT_DATE,
  shift                 TEXT NOT NULL CHECK (shift IN ('MAÑANA','TARDE','NOCHE')),
  responsible_id        UUID REFERENCES public.profiles(id),
  keys_count            INTEGER DEFAULT 0,
  billing_initial       NUMERIC(10,2) DEFAULT 0,
  billing_final         NUMERIC(10,2) DEFAULT 0,
  cash_register_initial NUMERIC(10,2) DEFAULT 0,
  cash_register_final   NUMERIC(10,2) DEFAULT 0,
  petty_cash_initial    NUMERIC(10,2) DEFAULT 0,
  petty_cash_final      NUMERIC(10,2) DEFAULT 0,
  observations          TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);


-- ================================================================
-- TABLA: banknote_log (registro de billetes)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.banknote_log (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  responsible_id UUID REFERENCES public.profiles(id),
  amount         NUMERIC(10,2) NOT NULL,
  serial_number  TEXT,
  series_letter  TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);


-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handover ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banknote_log   ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Rooms
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "rooms_admin_write" ON public.rooms FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Guests: todo el personal autenticado
CREATE POLICY "guests_all" ON public.guests FOR ALL USING (auth.role() = 'authenticated');

-- Reservations: todo el personal autenticado
CREATE POLICY "reservations_all" ON public.reservations FOR ALL USING (auth.role() = 'authenticated');

-- Transactions: leer/insertar = todos; eliminar = solo admin
CREATE POLICY "transactions_select" ON public.transactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "transactions_insert" ON public.transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "transactions_update" ON public.transactions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "transactions_delete" ON public.transactions FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Petty cash
CREATE POLICY "petty_cash_all" ON public.petty_cash FOR ALL USING (auth.role() = 'authenticated');

-- Shift handover
CREATE POLICY "shift_all" ON public.shift_handover FOR ALL USING (auth.role() = 'authenticated');

-- Banknote log
CREATE POLICY "banknote_all" ON public.banknote_log FOR ALL USING (auth.role() = 'authenticated');


-- ================================================================
-- DESPUÉS DE CREAR LOS USUARIOS EN AUTHENTICATION → USERS:
-- Ejecutar esto para asignar nombres y rol admin a Mauri
-- (Reemplazar los emails si es necesario)
-- ================================================================
/*
UPDATE public.profiles SET name = 'Mauri',    role = 'admin'      WHERE email = 'mauri@bastillehotel.bo';
UPDATE public.profiles SET name = 'Brayan'                         WHERE email = 'brayan@bastillehotel.bo';
UPDATE public.profiles SET name = 'Jasmine'                        WHERE email = 'jasmine@bastillehotel.bo';
UPDATE public.profiles SET name = 'Mariana'                        WHERE email = 'mariana@bastillehotel.bo';
UPDATE public.profiles SET name = 'Guido'                          WHERE email = 'guido@bastillehotel.bo';
UPDATE public.profiles SET name = 'Eloisa'                         WHERE email = 'eloisa@bastillehotel.bo';
*/
