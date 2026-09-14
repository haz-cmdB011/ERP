-- ============================================================================
-- ERP Becario — Esquema inicial: Planeación + esqueleto de retroalimentación
-- para Producción, Calidad, Estimaciones y Finanzas.
-- Fase 1: solo se implementa ingestión de Planeación. Las tablas de
-- retroalimentación quedan listas para las fases siguientes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.area_tipo as enum ('produccion', 'calidad', 'estimaciones', 'finanzas');
create type public.origen_dato as enum ('excel', 'formulario');
create type public.estado_procesamiento as enum ('pendiente', 'procesando', 'exitoso', 'error', 'error_parcial');
create type public.tipo_registro_item as enum ('MO', 'FU');

-- ---------------------------------------------------------------------------
-- proyectos
-- ---------------------------------------------------------------------------
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cliente text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- pedidos ("PEDIDO DE MANUFACTURA", ej. "PM 107-26")
-- ---------------------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete restrict,
  numero_pedido text not null,
  fecha_pedido date,
  fecha_entrega date,
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proyecto_id, numero_pedido)
);

-- ---------------------------------------------------------------------------
-- cargas_archivo: auditoría genérica de TODA subida de archivo.
-- area = 'planeacion' en fase 1; 'produccion'/'calidad'/etc. en fases futuras.
-- ---------------------------------------------------------------------------
create table public.cargas_archivo (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references public.pedidos(id) on delete set null,
  area text not null default 'planeacion',
  nombre_archivo text not null,
  storage_path text not null,
  tamano_bytes bigint,
  hash_sha256 text,
  cargado_por uuid references auth.users(id),
  cargado_en timestamptz not null default now(),
  estado public.estado_procesamiento not null default 'pendiente',
  filas_totales integer,
  filas_exitosas integer,
  filas_error integer,
  errores jsonb,
  procesado_en timestamptz
);
create index idx_cargas_archivo_pedido on public.cargas_archivo (pedido_id);

-- ---------------------------------------------------------------------------
-- pedido_versiones: cada carga de Excel de Planeación crea una versión
-- inmutable y con historial completo (nunca se sobreescribe).
-- ---------------------------------------------------------------------------
create table public.pedido_versiones (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  numero_version integer not null,
  carga_id uuid references public.cargas_archivo(id) on delete set null,
  es_version_activa boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  unique (pedido_id, numero_version)
);
create index idx_pedido_versiones_pedido on public.pedido_versiones (pedido_id);

-- Solo una versión activa por pedido
create unique index idx_pedido_versiones_activa
  on public.pedido_versiones (pedido_id)
  where es_version_activa;

-- ---------------------------------------------------------------------------
-- planeacion_items: dato raíz. Jerarquía MO (mueble) -> FU (componente)
-- vía parent_item_id (auto-referencia).
-- ---------------------------------------------------------------------------
create table public.planeacion_items (
  id uuid primary key default gen_random_uuid(),
  pedido_version_id uuid not null references public.pedido_versiones(id) on delete cascade,
  parent_item_id uuid references public.planeacion_items(id) on delete cascade,
  item_code numeric(10, 2) not null,           -- 1, 1.01, 1.02, 2, 2.01...
  tipo_registro public.tipo_registro_item not null,
  tipo_material text,                          -- HIBRIDO, MADERA, METAL, TAPIZ...
  etapa text,
  nivel text,
  departamento text,
  elevacion text,
  modelo text,
  descripcion text,
  cantidad_x_mueble numeric(12, 2),
  unidad text,
  cantidad_total numeric(12, 2) not null,       -- <- cantidad DECLARADA (base del revisor)
  acabados text,
  observaciones text,
  fila_excel_origen integer,                    -- fila original en el Excel, para trazabilidad
  created_at timestamptz not null default now(),
  unique (pedido_version_id, item_code)
);
create index idx_planeacion_items_version on public.planeacion_items (pedido_version_id);
create index idx_planeacion_items_parent on public.planeacion_items (parent_item_id);

-- ---------------------------------------------------------------------------
-- retroalimentaciones: cantidades REALES reportadas por Producción, Calidad,
-- Estimaciones o Finanzas, referenciando siempre un planeacion_item de origen.
-- origen soporta tanto reupload de Excel como formulario dentro de la app.
-- ---------------------------------------------------------------------------
create table public.retroalimentaciones (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  area public.area_tipo not null,
  origen public.origen_dato not null,
  carga_id uuid references public.cargas_archivo(id) on delete set null,
  cantidad_reportada numeric(12, 2) not null,
  unidad text,
  comentarios text,
  reportado_por uuid references auth.users(id),
  reportado_en timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb   -- campos específicos por área, sin migrar esquema
);
create index idx_retro_item on public.retroalimentaciones (planeacion_item_id);
create index idx_retro_area on public.retroalimentaciones (area);

-- ---------------------------------------------------------------------------
-- revisiones_cantidad: snapshot de auditoría del revisor de cantidades.
-- Se genera cada vez que llega una retroalimentación nueva.
-- ---------------------------------------------------------------------------
create table public.revisiones_cantidad (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  retroalimentacion_id uuid references public.retroalimentaciones(id) on delete cascade,
  area public.area_tipo not null,
  cantidad_declarada numeric(12, 2) not null,
  cantidad_reportada numeric(12, 2) not null,
  diferencia numeric(12, 2) generated always as (cantidad_reportada - cantidad_declarada) stored,
  porcentaje_diferencia numeric(6, 2),
  estado text not null,                          -- 'ok' | 'alerta' | 'critico'
  generado_en timestamptz not null default now(),
  revisado_por uuid references auth.users(id),
  revisado_en timestamptz,
  notas text
);
create index idx_revisiones_item on public.revisiones_cantidad (planeacion_item_id);

-- ---------------------------------------------------------------------------
-- perfiles: extiende auth.users con área/rol para permisos futuros por área.
-- ---------------------------------------------------------------------------
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text,
  area public.area_tipo,                         -- null = Planeación / admin
  rol text not null default 'usuario',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_proyectos_updated_at before update on public.proyectos
  for each row execute function public.set_updated_at();
create trigger trg_pedidos_updated_at before update on public.pedidos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — política inicial mínima (fase 1):
-- cualquier usuario autenticado puede leer y escribir todo.
-- Se refina por área/rol en fases posteriores usando public.perfiles.
-- ---------------------------------------------------------------------------
alter table public.proyectos enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_versiones enable row level security;
alter table public.cargas_archivo enable row level security;
alter table public.planeacion_items enable row level security;
alter table public.retroalimentaciones enable row level security;
alter table public.revisiones_cantidad enable row level security;
alter table public.perfiles enable row level security;

create policy "authenticated_all_proyectos" on public.proyectos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_pedidos" on public.pedidos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_pedido_versiones" on public.pedido_versiones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_cargas_archivo" on public.cargas_archivo
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_planeacion_items" on public.planeacion_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_retroalimentaciones" on public.retroalimentaciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated_all_revisiones_cantidad" on public.revisiones_cantidad
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "perfiles_select_all_authenticated" on public.perfiles
  for select using (auth.role() = 'authenticated');
create policy "perfiles_update_own" on public.perfiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "perfiles_insert_own" on public.perfiles
  for insert with check (auth.uid() = id);
