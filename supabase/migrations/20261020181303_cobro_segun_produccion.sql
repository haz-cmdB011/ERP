-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.verificado_produccion_variante
-- @verifica function-contiene public.ot_contra_cobrado verificado_produccion_variante
-- @verifica function-contiene public.recibo_contra_calidad verificado_produccion_variante

-- ============================================================================
-- Estimaciones cobra según lo que liberó Producción (20 oct 2026).
--
-- Calidad no revisa cada proceso por lotes: revisa el mueble completo y solo
-- entra a un proceso cuando encuentra una falla. Con eso "Calidad aprobó" de
-- Armado o Acabados casi nunca sube, "Listo para cobrar" se quedaba en cero y
-- los recibos salían marcados como "cobrado sin aprobación de Calidad" aunque
-- el trabajo estuviera hecho. Se desvincula PARCIALMENTE Estimaciones de
-- Calidad, de forma reversible:
--
-- 1. Ajuste `cobro_segun_produccion` (ajustes_flujo), ENCENDIDO: la base para
--    cobrar es lo que Producción verificó (preaprobó al registrar la entrega).
--    Apagado, vuelve a ser lo que aprobó Calidad, como hasta hoy. Lo lee la
--    app (src/lib/calidad/ajustes-flujo.ts); la base solo entrega los dos datos.
--        update public.ajustes_flujo set activo = false, actualizado_en = now()
--          where clave = 'cobro_segun_produccion';
--
-- 2. verificado_produccion_variante: por O.T. y variante, las piezas que
--    Producción verificó por área (barniz → Acabados, armado → Armado), con las
--    mismas reglas que aprobado_calidad_variante:
--      * solo muebles padre asignados en el sistema; los equipos de planta no
--        cuentan (no cobran recibo);
--      * no cuentan los retrabajos (ni de lotes de Calidad ni de la revisión
--        final): rehacen piezas ya entregadas una vez;
--      * cada pasada de un proceso repetido suma (Armado → Barniz → Armado).
--    Un COMPONENTE (hijo) no se asigna solo: se da por liberado en la misma
--    proporción que su mueble (hijo × verificado del padre / cantidad del
--    padre, a lo más una vez y redondeado hacia abajo).
--
-- 3. ot_contra_cobrado y recibo_contra_calidad entregan también lo verificado
--    por Producción. Lo de Calidad se sigue entregando (informativo).
--
-- 4. Corrección: ot_contra_cobrado daba 0 en "Calidad aprobó" a un mueble que
--    nunca pasó por Producción en el sistema (O.T. anteriores), así que lo
--    cobrado salía como "sin aprobación". Ahora es null (sin dato), como ya
--    hacía recibo_contra_calidad y como dice la regla.
--
-- Solo lectura salvo el ajuste nuevo. Compatible en ambos sentidos: la app
-- anterior ignora las columnas nuevas y la nueva, sin esta migración, cobra
-- según Calidad.
-- ============================================================================

-- 1. Ajuste ----------------------------------------------------------------------
insert into public.ajustes_flujo (clave, activo) values ('cobro_segun_produccion', true)
on conflict (clave) do nothing;

-- 2. Lo que Producción verificó, por OT y variante (uso interno) ------------------
create or replace function public.verificado_produccion_variante(p_ot text default null)
returns table (
  ot text, clave text, vclave text, componente boolean,
  verificado_acabados numeric, verificado_armado numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with padres as (
    select pi.id, pi.cantidad_total,
      public.ot_clave(p.numero_pedido) as ot,
      public.norm_modelo(pi.modelo) as clave,
      public.norm_descripcion(pi.descripcion) as vclave,
      (pi.estado_revision is not distinct from 'cancelado' or pi.eliminacion_solicitada_en is not null) as fuera,
      coalesce(sum(l.cantidad) filter (where l.proceso = 'barniz'), 0) as acabados,
      coalesce(sum(l.cantidad) filter (where l.proceso = 'armado'), 0) as armado
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    -- Entregas verificadas (lotes_calidad = verificadas, sin anular ni rechazar)
    -- de equipos que no son de planta. Sin retrabajos.
    left join lateral (
      select lc.cantidad, lc.proceso
      from public.lotes_calidad lc
      join public.equipos_produccion q on q.id = lc.equipo_id
      join public.asignaciones_produccion la on la.id = lc.asignacion_id
      where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
        and la.informe_rechazo_id is null and la.revision_final_rechazo_id is null
    ) l on true
    where pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.planeacion_item_id = pi.id and a.cancelada_en is null
      )
      and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
    group by pi.id, p.numero_pedido
  )
  select x.ot, x.clave, x.vclave, false, sum(x.acabados), sum(x.armado)
  from padres x
  group by 1, 2, 3
  union all
  -- Componentes: la proporción de su mueble que Producción ya verificó (una vez).
  select x.ot, public.norm_modelo(h.modelo), public.norm_descripcion(h.descripcion), true,
    sum(floor(h.cantidad_total * least(x.acabados, x.cantidad_total) / x.cantidad_total)),
    sum(floor(h.cantidad_total * least(x.armado, x.cantidad_total) / x.cantidad_total))
  from public.planeacion_items h
  join padres x on x.id = h.parent_item_id and not x.fuera and x.cantidad_total > 0
  where h.tipo_registro = 'FU'
    and (h.estado_revision is null or h.estado_revision <> 'cancelado')
    and h.eliminacion_solicitada_en is null
  group by 1, 2, 3;
$$;

revoke execute on function public.verificado_produccion_variante(text) from public, anon, authenticated;

-- 3 y 4. PM contra cobrado: también lo verificado por Producción ---------------------
-- Cambia el tipo de retorno (dos columnas al final): se recrea.
drop function public.ot_contra_cobrado(text);

create function public.ot_contra_cobrado(p_ot text default null)
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
set search_path = ''
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
          filter (where public.descripcion_incluye_iluminacion(pi.descripcion)), 0) as cantidad_ilum,
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
    pm_hijos as (
      select po.ot, public.norm_modelo(pi.modelo) as clave,
        public.norm_descripcion(pi.descripcion) as vclave,
        min(pi.modelo) as modelo,
        split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1) as descripcion,
        sum(pi.cantidad_total) as cantidad,
        0::numeric as cantidad_ilum,
        true as es_componente, min(pi.item_code)::text as item_codigo, min(pi.tipo_material) as material,
        min(pa.modelo) as padre_modelo,
        sum(pi.cantidad_total) as cantidad_acabados,
        sum(pi.cantidad_total) as cantidad_armado
      from public.planeacion_items pi
      join public.planeacion_items pa on pa.id = pi.parent_item_id
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
      join pedidos_ot po on po.id = pv.pedido_id
      where pi.tipo_registro = 'FU' and pi.parent_item_id is not null
        and btrim(coalesce(pi.modelo, '')) <> ''
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
        and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
        and pa.eliminacion_solicitada_en is null
      group by po.ot, public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion)
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

-- 3. Un recibo contra lo aprobado por Calidad y lo verificado por Producción ---------
-- Cambia el tipo de retorno (una columna al final): se recrea.
drop function public.recibo_contra_calidad(text, uuid);

create function public.recibo_contra_calidad(p_tipo text, p_recibo_id uuid)
returns table(
  renglon_id uuid,
  numero integer,
  modelo text,
  descripcion text,
  es_componente boolean,
  cantidad numeric,
  acumulado numeric,
  aprobado numeric,
  verificado numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if not public.is_estimaciones() then
    raise exception 'Solo el personal de Estimaciones puede consultar lo aprobado por Calidad.';
  end if;
  -- Electrificación no se compara (Producción no la asigna).
  if p_tipo is null or p_tipo not in ('acabados', 'armado') then
    return;
  end if;

  return query
    with rc as (
      select r.id, r.tipo, r.creado_en, public.ot_clave(r.ot) as ot
      from public.recibos r
      where r.id = p_recibo_id and r.tipo = p_tipo
    ),
    lineas as (
      select g.id, g.numero, g.modelo, g.descripcion_pm, g.cantidad,
        rc.id as recibo_id, rc.ot, rc.tipo, rc.creado_en,
        public.norm_modelo(g.modelo) as clave,
        public.norm_descripcion(g.descripcion_pm) as vclave
      from public.renglones g
      join rc on rc.id = g.recibo_id
      where g.tipo_trabajo <> 'reproceso' and g.descripcion_pm is not null
    ),
    ap as (
      select a.ot, a.clave, a.vclave,
        bool_and(a.componente) as componente,
        sum(a.aprobado_acabados) as acabados, sum(a.aprobado_armado) as armado
      from public.aprobado_calidad_variante((select min(rc.ot) from rc)) a
      group by a.ot, a.clave, a.vclave
    ),
    vp as (
      select v.ot, v.clave, v.vclave,
        bool_and(v.componente) as componente,
        sum(v.verificado_acabados) as acabados, sum(v.verificado_armado) as armado
      from public.verificado_produccion_variante((select min(rc.ot) from rc)) v
      group by v.ot, v.clave, v.vclave
    )
    select l.id, l.numero, l.modelo,
      split_part(btrim(l.descripcion_pm), E'\n', 1),
      coalesce(ap.componente, vp.componente, false),
      l.cantidad,
      -- Lo cobrado de la variante en el área, hasta este renglón (por fecha del
      -- recibo y número de renglón), sin cancelados ni reprocesos.
      (
        select coalesce(sum(g2.cantidad), 0)
        from public.renglones g2
        join public.recibos r2 on r2.id = g2.recibo_id
        where r2.estado <> 'cancelado' and r2.tipo = l.tipo
          and public.ot_clave(r2.ot) = l.ot
          and g2.tipo_trabajo <> 'reproceso' and g2.descripcion_pm is not null
          and public.norm_modelo(g2.modelo) = l.clave
          and public.norm_descripcion(g2.descripcion_pm) = l.vclave
          and (
            r2.creado_en < l.creado_en
            or (r2.id = l.recibo_id and g2.numero <= l.numero)
            or (r2.creado_en = l.creado_en and r2.id < l.recibo_id)
          )
      ),
      -- null: la variante no está en el PM o no pasó por Producción en el sistema.
      case when ap.ot is null then null
           when l.tipo = 'acabados' then ap.acabados
           else ap.armado end,
      case when vp.ot is null then null
           when l.tipo = 'acabados' then vp.acabados
           else vp.armado end
    from lineas l
    left join ap on ap.ot = l.ot and ap.clave = l.clave and ap.vclave = l.vclave
    left join vp on vp.ot = l.ot and vp.clave = l.clave and vp.vclave = l.vclave
    order by l.numero;
end;
$function$;

revoke execute on function public.recibo_contra_calidad(text, uuid) from public, anon;
grant execute on function public.recibo_contra_calidad(text, uuid) to authenticated;
