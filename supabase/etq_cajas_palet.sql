-- Desglose por CAJA FÍSICA de a qué PALET pertenece. etq_items.palet /
-- etq_variantes.palet son un único valor por FILA, pero cuando dos códigos
-- se unifican (Unificar códigos) porque en realidad son el mismo producto
-- capturado por separado, sus cajas físicas pueden venir de palets
-- distintos (ej. caja 19 venía del palet 2, caja 25 del palet 4) y al
-- fusionarse en una sola fila solo queda el palet del código "principal" —
-- las demás cajas se muestran con un palet que no es el real.
-- Esta tabla guarda el palet real de cada caja física, igual que
-- etq_tallas_por_caja desglosa las tallas y etq_cajas_impresas el estado
-- de impreso. No lleva restricción unique: la app busca el registro
-- existente por item_id/variante_id + numero_caja y actualiza en vez de
-- duplicar.
create table if not exists public.etq_cajas_palet (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.etq_items(id) on delete cascade,
  variante_id uuid references public.etq_variantes(id) on delete cascade,
  caja text not null,
  numero_caja text,
  palet text,
  creado_en timestamp with time zone not null default now()
);

alter table public.etq_cajas_palet enable row level security;

drop policy if exists temporal_cajas_palet on public.etq_cajas_palet;
create policy temporal_cajas_palet on public.etq_cajas_palet
  for all using (true) with check (true);
