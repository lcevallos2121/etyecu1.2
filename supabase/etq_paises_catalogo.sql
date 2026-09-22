-- Catálogo de países de origen, igual que el de marcas/composiciones: permite
-- agregar un país que no esté en la lista sin bloquear el trabajo, quedando
-- disponible para la próxima vez. Idempotente.
create table if not exists public.etq_paises_catalogo (
  id uuid primary key default gen_random_uuid(),
  pais text not null unique,
  creado_en timestamp with time zone not null default now()
);

alter table public.etq_paises_catalogo enable row level security;

drop policy if exists temporal_paises_catalogo on public.etq_paises_catalogo;
create policy temporal_paises_catalogo on public.etq_paises_catalogo
  for all using (true) with check (true);

insert into public.etq_paises_catalogo (pais) values
  ('CHINA'), ('COLOMBIA'), ('PERÚ'), ('PANAMÁ'), ('ESTADOS UNIDOS'), ('MÉXICO'),
  ('BRASIL'), ('TURQUÍA'), ('INDIA'), ('VIETNAM'), ('BANGLADESH'), ('COREA DEL SUR'),
  ('ESPAÑA'), ('ITALIA'), ('CHILE'), ('ARGENTINA'), ('CAMBOYA')
on conflict (pais) do nothing;
