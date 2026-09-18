-- ===========================================================================
-- Palet propio por variante
-- ---------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente.
-- Antes, una variante (color/composición distinta del mismo código) siempre
-- heredaba el palet de su código padre (etq_items.palet). Ahora puede tener
-- su propio palet, para los casos en que esa variante llega repartida en un
-- palet (o caja) distinto al del resto del código.
-- Las variantes existentes quedan con palet = null y se siguen mostrando con
-- el palet del código padre hasta que se editen.
-- ===========================================================================

alter table etq_variantes
  add column if not exists palet text;
