-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.planeacion_item_imagenes
-- @verifica table public.despieces_produccion_historial
-- @verifica table public.encargados_equipo_produccion
-- @verifica table public.historial_marcas_taller_produccion
-- @verifica policy public.planeacion_item_imagenes.authenticated_select_planeacion_item_imagenes
-- @verifica policy public.planeacion_item_imagenes.planeacion_insert_planeacion_item_imagenes
-- @verifica policy public.despieces_produccion_historial.select_despieces_produccion_historial
-- @verifica policy public.encargados_equipo_produccion.select_encargados_equipo_produccion
-- @verifica policy public.historial_marcas_taller_produccion.select_historial_marcas_taller_produccion
-- @verifica index public.idx_despieces_historial_clave
-- @verifica index public.encargados_equipo_produccion_nombre_key
-- @verifica constraint public.historial_marcas_taller_produccion.historial_marcas_taller_una_clave_check
-- @verifica table public.folios_produccion_estado
--
-- Recrea cuatro tablas y una vista que se borraron a mano desde el panel de Supabase (18 nov 2026) al
-- intentar vaciar la base. Las funciones que las usan nunca se borraron, así que mientras no existían
-- fallaban: asignar un mueble y reasignar un rechazo (encargados_equipo_produccion), subir un PM
-- (planeacion_item_imagenes), guardar un despiece (despieces_produccion_historial), las marcas del
-- tablero de Producción (historial_marcas_taller_produccion) y la pantalla de Folios (vista
-- folios_produccion_estado).
--
-- Es la misma definición de las migraciones originales (planeacion_item_imagenes, despiece_robusto,
-- equipos_superficie_solida_y_encargados, historial_marcas_taller y vistas_folios_paginacion) con los
-- ajustes de políticas y permisos que recibieron después. Las tablas vuelven VACÍAS: lo que tenían se
-- perdió con el borrado. Es idempotente: si algo ya existe, no lo toca.

-- ── planeacion_item_imagenes: fotos de cada mueble (el archivo vive en Storage) ──────
create table if not exists public.planeacion_item_imagenes (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  storage_path text not null,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_planeacion_item_imagenes_item on public.planeacion_item_imagenes (planeacion_item_id);
alter table public.planeacion_item_imagenes enable row level security;
drop policy if exists "authenticated_select_planeacion_item_imagenes" on public.planeacion_item_imagenes;
create policy "authenticated_select_planeacion_item_imagenes" on public.planeacion_item_imagenes
  for select to authenticated using ((select public.is_staff()));
drop policy if exists "planeacion_insert_planeacion_item_imagenes" on public.planeacion_item_imagenes;
create policy "planeacion_insert_planeacion_item_imagenes" on public.planeacion_item_imagenes
  for insert to authenticated with check (public.is_planeacion());

-- ── despieces_produccion_historial: cada versión guardada de un despiece ─────────────
create table if not exists public.despieces_produccion_historial (
  id uuid primary key default gen_random_uuid(),
  despiece_id uuid not null references public.despieces_produccion(id) on delete cascade,
  version integer not null,
  lineas jsonb not null,
  igual_a_sugerencia boolean not null default false,
  clave_envio text,
  guardado_por uuid references auth.users(id),
  guardado_en timestamptz not null default now(),
  unique (despiece_id, version)
);
create unique index if not exists idx_despieces_historial_clave
  on public.despieces_produccion_historial (despiece_id, clave_envio)
  where clave_envio is not null;
create index if not exists idx_despieces_historial_guardado_por on public.despieces_produccion_historial (guardado_por);
alter table public.despieces_produccion_historial enable row level security;
drop policy if exists "select_despieces_produccion_historial" on public.despieces_produccion_historial;
create policy "select_despieces_produccion_historial" on public.despieces_produccion_historial
  for select to authenticated using ((select public.is_staff()));

-- Lo que ya estaba guardado en despieces_produccion vuelve a quedar como una versión del historial
-- (la versión actual de cada despiece), para que guardar de nuevo no choque con la versión esperada.
insert into public.despieces_produccion_historial
  (despiece_id, version, lineas, igual_a_sugerencia, guardado_por, guardado_en)
select d.id, d.version, d.lineas, d.igual_a_sugerencia, d.actualizado_por, d.actualizado_en
from public.despieces_produccion d
on conflict (despiece_id, version) do nothing;

-- ── encargados_equipo_produccion: encargados que se capturan al asignar ──────────────
create table if not exists public.encargados_equipo_produccion (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos_produccion(id),
  nombre text not null,
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint encargados_equipo_produccion_nombre_check check (nullif(btrim(nombre), '') is not null)
);
create unique index if not exists encargados_equipo_produccion_nombre_key
  on public.encargados_equipo_produccion (equipo_id, lower(btrim(nombre)));
create index if not exists idx_encargados_equipo_produccion_creado_por
  on public.encargados_equipo_produccion (creado_por);
alter table public.encargados_equipo_produccion enable row level security;
drop policy if exists "select_encargados_equipo_produccion" on public.encargados_equipo_produccion;
create policy "select_encargados_equipo_produccion" on public.encargados_equipo_produccion
  for select to authenticated using (not (select public.is_maquilador()));
-- Sin políticas de escritura: solo entra por crear_asignacion_produccion.

-- Los encargados que ya constan en las asignaciones vuelven a la lista (uno por equipo y nombre).
insert into public.encargados_equipo_produccion (equipo_id, nombre)
select distinct on (a.equipo_id, lower(btrim(a.encargado))) a.equipo_id, btrim(a.encargado)
from public.asignaciones_produccion a
where nullif(btrim(coalesce(a.encargado, '')), '') is not null
on conflict do nothing;

-- ── historial_marcas_taller_produccion: registro de cada cambio de marca (lo escribe un trigger) ──
create table if not exists public.historial_marcas_taller_produccion (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid,
  item_id uuid,
  esta_anterior boolean,
  esta boolean,
  nota text,
  modelo text,
  numero_pedido text,
  orden_trabajo text,
  equipo text,
  hecho_por uuid references auth.users(id) on delete set null default auth.uid(),
  hecho_por_nombre text,
  hecho_en timestamptz not null default now(),
  constraint historial_marcas_taller_una_clave_check check ((asignacion_id is null) <> (item_id is null))
);
create index if not exists idx_historial_marcas_taller_hecho_en on public.historial_marcas_taller_produccion (hecho_en desc);
create index if not exists idx_historial_marcas_taller_asignacion on public.historial_marcas_taller_produccion (asignacion_id);
create index if not exists idx_historial_marcas_taller_item on public.historial_marcas_taller_produccion (item_id);
create index if not exists idx_historial_marcas_taller_hecho_por on public.historial_marcas_taller_produccion (hecho_por);
alter table public.historial_marcas_taller_produccion enable row level security;
drop policy if exists "select_historial_marcas_taller_produccion" on public.historial_marcas_taller_produccion;
create policy "select_historial_marcas_taller_produccion" on public.historial_marcas_taller_produccion
  for select to authenticated using ((select public.is_staff()));

-- ── folios_produccion_estado: vista para paginar y contar folios ──────────────────────
create or replace view public.folios_produccion_estado
with (security_invoker = true) as
select
  f.id,
  f.folio,
  f.generado_en,
  case
    when pi.id is null then 'eliminados'
    when p.eliminado_en is not null then 'eliminados'
    when pi.eliminacion_solicitada_en is not null then 'eliminados'
    when pi.estado_revision = 'cancelado' or p.cancelado_en is not null then 'cancelados'
    else 'activos'
  end as grupo
from public.folios_produccion f
left join public.planeacion_items pi on pi.id = f.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id;
revoke all on public.folios_produccion_estado from public, anon, authenticated;
grant select on public.folios_produccion_estado to authenticated;
