-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.aprobado_calidad_variante
-- @verifica function public.recibo_contra_calidad
-- @verifica function-contiene public.cantidad_pm_variante componente (hijo)
-- @verifica function-contiene public.listar_modelos_ot_recibos es_componente
-- @verifica function-contiene public.ot_contra_cobrado aprobado_armado

-- ============================================================================
-- Cuadre Planeación → Producción → Calidad → recibos.
--
-- Hasta aquí Estimaciones solo comparaba lo que cobran los maquiladores contra
-- lo que declaró Planeación en los muebles PADRE. Ahora:
--
-- 1. Un recibo de Acabados o Armado puede cobrar un COMPONENTE (hijo) suelto.
--    El mismo campo "Modelo" lista también los hijos del PM (listar_modelos_ot_recibos)
--    y lo cobrado de un hijo se compara contra la cantidad de ese hijo
--    (cantidad_pm_variante). No hay campos nuevos en la captura: el hijo es una
--    variante más (código + descripción), igual que un padre.
--    Electrificación sigue solo con padres con iluminación.
--
-- 2. "PM contra cobrado" (ot_contra_cobrado) trae también los hijos y, por
--    área, lo que Calidad ya aprobó: aprobado_acabados (lotes de barniz) y
--    aprobado_armado (lotes de armado) para los muebles, y el último informe
--    del hijo (se aprueba entero) para los componentes. Los lotes de equipos de
--    planta no cuentan: la planta no cobra recibo. Con eso "listo para cobrar" =
--    aprobado por Calidad - cobrado.
--
-- 3. recibo_contra_calidad: por renglón de un recibo, lo acumulado cobrado hasta
--    ese renglón contra lo aprobado por Calidad, para marcarlo al revisar. Es
--    solo informativo: no bloquea ni pide motivo al maquilador.
--
-- Nada de esto escribe datos: son funciones de lectura.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lo declarado para una variante: padres y, en Acabados/Armado, componentes
-- ---------------------------------------------------------------------------
create or replace function public.cantidad_pm_variante(
  p_ot text, p_modelo text, p_descripcion text, p_solo_iluminacion boolean
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(pi.cantidad_total)
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
      -- Electrificación (p_solo_iluminacion) solo cobra muebles padre.
      or (
        not p_solo_iluminacion
        and pi.tipo_registro = 'FU' and pi.parent_item_id is not null
        and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
        and pa.eliminacion_solicitada_en is null
      )
    )
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (not p_solo_iluminacion or public.descripcion_incluye_iluminacion(pi.descripcion));
$function$;

revoke execute on function public.cantidad_pm_variante(text, text, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lo que Calidad ya aprobó, por OT y variante (uso interno)
--
-- Solo hay fila para lo que Producción asignó a un equipo en el sistema: de un
-- mueble que nunca pasó por Producción (una O.T. anterior) no hay con qué
-- comparar y quien consulta recibe null, no un cero que parezca cobro de más.
-- ---------------------------------------------------------------------------
create or replace function public.aprobado_calidad_variante(p_ot text default null)
returns table(
  ot text, clave text, vclave text, componente boolean,
  aprobado_acabados numeric, aprobado_armado numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  -- Muebles padre asignados a algún equipo: piezas aprobadas por Calidad en lotes
  -- de equipos que no son de planta (la planta no cobra recibo). El barniz se
  -- cobra como Acabados.
  select public.ot_clave(p.numero_pedido), public.norm_modelo(pi.modelo),
    public.norm_descripcion(pi.descripcion), false,
    coalesce(sum(l.aprobadas) filter (where l.proceso = 'barniz'), 0),
    coalesce(sum(l.aprobadas) filter (where l.proceso = 'armado'), 0)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  left join lateral (
    select lc.aprobadas, lc.proceso
    from public.lotes_calidad lc
    join public.equipos_produccion q on q.id = lc.equipo_id
    where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
  ) l on true
  where pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and exists (
      select 1 from public.asignaciones_produccion a
      where a.planeacion_item_id = pi.id and a.cancelada_en is null
    )
    and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  group by 1, 2, 3
  union all
  -- Componentes (hijos) de un mueble asignado: Calidad los aprueba enteros; vale
  -- su último informe.
  select public.ot_clave(p.numero_pedido), public.norm_modelo(pi.modelo),
    public.norm_descripcion(pi.descripcion), true,
    coalesce(sum(pi.cantidad_total) filter (where u.aprobado), 0),
    coalesce(sum(pi.cantidad_total) filter (where u.aprobado), 0)
  from public.planeacion_items pi
  join public.planeacion_items pa on pa.id = pi.parent_item_id
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  left join lateral (
    select ic.aprobado
    from public.informes_calidad ic
    where ic.planeacion_item_id = pi.id
    order by ic.elaborado_en desc, ic.id desc
    limit 1
  ) u on true
  where pi.tipo_registro = 'FU' and pi.parent_item_id is not null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
    and pa.eliminacion_solicitada_en is null
    and exists (
      select 1 from public.asignaciones_produccion a
      where a.planeacion_item_id = pa.id and a.cancelada_en is null
    )
    and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  group by 1, 2, 3;
$function$;

revoke execute on function public.aprobado_calidad_variante(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Lista de modelos de la OT para los recibos: padres y sus componentes
-- ---------------------------------------------------------------------------
drop function if exists public.listar_modelos_ot_recibos(text, text, uuid);
create function public.listar_modelos_ot_recibos(
  p_ot text, p_tipo text default null, p_excluir_recibo uuid default null
)
returns table(
  modelo text, cantidad_pm numeric, descripcion text, cantidad_registrada numeric,
  pms text, descripcion_pm text, variantes bigint,
  es_componente boolean, item_codigo text, material text, padre_modelo text
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
      select min(pi.modelo) as modelo, sum(pi.cantidad_total) as cantidad_pm,
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

revoke execute on function public.listar_modelos_ot_recibos(text, text, uuid) from public, anon;
grant execute on function public.listar_modelos_ot_recibos(text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. PM contra cobrado: componentes y lo aprobado por Calidad
-- ---------------------------------------------------------------------------
drop function if exists public.ot_contra_cobrado(text);
create function public.ot_contra_cobrado(p_ot text default null)
returns table(
  orden_trabajo text,
  proyecto text,
  num_pms bigint,
  pms text,
  modelo text,
  descripcion text,
  cantidad_pm numeric,
  cantidad_pm_iluminacion numeric,
  acabados numeric,
  armado numeric,
  electrificacion numeric,
  reprocesos numeric,
  discrepancias_pendientes bigint,
  es_componente boolean,
  item_codigo text,
  material text,
  aprobado_acabados numeric,
  aprobado_armado numeric,
  padre_modelo text
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
        null::text as padre_modelo
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
        min(pa.modelo) as padre_modelo
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
        h.es_componente, h.item_codigo, h.material, h.padre_modelo
      from pm_padres h
      union all
      -- Un componente con la misma clave que un mueble padre no se repite: gana el padre.
      select c.ot, c.clave, c.vclave, c.modelo, c.descripcion, c.cantidad, c.cantidad_ilum,
        c.es_componente, c.item_codigo, c.material, c.padre_modelo
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
      pm.padre_modelo
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

-- ---------------------------------------------------------------------------
-- 5. Un recibo contra lo que Calidad aprobó (se marca al revisar; no bloquea)
-- ---------------------------------------------------------------------------
create or replace function public.recibo_contra_calidad(p_tipo text, p_recibo_id uuid)
returns table(
  renglon_id uuid,
  numero integer,
  modelo text,
  descripcion text,
  es_componente boolean,
  cantidad numeric,
  acumulado numeric,
  aprobado numeric
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
  -- Electrificación no se compara con Calidad (Producción no la asigna).
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
    )
    select l.id, l.numero, l.modelo,
      split_part(btrim(l.descripcion_pm), E'\n', 1),
      coalesce(ap.componente, false),
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
      -- null: la variante no está en el PM, no hay con qué comparar.
      case when ap.ot is null then null
           when l.tipo = 'acabados' then ap.acabados
           else ap.armado end
    from lineas l
    left join ap on ap.ot = l.ot and ap.clave = l.clave and ap.vclave = l.vclave
    order by l.numero;
end;
$function$;

revoke execute on function public.recibo_contra_calidad(text, uuid) from public, anon;
grant execute on function public.recibo_contra_calidad(text, uuid) to authenticated;