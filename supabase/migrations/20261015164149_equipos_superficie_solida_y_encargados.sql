-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.encargados_equipo_produccion
-- @verifica policy public.encargados_equipo_produccion.select_encargados_equipo_produccion
-- @verifica column public.asignaciones_produccion.encargado
-- @verifica column public.asignaciones_produccion_resumen.encargado
-- @verifica constraint public.equipos_produccion.equipos_produccion_procesos_check
-- @verifica constraint public.asignaciones_produccion.asignaciones_produccion_proceso_check
-- @verifica function-contiene public.crear_asignacion_produccion superficie_solida
-- @verifica function-contiene public.crear_asignacion_produccion iluminación

-- ============================================================================
-- Producción — más procesos y encargado por asignación.
--
--   * Procesos nuevos: electrificacion y superficie_solida (además de armado y
--     barniz).
--   * Electrificación solo se asigna a muebles padre con iluminación, con la
--     misma regla de Estimaciones (descripcion_incluye_iluminacion).
--   * El equipo ya no necesita un encargado fijo. Quien asigna escribe el
--     encargado de esas piezas; el nombre se guarda en el equipo
--     (encargados_equipo_produccion) para elegirlo la próxima vez o agregar otro,
--     y se copia a la asignación (asignaciones_produccion.encargado) para que el
--     historial no cambie.
-- ============================================================================

-- 1. Procesos ---------------------------------------------------------------
alter table public.equipos_produccion drop constraint equipos_produccion_procesos_check;
alter table public.equipos_produccion add constraint equipos_produccion_procesos_check check (
  cardinality(procesos) > 0
  and procesos <@ array['armado', 'barniz', 'electrificacion', 'superficie_solida']::text[]
);

alter table public.asignaciones_produccion drop constraint asignaciones_produccion_proceso_check;
alter table public.asignaciones_produccion add constraint asignaciones_produccion_proceso_check check (
  proceso in ('armado', 'barniz', 'electrificacion', 'superficie_solida')
);

-- 2. Encargados por equipo ----------------------------------------------------
create table public.encargados_equipo_produccion (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos_produccion(id),
  nombre text not null,
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint encargados_equipo_produccion_nombre_check check (nullif(btrim(nombre), '') is not null)
);
create unique index encargados_equipo_produccion_nombre_key
  on public.encargados_equipo_produccion (equipo_id, lower(btrim(nombre)));
create index idx_encargados_equipo_produccion_creado_por
  on public.encargados_equipo_produccion (creado_por);

alter table public.encargados_equipo_produccion enable row level security;
create policy "select_encargados_equipo_produccion" on public.encargados_equipo_produccion
  for select to authenticated using (not (select public.is_maquilador()));
-- Sin políticas de escritura: solo entra por crear_asignacion_produccion.

alter table public.asignaciones_produccion add column encargado text;

-- 3. Asignar: encargado y reglas de los procesos nuevos ------------------------
drop function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text);

create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null
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
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null
     or p_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida') then
    raise exception 'Proceso no válido.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;
  if v_encargado is not null and char_length(v_encargado) > 80 then
    raise exception 'El nombre del encargado es demasiado largo.';
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
  -- Misma regla que Estimaciones: solo se electrifica lo que lleva iluminación.
  if p_proceso = 'electrificacion'
     and not public.descripcion_incluye_iluminacion(v_item.descripcion) then
    raise exception 'El ítem % no lleva iluminación; no se asigna a Electrificación.', v_item.item_code;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  -- El retrabajo no cuenta contra la cantidad del mueble (informe_rechazo_id).
  select coalesce(sum(cantidad), 0) into v_asignado
    from public.asignaciones_produccion
    where planeacion_item_id = p_item_id and proceso = p_proceso and cancelada_en is null
      and informe_rechazo_id is null;

  if v_asignado + p_cantidad > v_item.cantidad_total then
    raise exception 'Solo quedan % por asignar de % para % (ya asignadas: %).',
      v_item.cantidad_total - v_asignado, v_item.cantidad_total, p_proceso, v_asignado;
  end if;

  -- El nombre queda guardado en el equipo para elegirlo la próxima vez.
  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text) from public, anon;
grant execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text) to authenticated;

-- 4. Vista: el encargado de cada asignación (al final: create or replace view
--    no deja reordenar columnas).
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
  end as estado,
  coalesce(en.verificado, 0) as verificado,
  coalesce(en.entregado, 0) - coalesce(en.verificado, 0) as por_verificar,
  en.ultima_verificacion,
  a.informe_rechazo_id,
  ir.folio as folio_rechazo,
  fc.folios_cal,
  a.encargado
from public.asignaciones_produccion a
join public.equipos_produccion e on e.id = a.equipo_id
left join public.informes_calidad ir on ir.id = a.informe_rechazo_id
left join lateral (
  select sum(x.cantidad) as entregado,
         max(x.fecha_entrega) as ultima_entrega,
         string_agg(x.folios_calidad, ', ' order by x.fecha_entrega, x.registrado_en) as folios_calidad,
         count(*) as num_entregas,
         sum(x.cantidad) filter (where x.verificada_en is not null) as verificado,
         max((x.verificada_en at time zone 'America/Mexico_City')::date) as ultima_verificacion
  from public.entregas_produccion x
  where x.asignacion_id = a.id and x.anulada_en is null and x.rechazada_en is null
) en on true
left join lateral (
  select string_agg(i.folio, ', ' order by i.elaborado_en) as folios_cal
  from public.entregas_produccion x2
  join public.informes_calidad i on i.entrega_id = x2.id
  where x2.asignacion_id = a.id
) fc on true;
