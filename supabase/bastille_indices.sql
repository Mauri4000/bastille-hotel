-- ============================================================
-- BASTILLE HOTEL — Índices de Performance
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. reservations: filtro principal del CalendarPage
--    .lte('check_in', lastDay).gte('check_out', firstDay)
CREATE INDEX IF NOT EXISTS idx_reservations_checkin
  ON reservations(check_in);

CREATE INDEX IF NOT EXISTS idx_reservations_checkout
  ON reservations(check_out);

-- Índice compuesto para el rango de fechas del calendario (más eficiente)
CREATE INDEX IF NOT EXISTS idx_reservations_dates_range
  ON reservations(check_in, check_out);

-- 2. reservations: filtro por room_id (muy usado en CalendarPage y triggers)
CREATE INDEX IF NOT EXISTS idx_reservations_room_id
  ON reservations(room_id);

-- 3. reservations: filtro por status (habilitacion, ocupado, etc.)
CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations(status);

-- 4. reservations: empresas autocomplete
--    .eq('is_empresa', true)
CREATE INDEX IF NOT EXISTS idx_reservations_is_empresa
  ON reservations(is_empresa)
  WHERE is_empresa = true;

-- 5. transactions: filtro principal de TransactionsPage
--    .gte('date', firstDay).lte('date', lastDay)
CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON transactions(date);

-- Índice compuesto date + type (para totales por tipo)
CREATE INDEX IF NOT EXISTS idx_transactions_date_type
  ON transactions(date, type);

-- 6. transactions: filtro por reservation_id (detalle de reserva)
CREATE INDEX IF NOT EXISTS idx_transactions_reservation_id
  ON transactions(reservation_id);

-- 7. transactions: filtro por caja
CREATE INDEX IF NOT EXISTS idx_transactions_caja
  ON transactions(caja);

-- 8. reservations: urgencia_acked (para el banner de HABILITAR URGENTE)
CREATE INDEX IF NOT EXISTS idx_reservations_urgencia_acked
  ON reservations(urgencia_acked)
  WHERE urgencia_acked = false;

-- ============================================================
-- Verificar índices creados
-- ============================================================
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('reservations', 'transactions')
  AND schemaname = 'public'
ORDER BY tablename, indexname;
