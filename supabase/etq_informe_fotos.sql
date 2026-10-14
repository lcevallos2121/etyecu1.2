-- Campo nuevo para el encabezado "PRODUCTO" del formato "Informe Licores"
-- (ej. "VINOS") — se edita junto a los demás datos del informe final.
alter table public.etq_ordenes add column if not exists producto_informe text;

-- Fotos adjuntas al Informe Final cuando se genera en formato "Informe
-- Licores" (sección "DETALLE DE NOVEDADES ENCONTRADAS"). Cada foto queda
-- asociada a la orden y se muestra en el orden en que se subió.
create table if not exists public.etq_informe_fotos (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.etq_ordenes(id) on delete cascade,
  foto_url text not null,
  orden integer not null default 0,
  creado_en timestamp with time zone not null default now()
);

alter table public.etq_informe_fotos enable row level security;

drop policy if exists temporal_informe_fotos on public.etq_informe_fotos;
create policy temporal_informe_fotos on public.etq_informe_fotos
  for all using (true) with check (true);

-- Bucket público para las fotos del Informe Licores, mismo patrón que el
-- bucket "novedades".
insert into storage.buckets (id, name, public)
values ('informe-licores-fotos', 'informe-licores-fotos', true)
on conflict (id) do nothing;

drop policy if exists temporal_leer_informe_licores_fotos on storage.objects;
create policy temporal_leer_informe_licores_fotos on storage.objects
  for select using (bucket_id = 'informe-licores-fotos');

drop policy if exists temporal_subir_informe_licores_fotos on storage.objects;
create policy temporal_subir_informe_licores_fotos on storage.objects
  for insert with check (bucket_id = 'informe-licores-fotos');

drop policy if exists temporal_borrar_informe_licores_fotos on storage.objects;
create policy temporal_borrar_informe_licores_fotos on storage.objects
  for delete using (bucket_id = 'informe-licores-fotos');
