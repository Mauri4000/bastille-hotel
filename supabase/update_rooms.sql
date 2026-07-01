-- ================================================================
-- BASTILLE HOTEL — Actualizar habitaciones
-- Pegar en: Supabase → SQL Editor → Run
-- ================================================================

-- Borrar habitaciones previas e insertar completas
DELETE FROM public.rooms WHERE id NOT IN ('SALON');

INSERT INTO public.rooms (id, name, type, floor, capacity, is_active) VALUES
  ('A1',    'A1',  'DOBLE/FAM',       1, 4,  true),
  ('A2',    'A2',  'SUITE S/M/F',     1, 3,  true),
  ('A3',    'A3',  'SUITE S/M/F (4)', 1, 4,  true),
  ('A4',    'A4',  'S/M',             1, 2,  true),
  ('A5',    'A5',  'S/M',             1, 2,  true),
  ('A6',    'A6',  'S/M',             1, 2,  true),
  ('A7',    'A7',  'S/M',             1, 2,  true),
  ('A8',    'A8',  'DOBLE/FAM',       1, 4,  true),
  ('A9',    'A9',  'S/M',             1, 2,  true),
  ('B1',    'B1',  'DOBLE/FAM',       2, 4,  true),
  ('B2',    'B2',  'SUITE S/M/F',     2, 3,  true),
  ('B3',    'B3',  'SUITE S/M/F (4)', 2, 4,  true),
  ('B4',    'B4',  'S/M',             2, 2,  true),
  ('B5',    'B5',  'S/M',             2, 2,  true),
  ('B6',    'B6',  'S/M',             2, 2,  true),
  ('B7',    'B7',  'S/M',             2, 2,  true),
  ('B8',    'B8',  'DOBLE/FAM',       2, 4,  true),
  ('B9',    'B9',  'S/M',             2, 2,  true),
  ('C1',    'C1',  'S/M',             3, 2,  true),
  ('C2',    'C2',  'S/M',             3, 2,  true),
  ('C3',    'C3',  'S/M',             3, 2,  true),
  ('C4',    'C4',  'S/M',             3, 2,  true),
  ('C5',    'C5',  'DOBLE/FAM',       3, 4,  true),
  ('C6',    'C6',  'S/M',             3, 2,  true)
ON CONFLICT (id) DO UPDATE SET
  type       = EXCLUDED.type,
  floor      = EXCLUDED.floor,
  capacity   = EXCLUDED.capacity,
  is_active  = EXCLUDED.is_active;

-- SALON (conference room - separate from bedroom rows)
UPDATE public.rooms SET is_active = true WHERE id = 'SALON';
