-- ===========================================================================
-- Catálogo normalizado de MARCAS (etiquetado)
-- ---------------------------------------------------------------------------
-- Correr una sola vez en el SQL Editor de Supabase. Es idempotente.
-- Mismo patrón que etq_composiciones_catalogo: evita que la misma marca se
-- escriba de muchas formas distintas al hacer inventario. El buscador de la
-- captura sugiere desde aquí y permite agregar una marca nueva al vuelo.
-- ===========================================================================

create table if not exists etq_marcas_catalogo (
  id uuid primary key default gen_random_uuid(),
  marca text not null unique,
  creado_en timestamptz not null default now()
);

-- El resto del esquema corre sin RLS (ver nota en schema.sql). Si la tabla se
-- crea desde el editor de tablas de Supabase queda con RLS activada y sin
-- políticas, lo que bloquea leer/insertar desde la app. La dejamos igual que
-- las demás tablas del sistema.
alter table etq_marcas_catalogo disable row level security;

-- Sembrar el catálogo con las marcas que ya se capturaron en el inventario,
-- para que el buscador no arranque vacío. Idempotente (on conflict do nothing).
insert into etq_marcas_catalogo (marca)
select distinct trim(marca)
from etq_items
where marca is not null and trim(marca) <> ''
on conflict (marca) do nothing;
