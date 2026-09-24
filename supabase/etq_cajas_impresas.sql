-- Desglose por CAJA FÍSICA de si ya se marcó "impreso" en el reporte de
-- inventario. etq_items.ya_impreso / etq_variantes.ya_impreso son un único
-- valor por FILA, pero una fila puede agrupar varias cajas físicas distintas
-- en su campo "cajas" (ej. "250(18) 259(6) 260(12)") — al marcar impreso
-- viendo una sola caja (filtrada), esa marca se aplicaba a las TRES cajas
-- juntas, mostrando como ya impresas cajas que nadie había marcado todavía.
-- Esta tabla desglosa el estado por caja, igual que etq_tallas_por_caja
-- desglosa las tallas por caja. No lleva restricción unique (mismo criterio
-- que etq_tallas_por_caja): la app busca el registro existente por
-- item_id/variante_id + numero_caja y actualiza en vez de duplicar.
create table if not exists public.etq_cajas_impresas (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.etq_items(id) on delete cascade,
  variante_id uuid references public.etq_variantes(id) on delete cascade,
  caja text not null,
  numero_caja text,
  impreso boolean not null default false,
  mesa_id uuid references public.etq_mesas(id),
  actualizado_en timestamp with time zone not null default now()
);

alter table public.etq_cajas_impresas enable row level security;

drop policy if exists temporal_cajas_impresas on public.etq_cajas_impresas;
create policy temporal_cajas_impresas on public.etq_cajas_impresas
  for all using (true) with check (true);
