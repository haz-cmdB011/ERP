-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica sin-function public.listar_ots_pm_recibos
-- @verifica sin-function public.listar_modelos_pm_recibos
-- @verifica sin-function public.listar_ots_pm_electrificacion
-- @verifica sin-function public.listar_modelos_pm_electrificacion
-- @verifica sin-function public.pm_contra_cobrado
-- @verifica sin-function public.cantidad_pm_modelo_recibos
-- @verifica sin-function public.cantidad_registrada_recibos
-- @verifica sin-function public.cantidad_pm_modelo
-- @verifica sin-function public.cantidad_registrada_modelo
-- @verifica function-contiene public.listar_ots_recibos pms_ot
-- @verifica function-contiene public.listar_ots_electrificacion pms_ot

-- Limpieza tras pasar los recibos a OT (20261001194636_recibos_por_ot.sql),
-- ya desplegada la aplicación que usa las funciones nuevas:
--
-- 1. Se borran las funciones por PM que ya nadie usa (la aplicación ni otras
--    funciones; solo se llamaban entre ellas).
-- 2. El proyecto de cada OT en los generadores sale del proyecto más
--    frecuente entre sus PM, igual que en ot_contra_cobrado. Antes se contaba
--    por renglones del PM, así que ganaba el PM con más muebles (en la 193-24,
--    "SOTANO-PH MONTERREY" en vez de "PH MONTERREY") y Electrificación podía
--    mostrar otro.

-- 1. Funciones por PM ------------------------------------------------------------

drop function if exists public.listar_ots_pm_recibos();
drop function if exists public.listar_modelos_pm_recibos(uuid, text, uuid);
drop function if exists public.listar_ots_pm_electrificacion();
drop function if exists public.listar_modelos_pm_electrificacion(uuid, uuid);
drop function if exists public.pm_contra_cobrado(uuid);
drop function if exists public.cantidad_pm_modelo_recibos(uuid, text);
drop function if exists public.cantidad_registrada_recibos(uuid, text, text, uuid);
drop function if exists public.cantidad_pm_modelo(uuid, text);
drop function if exists public.cantidad_registrada_modelo(uuid, text, uuid);

-- 2. Proyecto de la OT -----------------------------------------------------------

create or replace function public.listar_ots_recibos()
returns table(orden_trabajo text, proyecto text, num_pms bigint, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    with pms_ot as (
      select p.id, pv.id as version_id, public.ot_clave(p.numero_pedido) as ot, pr.nombre as proyecto
      from public.pedidos p
      join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
      left join public.proyectos pr on pr.id = p.proyecto_id
      where p.eliminado_en is null
        and p.eliminado_definitivo_en is null
    ),
    ots as (
      select po.ot, mode() within group (order by po.proyecto) as proyecto, count(*) as num_pms
      from pms_ot po
      group by po.ot
    ),
    modelos as (
      select po.ot,
        count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> '') as num_modelos,
        sum(pi.cantidad_total) as piezas
      from pms_ot po
      join public.planeacion_items pi on pi.pedido_version_id = po.version_id
      where pi.tipo_registro = 'MO' and pi.parent_item_id is null
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
      group by po.ot
    )
    select o.ot, o.proyecto, o.num_pms, coalesce(m.num_modelos, 0), coalesce(m.piezas, 0)
    from ots o
    left join modelos m on m.ot = o.ot
    order by substring(o.ot from '-([0-9]{2})$') desc nulls last, o.ot;
end;
$function$;

-- Electrificación: solo las OT con muebles con iluminación; num_pms cuenta los
-- PM que los tienen. El proyecto es el de toda la OT, el mismo que en los otros
-- generadores.
create or replace function public.listar_ots_electrificacion()
returns table(orden_trabajo text, proyecto text, num_pms bigint, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    with pms_ot as (
      select p.id, pv.id as version_id, public.ot_clave(p.numero_pedido) as ot, pr.nombre as proyecto
      from public.pedidos p
      join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
      left join public.proyectos pr on pr.id = p.proyecto_id
      where p.eliminado_en is null
        and p.eliminado_definitivo_en is null
    ),
    ots as (
      select po.ot, mode() within group (order by po.proyecto) as proyecto
      from pms_ot po
      group by po.ot
    ),
    modelos as (
      select po.ot,
        count(distinct po.id) as num_pms,
        count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> '') as num_modelos,
        sum(pi.cantidad_total) as piezas
      from pms_ot po
      join public.planeacion_items pi on pi.pedido_version_id = po.version_id
      where pi.tipo_registro = 'MO' and pi.parent_item_id is null
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
        and public.descripcion_incluye_iluminacion(pi.descripcion)
      group by po.ot
    )
    select o.ot, o.proyecto, m.num_pms, m.num_modelos, m.piezas
    from ots o
    join modelos m on m.ot = o.ot
    order by substring(o.ot from '-([0-9]{2})$') desc nulls last, o.ot;
end;
$function$;
