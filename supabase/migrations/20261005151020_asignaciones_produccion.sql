-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.equipos_produccion
-- @verifica table public.asignaciones_produccion
-- @verifica table public.entregas_produccion
-- @verifica table public.asignaciones_produccion_resumen
-- @verifica function public.crear_asignacion_produccion
-- @verifica function public.cancelar_asignacion_produccion
-- @verifica function public.registrar_entrega_produccion
-- @verifica function public.anular_entrega_produccion
-- @verifica policy public.equipos_produccion.produccion_insert_equipos_produccion
-- @verifica policy public.asignaciones_produccion.select_asignaciones_produccion
-- @verifica policy public.entregas_produccion.select_entregas_produccion

-- ============================================================================
-- Producción — asignación de modelos a equipos (maquiladores o planta) y
-- registro de entregas con los folios de Calidad.
--
-- Reemplaza el Excel del encargado (PM, modelo, cantidad, maquilador, fecha de
-- asignación, fecha de entrega, folios de calidad):
--   * equipos_produccion: catálogo de equipos (8 de armado, 3 de barniz y la
--     planta). Muchos maquiladores no tienen cuenta en el sistema, por eso es
--     un catálogo propio y no los perfiles con rol maquilador.
--   * asignaciones_produccion: qué cantidad de un mueble (ítem MO liberado de
--     la versión activa) se le dio a qué equipo, para qué proceso y cuándo. Un
--     mismo modelo se puede repartir entre varios equipos; la suma por proceso
--     no puede pasar de la cantidad del mueble.
--   * entregas_produccion: cuándo terminó el equipo (fecha de entrega), cuántas
--     piezas, los folios de Calidad escritos por el encargado y la foto
--     comprimida de la hoja como evidencia. Una asignación puede entregarse
--     en partes.
--
-- Trazabilidad: nada se borra. Una asignación se cancela (con motivo, solo si
-- no tiene entregas) y una entrega se anula (con motivo, administrador). Cada
-- fila guarda quién y cuándo, y una copia del PM y el modelo para seguir
-- mostrándose aunque el ítem o el pedido se borren.
--
-- Solo se escribe por las funciones de abajo (security definer con chequeo
-- de is_produccion()); las tablas no tienen políticas de INSERT/UPDATE/DELETE
-- salvo el catálogo de equipos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogo de equipos
-- ---------------------------------------------------------------------------
create table public.equipos_produccion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  -- Responsable del equipo (el maquilador que lo encabeza), opcional.
  encargado text,
  -- Trabajadores de la empresa en vez de un maquilador externo.
  es_planta boolean not null default false,
  procesos text[] not null,
  activo boolean not null default true,
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint equipos_produccion_nombre_check check (nullif(btrim(nombre), '') is not null),
  constraint equipos_produccion_procesos_check check (
    cardinality(procesos) > 0 and procesos <@ array['armado', 'barniz']::text[]
  )
);
create unique index equipos_produccion_nombre_key
  on public.equipos_produccion (lower(btrim(nombre)));

alter table public.equipos_produccion enable row level security;
-- Lo ve todo el personal interno (no los maquiladores externos).
create policy "select_equipos_produccion" on public.equipos_produccion
  for select to authenticated using (not (select public.is_maquilador()));
create policy "produccion_insert_equipos_produccion" on public.equipos_produccion
  for insert to authenticated with check ((select public.is_produccion()));
-- Sin DELETE: un equipo con historial se desactiva, no se borra.
create policy "produccion_update_equipos_produccion" on public.equipos_produccion
  for update to authenticated
  using ((select public.is_produccion()))
  with check ((select public.is_produccion()));

insert into public.equipos_produccion (nombre, es_planta, procesos, creado_por)
values ('Planta', true, array['armado', 'barniz'], null);

-- ---------------------------------------------------------------------------
-- Asignaciones
-- ---------------------------------------------------------------------------
create table public.asignaciones_produccion (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid references public.planeacion_items(id) on delete set null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  -- Copia (snapshot) para seguir mostrando la asignación aunque el ítem o el
  -- pedido se borren definitivamente.
  numero_pedido text not null,
  item_code numeric,
  modelo text,
  descripcion text,
  unidad text,
  equipo_id uuid not null references public.equipos_produccion(id),
  proceso text not null,
  cantidad numeric not null,
  fecha_asignacion date not null,
  notas text,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  cancelada_en timestamptz,
  cancelada_por uuid references auth.users(id),
  motivo_cancelacion text,
  constraint asignaciones_produccion_proceso_check check (proceso in ('armado', 'barniz')),
  constraint asignaciones_produccion_cantidad_check check (cantidad > 0),
  constraint asignaciones_produccion_cancelacion_check check (
    cancelada_en is null or nullif(btrim(coalesce(motivo_cancelacion, '')), '') is not null
  )
);
create index idx_asignaciones_produccion_item on public.asignaciones_produccion (planeacion_item_id);
create index idx_asignaciones_produccion_pedido on public.asignaciones_produccion (pedido_id);
create index idx_asignaciones_produccion_equipo on public.asignaciones_produccion (equipo_id);
create index idx_asignaciones_produccion_fecha on public.asignaciones_produccion (fecha_asignacion desc);
create index idx_asignaciones_produccion_creado_por on public.asignaciones_produccion (creado_por);
create index idx_asignaciones_produccion_cancelada_por on public.asignaciones_produccion (cancelada_por);

alter table public.asignaciones_produccion enable row level security;
create policy "select_asignaciones_produccion" on public.asignaciones_produccion
  for select to authenticated using (not (select public.is_maquilador()));

-- ---------------------------------------------------------------------------
-- Entregas
-- ---------------------------------------------------------------------------
create table public.entregas_produccion (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.asignaciones_produccion(id),
  -- Día en que el equipo terminó.
  fecha_entrega date not null,
  cantidad numeric not null,
  -- Folios de Calidad tal como los escribe el encargado.
  folios_calidad text not null,
  -- Foto comprimida de la hoja (bucket privado produccion-entregas).
  foto_path text not null,
  registrado_por uuid references auth.users(id),
  registrado_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references auth.users(id),
  motivo_anulacion text,
  constraint entregas_produccion_cantidad_check check (cantidad > 0),
  constraint entregas_produccion_folios_check check (nullif(btrim(folios_calidad), '') is not null),
  constraint entregas_produccion_anulacion_check check (
    anulada_en is null or nullif(btrim(coalesce(motivo_anulacion, '')), '') is not null
  )
);
create index idx_entregas_produccion_asignacion on public.entregas_produccion (asignacion_id);
create index idx_entregas_produccion_registrado_por on public.entregas_produccion (registrado_por);
create index idx_entregas_produccion_anulada_por on public.entregas_produccion (anulada_por);

alter table public.entregas_produccion enable row level security;
create policy "select_entregas_produccion" on public.entregas_produccion
  for select to authenticated using (not (select public.is_maquilador()));

-- ---------------------------------------------------------------------------
-- Bucket de fotos de entrega. Privado; las sube Producción y se leen con URL
-- firmada. Sin política de DELETE: la evidencia no se borra desde la app (la
-- ruta de servidor limpia con service role si el registro falla).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produccion-entregas', 'produccion-entregas', false)
on conflict (id) do nothing;

create policy "produccion_insert_produccion_entregas_bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produccion-entregas' and (select public.is_produccion()));

create policy "select_produccion_entregas_bucket"
  on storage.objects for select to authenticated
  using (bucket_id = 'produccion-entregas' and not (select public.is_maquilador()));

-- ---------------------------------------------------------------------------
-- Funciones de escritura
-- ---------------------------------------------------------------------------

-- Asigna parte (o todo) un mueble liberado a un equipo para un proceso.
create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_equipo record;
  v_asignado numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null or p_proceso not in ('armado', 'barniz') then
    raise exception 'Proceso no válido.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;

  -- Bloquea el ítem: dos asignaciones simultáneas del mismo mueble se
  -- atienden una tras otra y no pueden pasarse juntas de la cantidad.
  select pi.id, pi.item_code, pi.modelo, pi.descripcion, pi.unidad, pi.cantidad_total,
         pi.tipo_registro, pi.estado_liberacion, pi.eliminacion_solicitada_en,
         pi.estado_revision, pv.es_version_activa,
         p.id as pedido_id, p.numero_pedido, p.eliminado_en, p.cancelado_en
    into v_item
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where pi.id = p_item_id
    for update of pi;

  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.tipo_registro <> 'MO' then
    raise exception 'Solo se asignan muebles (ítems padre), no componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; asigna desde la versión activa.';
  end if;
  if v_item.estado_liberacion <> 'enviado_a_produccion' then
    raise exception 'El ítem % todavía no está liberado a producción.', v_item.item_code;
  end if;
  if v_item.eliminacion_solicitada_en is not null
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El ítem % o su PM está cancelado o eliminado.', v_item.item_code;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  select coalesce(sum(cantidad), 0) into v_asignado
    from public.asignaciones_produccion
    where planeacion_item_id = p_item_id and proceso = p_proceso and cancelada_en is null;

  if v_asignado + p_cantidad > v_item.cantidad_total then
    raise exception 'Solo quedan % por asignar de % para % (ya asignadas: %).',
      v_item.cantidad_total - v_asignado, v_item.cantidad_total, p_proceso, v_asignado;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Cancela una asignación hecha por error o que se reasigna a otro equipo.
-- Solo si no tiene entregas vigentes (primero se anulan).
create or replace function public.cancelar_asignacion_produccion(
  p_asignacion_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelada timestamptz;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cancelar asignaciones.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;

  select cancelada_en into v_cancelada
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_cancelada is not null then
    raise exception 'La asignación ya estaba cancelada.';
  end if;
  if exists (
    select 1 from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null
  ) then
    raise exception 'La asignación ya tiene entregas registradas; no se puede cancelar.';
  end if;

  update public.asignaciones_produccion
    set cancelada_en = now(), cancelada_por = auth.uid(), motivo_cancelacion = btrim(p_motivo)
    where id = p_asignacion_id;
end;
$$;

-- Registra que el equipo terminó (toda o parte de) su asignación.
create or replace function public.registrar_entrega_produccion(
  p_asignacion_id uuid,
  p_fecha_entrega date,
  p_cantidad numeric,
  p_folios_calidad text,
  p_foto_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asignacion record;
  v_entregado numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_entrega is null then
    raise exception 'Falta la fecha de entrega.';
  end if;
  if nullif(btrim(coalesce(p_folios_calidad, '')), '') is null then
    raise exception 'Escribe los folios de Calidad.';
  end if;
  -- La foto se sube antes, en una carpeta con el id de la asignación.
  if p_foto_path is null or p_foto_path not like p_asignacion_id::text || '/%' then
    raise exception 'Falta la foto de los folios.';
  end if;

  select id, cantidad, fecha_asignacion, cancelada_en into v_asignacion
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_asignacion.cancelada_en is not null then
    raise exception 'La asignación está cancelada.';
  end if;
  if p_fecha_entrega < v_asignacion.fecha_asignacion then
    raise exception 'La fecha de entrega no puede ser anterior a la de asignación (%).',
      to_char(v_asignacion.fecha_asignacion, 'DD/MM/YYYY');
  end if;
  if p_fecha_entrega > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de entrega no puede ser futura.';
  end if;

  select coalesce(sum(cantidad), 0) into v_entregado
    from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null;
  if v_entregado + p_cantidad > v_asignacion.cantidad then
    raise exception 'Solo faltan % por entregar de %.',
      v_asignacion.cantidad - v_entregado, v_asignacion.cantidad;
  end if;

  insert into public.entregas_produccion (
    asignacion_id, fecha_entrega, cantidad, folios_calidad, foto_path, registrado_por
  ) values (
    p_asignacion_id, p_fecha_entrega, p_cantidad, btrim(p_folios_calidad), p_foto_path, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Anula una entrega capturada por error (queda en el historial). Solo el
-- administrador de Producción o un desarrollador.
create or replace function public.anular_entrega_produccion(
  p_entrega_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anulada timestamptz;
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo el administrador de Producción puede anular entregas.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la anulación.';
  end if;

  select anulada_en into v_anulada
    from public.entregas_produccion where id = p_entrega_id for update;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_anulada is not null then
    raise exception 'La entrega ya estaba anulada.';
  end if;

  update public.entregas_produccion
    set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
    where id = p_entrega_id;
end;
$$;

revoke execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text) from public, anon;
revoke execute on function public.cancelar_asignacion_produccion(uuid, text) from public, anon;
revoke execute on function public.registrar_entrega_produccion(uuid, date, numeric, text, text) from public, anon;
revoke execute on function public.anular_entrega_produccion(uuid, text) from public, anon;
grant execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text) to authenticated;
grant execute on function public.cancelar_asignacion_produccion(uuid, text) to authenticated;
grant execute on function public.registrar_entrega_produccion(uuid, date, numeric, text, text) to authenticated;
grant execute on function public.anular_entrega_produccion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Vista para el control (la "hoja" del encargado): una fila por asignación
-- con lo entregado y su estado. security_invoker: respeta el RLS de arriba.
-- ---------------------------------------------------------------------------
create or replace view public.asignaciones_produccion_resumen
with (security_invoker = true) as
select
  a.id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.equipo_id,
  e.nombre as equipo,
  e.encargado as equipo_encargado,
  e.es_planta,
  a.proceso,
  a.cantidad,
  a.fecha_asignacion,
  a.notas,
  a.creado_en,
  a.cancelada_en,
  a.motivo_cancelacion,
  coalesce(en.entregado, 0) as entregado,
  en.ultima_entrega,
  en.folios_calidad,
  coalesce(en.num_entregas, 0) as num_entregas,
  case
    when a.cancelada_en is not null then 'cancelada'
    when coalesce(en.entregado, 0) >= a.cantidad then 'entregada'
    when coalesce(en.entregado, 0) > 0 then 'parcial'
    else 'en_proceso'
  end as estado
from public.asignaciones_produccion a
join public.equipos_produccion e on e.id = a.equipo_id
left join lateral (
  select sum(x.cantidad) as entregado,
         max(x.fecha_entrega) as ultima_entrega,
         string_agg(x.folios_calidad, ', ' order by x.fecha_entrega, x.registrado_en) as folios_calidad,
         count(*) as num_entregas
  from public.entregas_produccion x
  where x.asignacion_id = a.id and x.anulada_en is null
) en on true;
