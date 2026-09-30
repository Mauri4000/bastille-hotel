-- ============================================================
-- Agregar conteo de ropa al turno (shift_handover)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE shift_handover
  ADD COLUMN IF NOT EXISTS linen_towels_large   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_towels_small   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_sheets_large   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_sheets_small   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_pillowcases    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_tablecloths    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS linen_duvets         integer NOT NULL DEFAULT 0;

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'shift_handover'
  AND column_name LIKE 'linen_%'
ORDER BY column_name;
