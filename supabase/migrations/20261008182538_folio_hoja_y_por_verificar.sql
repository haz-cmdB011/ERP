-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.registrar_entrega_produccion folio de la hoja de entrega
-- @verifica column public.asignaciones_produccion_resumen.folios_cal
-- @verifica column public.lotes_calidad.folio_hoja
-- @verifica column public.entregas_por_verificar.vigente

-- ============================================================================
-- Folio de la hoja de entrega y entregas por verificar.
--
-- 1. entregas_produccion.folios_calidad NO son los folios de Calidad del
--    sistema: es el folio (o folios) de la hoja de entrega en papel que el
--    encargado escribe al registrar la entrega, y se sigue usando. Los folios
--    CAL- los genera Calidad al evaluar cada lote, después. Se deja el nombre
--    de la columna (lo usan funciones, vistas y el Excel) y se documenta:
--      * el mensaje de registrar_entrega_produccion habla de la hoja;
--      * asignaciones_produccion_resumen gana folios_cal (los CAL- de las
--        entregas de cada asignación) para mostrarlos aparte y buscar por ellos;
--      * lotes_calidad gana folio_hoja, para que Calidad ubique la hoja física.
--
-- 2. entregas_por_verificar: entregas que el trabajador de Producción todavía
--    no revisa, con `vigente` (mueble y PM no cancelados ni eliminados). La
--    usan las alertas de cosas detenidas del inicio de cada área.
-- ============================================================================

comment on column public.entregas_produccion.folios_calidad is
  'Folio(s) de la hoja de entrega en papel, tal como los escribe el encargado. No son los folios CAL- de Calidad (esos están en informes_calidad.entrega_id).';

-- El mensaje habla de la hoja de entrega, no de folios de Calidad.
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
    raise exception 'Escribe el folio de la hoja de entrega.';
  end if;
  -- La foto se sube antes, en una carpeta con el id de la asignación.
  if p_foto_path is null or p_foto_path not like p_asignacion_id::text || '/%' then
    raise exception 'Falta la foto de la hoja de entrega.';
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
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null;
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


-- Los folios CAL- de cada asignación, aparte del folio de la hoja (al final:
-- create or replace view no deja reordenar columnas).
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
  fc.folios_cal
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

-- El folio de la hoja de cada lote, para que Calidad ubique la hoja física.
create or replace view public.lotes_calidad
with (security_invoker = true) as
select
  e.id as entrega_id,
  e.asignacion_id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.proceso,
  a.equipo_id,
  q.nombre as equipo,
  a.informe_rechazo_id,
  ir.folio as folio_rechazo,
  e.fecha_entrega,
  e.verificada_en,
  e.cantidad,
  coalesce(ev.aprobadas, 0) as aprobadas,
  coalesce(ev.rechazadas, 0) as rechazadas,
  e.cantidad - coalesce(ev.aprobadas, 0) - coalesce(ev.rechazadas, 0) as pendiente,
  coalesce(
    pi.id is not null
    and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null
    and p.eliminado_definitivo_en is null
    and p.cancelado_en is null,
    false
  ) as vigente,
  e.folios_calidad as folio_hoja
from public.entregas_produccion e
join public.asignaciones_produccion a on a.id = e.asignacion_id
join public.equipos_produccion q on q.id = a.equipo_id
left join public.informes_calidad ir on ir.id = a.informe_rechazo_id
left join public.planeacion_items pi on pi.id = a.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id
left join lateral (
  select sum(i.cantidad) filter (where i.aprobado) as aprobadas,
         sum(i.cantidad) filter (where not i.aprobado) as rechazadas
  from public.informes_calidad i
  where i.entrega_id = e.id
) ev on true
where e.verificada_en is not null
  and e.anulada_en is null
  and e.rechazada_en is null
  and a.cancelada_en is null;

-- Entregas que esperan la revisión del trabajador de Producción.
create view public.entregas_por_verificar
with (security_invoker = true) as
select
  e.id as entrega_id,
  e.asignacion_id,
  e.fecha_entrega,
  e.registrado_en,
  e.cantidad,
  e.folios_calidad as folio_hoja,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.unidad,
  a.proceso,
  a.equipo_id,
  q.nombre as equipo,
  a.informe_rechazo_id,
  coalesce(
    pi.id is not null
    and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null
    and p.eliminado_definitivo_en is null
    and p.cancelado_en is null,
    false
  ) as vigente
from public.entregas_produccion e
join public.asignaciones_produccion a on a.id = e.asignacion_id
join public.equipos_produccion q on q.id = a.equipo_id
left join public.planeacion_items pi on pi.id = a.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id
where e.verificada_en is null
  and e.rechazada_en is null
  and e.anulada_en is null
  and a.cancelada_en is null;
