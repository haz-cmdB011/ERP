-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.veces_proceso_ruta
-- @verifica function public.cantidad_pm_variante_area
-- @verifica function public.cantidad_pm_ot_area
-- @verifica function-contiene public.est_conciliar_renglon_pm cantidad_pm_variante_area
-- @verifica function-contiene public.est_conciliar_renglon_pm cantidad_pm_ot_area
-- @verifica function-contiene public.listar_modelos_ot_recibos veces_proceso_ruta
-- @verifica function-contiene public.ot_contra_cobrado cantidad_pm_armado

-- ============================================================================
-- Estimaciones — un proceso que la ruta repite se cobra cada vez.
--
-- Con la ruta de Producción (migración ruta_produccion) un mueble puede pasar
-- dos veces por Armado o por Barniz (Armado → Barniz → Armado). El usuario
-- confirmó que el maquilador cobra cada pasada. Hasta aquí Estimaciones esperaba
-- la cantidad del PM UNA vez, así que el segundo recibo pedía motivo.
--
-- Ahora lo esperado de un mueble PADRE en un área es:
--     cantidad del PM × veces que la ruta lleva ese proceso
--   * Armado  ← pasos de armado;  Acabados ← pasos de barniz.
--   * Mínimo 1: un mueble sin ruta (o cuya ruta no lleva el proceso) se espera
--     una vez, como antes.
--   * Los componentes (hijos) y Electrificación no cambian (1×).
--
-- Cambia: el control al guardar un renglón (est_conciliar_renglon_pm), la lista
-- de modelos de la captura del recibo (listar_modelos_ot_recibos, su
-- cantidad_pm ya viene por área) y "PM contra cobrado" (ot_contra_cobrado gana
-- cantidad_pm_acabados y cantidad_pm_armado). "Calidad aprobó" ya sumaba cada
-- pasada (un lote por entrega). Sin campos nuevos para el maquilador.
-- Los renglones ya guardados no se vuelven a conciliar.
-- ============================================================================

-- 1. Veces que la ruta lleva el proceso de un área ----------------------------
create or replace function public.veces_proceso_ruta(p_item_id uuid, p_area text)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(1, (
    select count(*)::integer
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id
      and s.retirado_en is null
      and s.proceso = case p_area when 'armado' then 'armado' when 'acabados' then 'barniz' end
  ));
$$;

revoke execute on function public.veces_proceso_ruta(uuid, text) from public, anon, authenticated;

-- 2. Lo declarado por área ------------------------------------------------------
-- Igual que cantidad_pm_variante / cantidad_pm_ot, pero cada mueble padre
-- cuenta tantas veces como su ruta lleve el proceso del área.
create or replace function public.cantidad_pm_variante_area(
  p_ot text, p_modelo text, p_descripcion text, p_area text
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(pi.cantidad_total
             * case when pi.tipo_registro = 'MO' then public.veces_proceso_ruta(pi.id, p_area) else 1 end)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
  left join public.planeacion_items pa on pa.id = pi.parent_item_id
  where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and public.norm_descripcion(pi.descripcion) = public.norm_descripcion(p_descripcion)
    and (
      (pi.tipo_registro = 'MO' and pi.parent_item_id is null)
      -- Un recibo de Acabados o Armado puede cobrar un componente (hijo) suelto;
      -- Electrificación solo cobra muebles padre.
      or (
        p_area is distinct from 'electrificacion'
        and pi.tipo_registro = 'FU' and pi.parent_item_id is not null
        and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
        and pa.eliminacion_solicitada_en is null
      )
    )
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (p_area is distinct from 'electrificacion' or public.descripcion_incluye_iluminacion(pi.descripcion));
$function$;

revoke execute on function public.cantidad_pm_variante_area(text, text, text, text) from public, anon, authenticated;

create or replace function public.cantidad_pm_ot_area(p_ot text, p_modelo text, p_area text)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(pi.cantidad_total * public.veces_proceso_ruta(pi.id, p_area))
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
  where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (p_area is distinct from 'electrificacion' or public.descripcion_incluye_iluminacion(pi.descripcion));
$function$;

revoke execute on function public.cantidad_pm_ot_area(text, text, text) from public, anon, authenticated;

-- 3. Control al guardar un renglón -----------------------------------------------
-- Igual que antes; solo lo declarado (v_pm) sale por área.
create or replace function public.est_conciliar_renglon_pm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_fila jsonb := to_jsonb(new);
  v_area text;
  v_estado text;
  v_ot text;
  v_pm numeric;
  v_acumulada numeric;
  v_motivo text;
begin
  if tg_table_name = 'renglones_electrificacion' then
    v_area := 'electrificacion';
    select estado, public.ot_clave(ot) into v_estado, v_ot
      from public.recibos_electrificacion where id = new.recibo_id;
    if tg_op = 'UPDATE' then
      delete from public.discrepancias_pm where renglon_electrificacion_id = new.id;
    end if;
  else
    select tipo, estado, public.ot_clave(ot) into v_area, v_estado, v_ot
      from public.recibos where id = new.recibo_id;
    if tg_op = 'UPDATE' then
      delete from public.discrepancias_pm where renglon_id = new.id;
    end if;
    -- Un reproceso no gasta saldo del PM.
    if v_fila->>'tipo_trabajo' = 'reproceso' then
      return new;
    end if;
  end if;

  if v_estado = 'cancelado' then
    return new;
  end if;

  -- Uno tras otro por OT + código + área (todas sus variantes): el segundo
  -- espera a que el primero termine y ya cuenta sus piezas.
  perform pg_advisory_xact_lock(hashtextextended(
    'conciliacion_ot:' || v_area || ':' || coalesce(v_ot, '-') || ':'
      || public.norm_modelo(new.modelo), 0));

  if new.descripcion_pm is not null
     and public.cantidad_pm_variante(v_ot, new.modelo, new.descripcion_pm, false) is not null then
    -- La variante está en la OT. En Electrificación, una variante sin
    -- iluminación da null: no está en el PM de Electrificación. Un mueble cuya
    -- ruta repite el proceso del área se espera tantas veces como lo repita.
    v_pm := public.cantidad_pm_variante_area(v_ot, new.modelo, new.descripcion_pm, v_area);
    v_acumulada := public.cantidad_registrada_variante(v_ot, new.modelo, new.descripcion_pm, v_area);
  else
    v_pm := public.cantidad_pm_ot_area(v_ot, new.modelo, v_area);
    v_acumulada := public.cantidad_registrada_ot(v_ot, new.modelo, v_area);
  end if;

  if v_pm is not null and v_acumulada <= v_pm then
    return new;
  end if;

  v_motivo := nullif(btrim(coalesce(new.motivo_descuadre, '')), '');
  if v_motivo is null then
    raise exception
      'Renglón %: la cantidad supera lo declarado en los PM de la OT (o el modelo no está en la OT); captura el motivo.',
      new.numero;
  end if;

  if v_area = 'electrificacion' then
    insert into public.discrepancias_pm (
      area, recibo_electrificacion_id, renglon_electrificacion_id, orden_trabajo, modelo, descripcion_pm,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo, new.descripcion_pm,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid()
    );
  else
    insert into public.discrepancias_pm (
      area, recibo_id, renglon_id, orden_trabajo, modelo, descripcion_pm,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo, new.descripcion_pm,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid()
    );
  end if;
  return new;
end;
$function$;

revoke execute on function public.est_conciliar_renglon_pm() from public, anon, authenticated;

-- 4. Modelos de la captura del recibo --------------------------------------------
-- cantidad_pm ya viene por área (p_tipo): es lo que la pantalla usa como saldo.
create or replace function public.listar_modelos_ot_recibos(
  p_ot text, p_tipo text default null, p_excluir_recibo uuid default null
)
returns table(
  modelo text, cantidad_pm numeric, descripcion text, cantidad_registrada numeric, pms text,
  descripcion_pm text, variantes bigint, es_componente boolean, item_codigo text, material text,
  padre_modelo text
)
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
    select g.modelo, g.cantidad_pm, g.descripcion,
      case when p_tipo is null then 0::numeric
           else public.cantidad_registrada_variante(
             p_ot, g.modelo, g.descripcion_pm, p_tipo, p_excluir_recibo) end,
      g.pms, g.descripcion_pm,
      -- Las variantes de un código son las de sus muebles padre (un componente
      -- comparte código con su mueble y no cuenta como variante).
      case when g.es_componente then 1::bigint
           else count(*) filter (where not g.es_componente)
                  over (partition by public.norm_modelo(g.modelo)) end,
      g.es_componente, g.item_codigo, g.material, g.padre_modelo
    from (
      select min(pi.modelo) as modelo,
        -- Un mueble cuya ruta repite el proceso del área se espera cada vez.
        sum(pi.cantidad_total
            * case when pi.tipo_registro = 'MO' then public.veces_proceso_ruta(pi.id, p_tipo) else 1 end)
          as cantidad_pm,
        split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1) as descripcion,
        string_agg(distinct p.numero_pedido, ', ' order by p.numero_pedido) as pms,
        min(btrim(coalesce(pi.descripcion, ''))) as descripcion_pm,
        (pi.tipo_registro = 'FU') as es_componente,
        case when pi.tipo_registro = 'FU' then min(pi.item_code)::text end as item_codigo,
        case when pi.tipo_registro = 'FU' then min(pi.tipo_material) end as material,
        -- Código del mueble del que es componente (puede ser distinto: M-CONT de M-CONT-M).
        case when pi.tipo_registro = 'FU' then min(pa.modelo) end as padre_modelo
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
      join public.pedidos p on p.id = pv.pedido_id
        and p.eliminado_en is null and p.eliminado_definitivo_en is null
      left join public.planeacion_items pa on pa.id = pi.parent_item_id
      where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
        and btrim(coalesce(pi.modelo, '')) <> ''
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
        and (
          (pi.tipo_registro = 'MO' and pi.parent_item_id is null)
          or (
            pi.tipo_registro = 'FU' and pi.parent_item_id is not null
            and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
            and pa.eliminacion_solicitada_en is null
          )
        )
      group by public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion), pi.tipo_registro
      having coalesce(sum(pi.cantidad_total), 0) > 0
    ) g
    -- Cada componente queda debajo de su mueble.
    order by coalesce(g.padre_modelo, g.modelo), g.es_componente, g.item_codigo nulls first, g.descripcion_pm;
end;
$function$;

-- 5. PM contra cobrado ---------------------------------------------------------------
-- Gana cantidad_pm_acabados y cantidad_pm_armado (lo esperado por área). cantidad_pm
-- sigue siendo la cantidad del PM tal cual. Cambia el tipo de retorno: se recrea.
drop function public.ot_contra_cobrado(text);

create function public.ot_contra_cobrado(p_ot text default null)
returns table(
  orden_trabajo text, proyecto text, num_pms bigint, pms text, modelo text, descripcion text,
  cantidad_pm numeric, cantidad_pm_iluminacion numeric, acabados numeric, armado numeric,
  electrificacion numeric, reprocesos numeric, discrepancias_pendientes bigint, es_componente boolean,
  item_codigo text, material text, aprobado_acabados numeric, aprobado_armado numeric,
  padre_modelo text, cantidad_pm_acabados numeric, cantidad_pm_armado numeric
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
      -- Sin renglón en el PM no hay nada que aprobar: null (no aplica).
      case when pm.ot is null then null else coalesce(ap.acabados, 0) end,
      case when pm.ot is null then null else coalesce(ap.armado, 0) end,
      pm.padre_modelo,
      pm.cantidad_acabados, pm.cantidad_armado
    from pm
    full join cobrado_modelo c on c.ot = pm.ot and c.clave = pm.clave and c.vclave = pm.vclave
    join ots on ots.ot = coalesce(pm.ot, c.ot)
    left join pendientes d
      on d.ot = ots.ot and d.clave = coalesce(pm.clave, c.clave)
      and d.vclave is not distinct from coalesce(pm.vclave, c.vclave)
    left join aprobado ap
      on ap.ot = pm.ot and ap.clave = pm.clave and ap.vclave = pm.vclave
      and ap.componente = pm.es_componente
    order by substring(ots.ot from '-([0-9]{2})$') desc nulls last, ots.ot,
      -- Cada componente queda debajo de su mueble.
      coalesce(pm.padre_modelo, pm.modelo, c.modelo), coalesce(pm.es_componente, false),
      pm.item_codigo nulls first, coalesce(pm.descripcion, c.descripcion);
end;
$function$;

revoke execute on function public.ot_contra_cobrado(text) from public, anon;
grant execute on function public.ot_contra_cobrado(text) to authenticated;
