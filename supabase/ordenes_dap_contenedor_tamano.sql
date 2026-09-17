-- ===========================================================================
-- Tamaño de contenedor en órdenes de ingreso (DAP)
-- ---------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente.
-- Permite distinguir "Contenedor de 20" y "Contenedor de 40" en el campo
-- "Carga llega como" del ingreso y en el reporte de novedad.
-- Los registros viejos con tipo_carga = 'contenedor' quedan sin tamaño (null)
-- y se muestran simplemente como "Contenedor" hasta que se editen.
-- ===========================================================================

alter table ordenes_dap
  add column if not exists contenedor_tamano text
  check (contenedor_tamano is null or contenedor_tamano in ('20', '40'));
