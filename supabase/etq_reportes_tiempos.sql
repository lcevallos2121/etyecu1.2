-- ===========================================================================
-- Reportes de etiquetado: tiempos de proceso (inventario / etiquetado / total)
-- ---------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente
-- (add column if not exists), así que se puede volver a correr sin problema.
-- ===========================================================================

-- 1) Marca de FASE de trabajo en cada movimiento. Permite separar en los
--    reportes cuánto tiempo se dedicó a INVENTARIO (conteo/captura) vs a
--    ETIQUETADO. Los movimientos viejos quedan en NULL (sin fase) y siguen
--    contando para el "tiempo de trabajo" general.
alter table etq_movimientos
  add column if not exists fase text
  check (fase is null or fase in ('inventario', 'etiquetado'));

-- 2) Momento en que la orden se da por CONCLUIDA. Con esto se mide el
--    "tiempo total del proceso" = concluida_en - creado_en (en días y horas).
--    Se llena/limpia desde el botón "Concluir orden" / "Reabrir" en la
--    pantalla de la orden de etiquetado.
alter table etq_ordenes
  add column if not exists concluida_en timestamptz;
