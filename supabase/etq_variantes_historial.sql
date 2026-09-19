-- Historial de cambios de variantes (creación, edición, eliminación), para
-- poder auditar qué se modificó, cuándo y qué valores tenía antes/después.
-- Idempotente: puede correrse más de una vez sin duplicar nada.
create table if not exists public.etq_variantes_historial (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid, -- puede quedar sin variante viva si la variante fue eliminada
  item_id uuid not null references public.etq_items(id) on delete cascade,
  orden_id uuid not null references public.etq_ordenes(id) on delete cascade,
  codigo text,
  accion text not null check (accion in ('creada', 'editada', 'eliminada')),
  valores_antes jsonb,
  valores_despues jsonb,
  mesa_id uuid references public.etq_mesas(id) on delete set null,
  creado_en timestamp with time zone not null default now()
);

alter table public.etq_variantes_historial enable row level security;

drop policy if exists temporal_etq_variantes_historial on public.etq_variantes_historial;
create policy temporal_etq_variantes_historial on public.etq_variantes_historial
  for all using (true) with check (true);

create index if not exists etq_variantes_historial_item_id_idx
  on public.etq_variantes_historial (item_id);
