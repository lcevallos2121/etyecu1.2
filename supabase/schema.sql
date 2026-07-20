-- ============================================================================
-- ETYECU DAP v2.0 — Esquema inicial para Supabase (Postgres)
-- Migrado desde la estructura real de producción (etyecu_prod.sql, Laravel v1.0)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================================

-- Extensión para UUID
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. ROLES DE USUARIO (existían en v1.0 pero no se aplicaban en el código)
-- ---------------------------------------------------------------------------
create type user_role as enum ('administrador', 'agente_aduana', 'deposito_aduanero', 'mesa', 'importador');

create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  apellido text,
  rol user_role not null default 'deposito_aduanero',
  estado boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. CLIENTES
-- ---------------------------------------------------------------------------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ruc_ci text not null unique,
  telefono text,
  correo text,
  direccion text,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. CDA (Contrato/Declaración de aduana)
-- ---------------------------------------------------------------------------
create table cdas (
  id uuid primary key default gen_random_uuid(),
  numero_orden text not null unique,
  cliente_id uuid not null references clientes(id),
  bl text,
  transporte text,
  proveedor text,
  factura text,
  valor_garantia numeric(12,2),
  creado_en timestamptz not null default now()
);

create table cda_items (
  id uuid primary key default gen_random_uuid(),
  cda_id uuid not null references cdas(id) on delete cascade,
  codigo text not null,
  descripcion text,
  cantidad numeric(12,2) not null default 0,
  unidad text,
  creado_en timestamptz not null default now()
);

-- Nota de pedido: Excel del proveedor cargado en Régimen 70
create table notapedidos (
  id uuid primary key default gen_random_uuid(),
  cda_id uuid not null references cdas(id) on delete cascade,
  archivo_url text,
  procesado_por_ia boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. RACKS, NIVELES Y POSICIONES (jerarquía física del depósito)
-- ---------------------------------------------------------------------------
create table racks (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text,
  creado_en timestamptz not null default now()
);

create table niveles_rack (
  id uuid primary key default gen_random_uuid(),
  rack_id uuid not null references racks(id) on delete cascade,
  numero_nivel int not null,
  creado_en timestamptz not null default now()
);

create table posiciones_nivel (
  id uuid primary key default gen_random_uuid(),
  nivel_id uuid not null references niveles_rack(id) on delete cascade,
  codigo_posicion text not null,
  ocupado boolean not null default false,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. ÓRDENES DAP (ingreso de carga) Y UBICACIONES
-- ---------------------------------------------------------------------------
create table ordenes_dap (
  id uuid primary key default gen_random_uuid(),
  numero_dap text not null unique,
  cda_id uuid not null references cdas(id),
  cantidad_ingresada numeric(12,2) not null default 0,
  cantidad_actual numeric(12,2) not null default 0,
  regimen text not null check (regimen in ('10', '70')),
  qr_url text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table ubicaciones_carga (
  id uuid primary key default gen_random_uuid(),
  orden_dap_id uuid not null references ordenes_dap(id) on delete cascade,
  posicion_id uuid not null references posiciones_nivel(id),
  cantidad numeric(12,2) not null default 0,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. EGRESOS DE CARGA
-- ---------------------------------------------------------------------------
create table egreso_transacciones (
  id uuid primary key default gen_random_uuid(),
  orden_dap_id uuid not null references ordenes_dap(id),
  cantidad numeric(12,2) not null,
  salida_parcial boolean not null default true,
  registrado_por uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. MÓDULO DE NOVEDADES (parte del plan v2.0 ya definido por el equipo)
-- ---------------------------------------------------------------------------
create table novedades (
  id uuid primary key default gen_random_uuid(),
  orden_dap_id uuid references ordenes_dap(id),
  tipo text not null check (tipo in ('faltante', 'dano', 'sello_roto', 'otro')),
  descripcion text,
  foto_url text,
  resuelto boolean not null default false,
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 8. DOCUMENTOS (subidos por el agente de aduana)
-- ---------------------------------------------------------------------------
create table documentos (
  id uuid primary key default gen_random_uuid(),
  cda_id uuid references cdas(id),
  orden_dap_id uuid references ordenes_dap(id),
  nombre_archivo text not null,
  url text not null,
  subido_por uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

-- ============================================================================
-- Índices recomendados
-- ============================================================================
create index idx_cda_items_cda on cda_items(cda_id);
create index idx_ordenes_dap_cda on ordenes_dap(cda_id);
create index idx_ubicaciones_orden on ubicaciones_carga(orden_dap_id);
create index idx_egresos_orden on egreso_transacciones(orden_dap_id);
create index idx_novedades_orden on novedades(orden_dap_id);

-- ============================================================================
-- Row Level Security (placeholder — definir políticas reales por rol
-- antes de ir a producción, según lo acordado en la reunión con Abigail)
-- ============================================================================
alter table clientes enable row level security;
alter table cdas enable row level security;
alter table ordenes_dap enable row level security;
alter table egreso_transacciones enable row level security;
alter table novedades enable row level security;

-- Ejemplo de política a definir: solo usuarios autenticados pueden leer
-- create policy "lectura_autenticados" on clientes for select using (auth.role() = 'authenticated');
