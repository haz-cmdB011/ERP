-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.ot_contra_cobrado componentes_recibo_ot

-- ============================================================================
-- Estimaciones — "PM contra cobrado" pasa a medirse contra el PM de Producción.
--
-- Los componentes (hijos) del reporte salían de los hijos que Planeación puso en el
-- PM. Ahora salen de componentes_recibo_ot (migración recibos_segun_despiece), la
-- misma regla que el recibo del maquilador: un mueble con despiece propio de
-- Producción (no el sugerido) muestra sus partes, cada una = piezas por mueble ×
-- cantidad del mueble en el PM; sin despiece o con el sugerido, los hijos del PM
-- como antes. Los muebles padre, lo cobrado, Calidad y Producción no cambian.
--
-- Se reescribe la definición vigente (la de cobro_segun_produccion con el cambio de
-- electrificacion_estimaciones_por_componentes); solo cambia pm_hijos.
-- ============================================================================

create or replace function public.ot_contra_cobrado(p_ot text default null::text)
returns table(
  orden_trabajo text, proyecto text, num_pms bigint, pms text, modelo text, descripcion text,
  cantidad_pm numeric, cantidad_pm_iluminacion numeric, acabados numeric, armado numeric,
  electrificacion numeric, reprocesos numeric, discrepancias_pendientes bigint, es_componente boolean,
  item_codigo text, material text, aprobado_acabados numeric, aprobado_armado numeric,
  padre_modelo text, cantidad_pm_acabados numeric, cantidad_pm_armado numeric,
  verificado_acabados numeric, verificado_armado numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
#variable_conflict use_column
begin
  if not public.is_estimaciones() then
    raise exception 'Solo el personal de Estimaciones puede consultar el PM contra lo cobrado.';
  end if;

  return query
    with pedidos_ot as (
      select p.id, p.numero_pedido, public.ot_clave(p.numero_pedido) as ot, pr.nombre as proyecto
      from public.pedidos p
      left join public.proyectos pr on pr.id = p.proyecto_id
      where p.eliminado_en is null and p.eliminado_definitivo_en is null
        and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
    ),
    ots as (
      select po.ot, mode() within group (order by po.proyecto) as proyecto,
        count(*) as num_pms, string_agg(po.numero_pedido, ', ' order by po.numero_pedido) as pms
      from pedidos_ot po
      group by po.ot
    ),
    pm_padres as (
      select po.ot, public.norm_modelo(pi.modelo) as clave,
        public.norm_descripcion(pi.descripcion) as vclave,
        min(pi.modelo) as modelo,
        split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1) as descripcion,
        sum(pi.cantidad_total) as cantidad,
        coalesce(sum(pi.cantidad_total)
          filter (where public.admite_electrificacion(pi.id)), 0) as cantidad_ilum,
        false as es_componente, null::text as item_codigo, null::text as material,
        null::text as padre_modelo,
        -- Lo esperado por área: cada vez que la ruta lleva el proceso.
        sum(pi.cantidad_total * public.veces_proceso_ruta(pi.id, 'acabados')) as cantidad_acabados,
        sum(pi.cantidad_total * public.veces_proceso_ruta(pi.id, 'armado')) as cantidad_armado
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
      join pedidos_ot po on po.id = pv.pedido_id
      where pi.tipo_registro = 'MO' and pi.parent_item_id is null
        and btrim(coalesce(pi.modelo, '')) <> ''
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
      group by po.ot, public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion)
    ),
    -- Componentes según el PM de Producción: las partes del despiece propio o, sin él,
    -- los hijos del PM (componentes_recibo_ot). Se cobran una vez.
    pm_hijos as (
      select o.ot, public.norm_modelo(c.modelo) as clave,
        public.norm_descripcion(c.descripcion) as vclave,
        min(c.modelo) as modelo,
        split_part(min(btrim(coalesce(c.descripcion, ''))), E'\n', 1) as descripcion,
        sum(c.cantidad) as cantidad,
        0::numeric as cantidad_ilum,
        true as es_componente, min(c.item_codigo) as item_codigo, min(c.material) as material,
        min(c.padre_modelo) as padre_modelo,
        sum(c.cantidad) as cantidad_acabados,
        sum(c.cantidad) as cantidad_armado
      from ots o
      cross join lateral public.componentes_recibo_ot(o.ot) c
      where btrim(coalesce(c.modelo, '')) <> ''
      group by o.ot, public.norm_modelo(c.modelo), public.norm_descripcion(c.descripcion)
    ),
    pm as (
      select h.ot, h.clave, h.vclave, h.modelo, h.descripcion, h.cantidad, h.cantidad_ilum,
        h.es_componente, h.item_codigo, h.material, h.padre_modelo,
        h.cantidad_acabados, h.cantidad_armado
      from pm_padres h
      union all
      -- Un componente con la misma clave que un mueble padre no se repite: gana el padre.
      select c.ot, c.clave, c.vclave, c.modelo, c.descripcion, c.cantidad, c.cantidad_ilum,
        c.es_componente, c.item_codigo, c.material, c.padre_modelo,
        c.cantidad_acabados, c.cantidad_armado
      from pm_hijos c
      where not exists (
        select 1 from pm_padres pp where pp.ot = c.ot and pp.clave = c.clave and pp.vclave = c.vclave
      )
    ),
    aprobado as (
      select a.ot, a.clave, a.vclave, a.componente,
        sum(a.aprobado_acabados) as acabados, sum(a.aprobado_armado) as armado
      from public.aprobado_calidad_variante(p_ot) a
      group by a.ot, a.clave, a.vclave, a.componente
    ),
    verificado as (
      select v.ot, v.clave, v.vclave, v.componente,
        sum(v.verificado_acabados) as acabados, sum(v.verificado_armado) as armado
      from public.verificado_produccion_variante(p_ot) v
      group by v.ot, v.clave, v.vclave, v.componente
    ),
    cobrado as (
      select public.ot_clave(rc.ot) as ot, public.norm_modelo(g.modelo) as clave,
        case when g.descripcion_pm is null then null else public.norm_descripcion(g.descripcion_pm) end as vclave,
        min(g.modelo) as modelo,
        min(split_part(btrim(g.descripcion_pm), E'\n', 1)) as descripcion,
        coalesce(sum(g.cantidad) filter (where rc.tipo = 'acabados' and g.tipo_trabajo <> 'reproceso'), 0) as acabados,
        coalesce(sum(g.cantidad) filter (where rc.tipo = 'armado' and g.tipo_trabajo <> 'reproceso'), 0) as armado,
        0::numeric as electrificacion,
        coalesce(sum(g.cantidad) filter (where g.tipo_trabajo = 'reproceso'), 0) as reprocesos
      from public.renglones g
      join public.recibos rc on rc.id = g.recibo_id
      join ots on ots.ot = public.ot_clave(rc.ot)
      where rc.estado <> 'cancelado'
      group by 1, 2, 3
      union all
      select public.ot_clave(rc.ot), public.norm_modelo(re.modelo),
        case when re.descripcion_pm is null then null else public.norm_descripcion(re.descripcion_pm) end,
        min(re.modelo), min(split_part(btrim(re.descripcion_pm), E'\n', 1)),
        0, 0, sum(re.cantidad), 0
      from public.renglones_electrificacion re
      join public.recibos_electrificacion rc on rc.id = re.recibo_id
      join ots on ots.ot = public.ot_clave(rc.ot)
      where rc.estado <> 'cancelado'
      group by 1, 2, 3
    ),
    cobrado_modelo as (
      select c.ot, c.clave, c.vclave, min(c.modelo) as modelo, min(c.descripcion) as descripcion,
        sum(c.acabados) as acabados, sum(c.armado) as armado,
        sum(c.electrificacion) as electrificacion, sum(c.reprocesos) as reprocesos
      from cobrado c
      group by c.ot, c.clave, c.vclave
    ),
    pendientes as (
      select d.orden_trabajo as ot, public.norm_modelo(d.modelo) as clave,
        case when d.descripcion_pm is null then null else public.norm_descripcion(d.descripcion_pm) end as vclave,
        count(*) as n
      from public.discrepancias_pm d
      where d.estado = 'pendiente'
      group by 1, 2, 3
    )
    select ots.ot, ots.proyecto, ots.num_pms, ots.pms,
      coalesce(pm.modelo, c.modelo), coalesce(pm.descripcion, c.descripcion),
      pm.cantidad, coalesce(pm.cantidad_ilum, 0),
      coalesce(c.acabados, 0), coalesce(c.armado, 0), coalesce(c.electrificacion, 0),
      coalesce(c.reprocesos, 0), coalesce(d.n, 0),
      coalesce(pm.es_componente, false), pm.item_codigo, pm.material,
      -- Sin dato (el mueble no pasó por Producción en el sistema, o el modelo no
      -- está en el PM): null, no un cero que parezca cobro de más.
      ap.acabados, ap.armado,
      pm.padre_modelo,
      pm.cantidad_acabados, pm.cantidad_armado,
      vp.acabados, vp.armado
    from pm
    full join cobrado_modelo c on c.ot = pm.ot and c.clave = pm.clave and c.vclave = pm.vclave
    join ots on ots.ot = coalesce(pm.ot, c.ot)
    left join pendientes d
      on d.ot = ots.ot and d.clave = coalesce(pm.clave, c.clave)
      and d.vclave is not distinct from coalesce(pm.vclave, c.vclave)
    left join aprobado ap
      on ap.ot = pm.ot and ap.clave = pm.clave and ap.vclave = pm.vclave
      and ap.componente = pm.es_componente
    left join verificado vp
      on vp.ot = pm.ot and vp.clave = pm.clave and vp.vclave = pm.vclave
      and vp.componente = pm.es_componente
    order by substring(ots.ot from '-([0-9]{2})$') desc nulls last, ots.ot,
      -- Cada componente queda debajo de su mueble.
      coalesce(pm.padre_modelo, pm.modelo, c.modelo), coalesce(pm.es_componente, false),
      pm.item_codigo nulls first, coalesce(pm.descripcion, c.descripcion);
end;
$function$;

revoke execute on function public.ot_contra_cobrado(text) from public, anon;
grant execute on function public.ot_contra_cobrado(text) to authenticated;
