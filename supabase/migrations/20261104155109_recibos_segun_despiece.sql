-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.componentes_recibo_ot
-- @verifica function-contiene public.cantidad_pm_variante componentes_recibo_ot
-- @verifica function-contiene public.cantidad_pm_variante_area componentes_recibo_ot
-- @verifica function-contiene public.listar_modelos_ot_recibos componentes_recibo_ot

-- ============================================================================
-- Estimaciones — los componentes que cobra un recibo salen del despiece de
-- Producción cuando Producción hizo el suyo.
--
-- Hasta aquí un recibo de Acabados/Armado que cobraba un componente suelto se
-- comparaba contra los hijos que Planeación puso en el PM. Ahora, por mueble padre:
--   * Despiece guardado que NO es el sugerido (igual_a_sugerencia = false): sus
--     partes vigentes, cada una = piezas por mueble × cantidad del mueble en el PM.
--     La cantidad del mueble sigue siendo la de Planeación: Producción decide en
--     cuántas partes lo divide, no cuántos muebles hay.
--   * Sin despiece, o con el sugerido tal cual: los hijos del PM, como antes.
-- Una parte ligada a un componente del PM conserva la descripción de ese
-- componente (los recibos ya guardados siguen cuadrando); una parte que agregó el
-- trabajador usa su descripción y el código del mueble.
--
-- Cambia lo que espera el control al guardar un renglón (est_conciliar_renglon_pm,
-- que no se toca: usa cantidad_pm_variante y cantidad_pm_variante_area) y la lista
-- de modelos de la captura (listar_modelos_ot_recibos). Los muebles padre y
-- Electrificación no cambian. Los renglones ya guardados no se vuelven a conciliar.
-- ============================================================================

-- 1. Componentes que un recibo puede cobrar en una OT ----------------------------
create or replace function public.componentes_recibo_ot(p_ot text)
returns table(
  modelo text, descripcion text, cantidad numeric, item_codigo text, material text,
  padre_modelo text, numero_pedido text
)
language sql
stable
set search_path = ''
as $function$
  with padres as (
    select pa.id, pa.modelo, pa.descripcion, pa.cantidad_total, p.numero_pedido,
      exists (
        select 1
        from public.despieces_produccion d
        join public.partes_despiece pd on pd.despiece_id = d.id and pd.retirada_en is null
        where d.planeacion_item_id = pa.id and not d.igual_a_sugerencia
      ) as con_despiece
    from public.planeacion_items pa
    join public.pedido_versiones pv on pv.id = pa.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
    where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
      and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
      and pa.eliminacion_solicitada_en is null
  )
  -- Sin despiece propio: los hijos del PM (mismas reglas que antes).
  select h.modelo, h.descripcion, h.cantidad_total, h.item_code::text, h.tipo_material,
    pa.modelo, pa.numero_pedido
  from padres pa
  join public.planeacion_items h on h.parent_item_id = pa.id
  where not pa.con_despiece
    and h.tipo_registro = 'FU'
    and (h.estado_revision is null or h.estado_revision <> 'cancelado')
    and h.eliminacion_solicitada_en is null
  union all
  -- Despiece propio: sus partes × la cantidad del mueble en el PM.
  -- shortcut: una parte cuenta 1× aunque su ruta repita el proceso (igual que los hijos); multiplicar por su ruta si se cobra cada pasada.
  select coalesce(h.modelo, pa.modelo), coalesce(h.descripcion, pd.descripcion),
    pd.piezas_por_mueble * pa.cantidad_total, h.item_code::text, coalesce(pd.material, h.tipo_material),
    pa.modelo, pa.numero_pedido
  from padres pa
  join public.partes_despiece pd on pd.planeacion_item_id = pa.id and pd.retirada_en is null
  left join public.planeacion_items h on h.id = pd.hijo_id
  where pa.con_despiece
    -- La parte que es el mueble mismo ya se cobra como mueble padre.
    and not (
      public.norm_modelo(coalesce(h.modelo, pa.modelo)) = public.norm_modelo(pa.modelo)
      and public.norm_descripcion(coalesce(h.descripcion, pd.descripcion)) = public.norm_descripcion(pa.descripcion)
    );
$function$;

revoke execute on function public.componentes_recibo_ot(text) from public, anon, authenticated;

-- 2. Lo declarado para una variante -----------------------------------------------
create or replace function public.cantidad_pm_variante(
  p_ot text, p_modelo text, p_descripcion text, p_solo_iluminacion boolean
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(x.cantidad) from (
    select pi.cantidad_total as cantidad
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
    where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
      and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
      and public.norm_descripcion(pi.descripcion) = public.norm_descripcion(p_descripcion)
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (not p_solo_iluminacion or public.admite_electrificacion(pi.id))
    union all
    -- Electrificación (p_solo_iluminacion) solo cobra muebles padre.
    select c.cantidad
    from public.componentes_recibo_ot(p_ot) c
    where not p_solo_iluminacion
      and public.norm_modelo(c.modelo) = public.norm_modelo(p_modelo)
      and public.norm_descripcion(c.descripcion) = public.norm_descripcion(p_descripcion)
  ) x;
$function$;

revoke execute on function public.cantidad_pm_variante(text, text, text, boolean) from public, anon, authenticated;

create or replace function public.cantidad_pm_variante_area(
  p_ot text, p_modelo text, p_descripcion text, p_area text
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(x.cantidad) from (
    -- Un mueble cuya ruta repite el proceso del área se espera cada vez.
    select pi.cantidad_total * public.veces_proceso_ruta(pi.id, p_area) as cantidad
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
    where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
      and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
      and public.norm_descripcion(pi.descripcion) = public.norm_descripcion(p_descripcion)
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (p_area is distinct from 'electrificacion' or public.admite_electrificacion(pi.id))
    union all
    select c.cantidad
    from public.componentes_recibo_ot(p_ot) c
    where p_area is distinct from 'electrificacion'
      and public.norm_modelo(c.modelo) = public.norm_modelo(p_modelo)
      and public.norm_descripcion(c.descripcion) = public.norm_descripcion(p_descripcion)
  ) x;
$function$;

revoke execute on function public.cantidad_pm_variante_area(text, text, text, text) from public, anon, authenticated;

-- 3. Modelos de la captura del recibo ------------------------------------------------
-- Misma salida que antes; los componentes salen de componentes_recibo_ot.
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
        sum(pi.cantidad_total * public.veces_proceso_ruta(pi.id, p_tipo)) as cantidad_pm,
        split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1) as descripcion,
        string_agg(distinct p.numero_pedido, ', ' order by p.numero_pedido) as pms,
        min(btrim(coalesce(pi.descripcion, ''))) as descripcion_pm,
        false as es_componente, null::text as item_codigo, null::text as material,
        null::text as padre_modelo
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
      join public.pedidos p on p.id = pv.pedido_id
        and p.eliminado_en is null and p.eliminado_definitivo_en is null
      where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
        and btrim(coalesce(pi.modelo, '')) <> ''
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
        and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      group by public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion)
      having coalesce(sum(pi.cantidad_total), 0) > 0
      union all
      select min(c.modelo), sum(c.cantidad),
        split_part(min(btrim(coalesce(c.descripcion, ''))), E'\n', 1),
        string_agg(distinct c.numero_pedido, ', ' order by c.numero_pedido),
        min(btrim(coalesce(c.descripcion, ''))),
        true, min(c.item_codigo), min(c.material),
        -- Código del mueble del que es componente (puede ser distinto: M-CONT de M-CONT-M).
        min(c.padre_modelo)
      from public.componentes_recibo_ot(p_ot) c
      where btrim(coalesce(c.modelo, '')) <> ''
      group by public.norm_modelo(c.modelo), public.norm_descripcion(c.descripcion)
      having coalesce(sum(c.cantidad), 0) > 0
    ) g
    -- Cada componente queda debajo de su mueble.
    order by coalesce(g.padre_modelo, g.modelo), g.es_componente, g.item_codigo nulls first, g.descripcion_pm;
end;
$function$;

revoke execute on function public.listar_modelos_ot_recibos(text, text, uuid) from public, anon;
grant execute on function public.listar_modelos_ot_recibos(text, text, uuid) to authenticated;
