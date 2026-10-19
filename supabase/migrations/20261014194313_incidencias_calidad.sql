-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.incidencias_calidad
-- @verifica column public.incidencias_calidad.categoria_motivo
-- @verifica column public.incidencias_calidad.origen_importacion
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_estado_check
-- @verifica trigger public.incidencias_calidad.incidencias_calidad_set_updated_at
-- @verifica policy public.incidencias_calidad.calidad_select_incidencias
-- @verifica policy public.incidencias_calidad.calidad_insert_incidencias
-- @verifica policy public.incidencias_calidad.calidad_update_incidencias
-- @verifica policy public.incidencias_calidad.admin_calidad_delete_incidencias

-- ============================================================================
-- Incidencias de Calidad (reportes de no conformidad, desviaciones, incidencias
-- y mejoras). Vienen del Excel BD-CONTROL26 (hojas MADERA 26 y METAL 26).
--
-- NO son los "folios de calidad" del sistema (informes_calidad, el resultado de
-- evaluar un mueble): aquí se registra qué falló, dónde nació y quién lo vio.
--
-- Sin folio ni fecha a propósito: el equipo decidió llevarlos fuera. La
-- importación del Excel se identifica con `origen_importacion` ("madera:427" =
-- hoja y número de fila) para poder repetirse sin duplicar.
--
-- Área y origen del Excel se fundieron en `areas`. "Quién reporta" del Excel
-- trae áreas, no personas, y se guarda como `areas_reporta`.
--
-- Solo ve y escribe Calidad (is_calidad); borrar, solo el administrador de
-- Calidad o el desarrollador.
-- ============================================================================

create table public.incidencias_calidad (
  id uuid primary key default gen_random_uuid(),
  linea text not null
    constraint incidencias_calidad_linea_check check (linea in ('madera', 'metal')),
  tipo text not null
    constraint incidencias_calidad_tipo_check
    check (tipo in ('Producto No Conforme', 'Desviación', 'Incidencia', 'Mejora de Producto')),
  proyecto text,
  muebles text[] not null default '{}',
  areas text[] not null default '{}',
  motivo text,
  categoria_motivo text not null default 'Sin clasificar'
    constraint incidencias_calidad_categoria_check
    check (categoria_motivo in (
      'Dimensión', 'Daño', 'Extravío o faltante', 'Información o diseño', 'Acabado',
      'Fabricación o armado', 'Material o herraje', 'Proceso o liberación', 'Sin clasificar'
    )),
  areas_reporta text[] not null default '{}',
  estado text not null default 'abierto'
    constraint incidencias_calidad_estado_check check (estado in ('abierto', 'cerrado')),
  origen_importacion text unique,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_incidencias_calidad_estado on public.incidencias_calidad (estado);
create index idx_incidencias_calidad_tipo on public.incidencias_calidad (tipo);
create index idx_incidencias_calidad_creado_por on public.incidencias_calidad (creado_por);

create trigger incidencias_calidad_set_updated_at
  before update on public.incidencias_calidad
  for each row execute function public.set_updated_at();

alter table public.incidencias_calidad enable row level security;

create policy "calidad_select_incidencias" on public.incidencias_calidad
  for select to authenticated using ((select public.is_calidad()));
create policy "calidad_insert_incidencias" on public.incidencias_calidad
  for insert to authenticated with check ((select public.is_calidad()));
create policy "calidad_update_incidencias" on public.incidencias_calidad
  for update to authenticated
  using ((select public.is_calidad()))
  with check ((select public.is_calidad()));
create policy "admin_calidad_delete_incidencias" on public.incidencias_calidad
  for delete to authenticated using ((select public.is_admin_area('calidad')));
