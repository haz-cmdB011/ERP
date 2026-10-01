-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.ot_clave
-- @verifica function public.cantidad_pm_ot
-- @verifica function public.cantidad_registrada_ot
-- @verifica function public.listar_ots_recibos
-- @verifica function public.listar_modelos_ot_recibos
-- @verifica function public.listar_ots_electrificacion
-- @verifica function public.listar_modelos_ot_electrificacion
-- @verifica function public.ot_contra_cobrado
-- @verifica column public.discrepancias_pm.orden_trabajo
-- @verifica function-contiene public.est_conciliar_renglon_pm cantidad_pm_ot
-- @verifica function-contiene public.pedido_id_por_ot ot_clave

-- Recibos por OT.
--
-- Una OT puede tener muchos PM (ej. 193-24 con 16). Hasta ahora cada recibo
-- de Acabados, Armado y Electrificación se ligaba a UN PM (recibos.pedido_id,
-- renglones_electrificacion.pedido_id) y las piezas se controlaban por PM +
-- modelo + área, así que en el generador había que elegir el PM exacto y un
-- modelo repartido en varios PM no se veía completo. Ahora:
--
-- - El generador elige la OT. Los modelos que ofrece son los de TODOS los PM
--   vigentes de la OT, con su cantidad sumada (y en qué PM vienen).
-- - El control de piezas (trigger est_conciliar_renglon_pm) compara por
--   OT + modelo + área: lo acumulado en recibos vigentes de la OT contra la
--   suma de lo que declararon todos sus PM. Las demás reglas no cambian
--   (padres MO vigentes de la versión activa, reprocesos aparte,
--   Electrificación contra los muebles con iluminación, candado por clave).
-- - La OT de un recibo es recibos.ot / recibos_electrificacion.ot (texto que
--   ya existía). ot_clave() la normaliza, así que un recibo anterior que
--   guardó el número de PM ("2PM193-24") cuenta en su OT ("193-24").
-- - pedido_id_por_ot (la usan las seis funciones de guardado) ahora solo
--   valida que la OT exista y devuelve null: los recibos nuevos ya no se ligan
--   a un PM. Las columnas pedido_id quedan como historia.
-- - discrepancias_pm guarda la OT (orden_trabajo).
-- - ot_contra_cobrado reemplaza a pm_contra_cobrado: por OT y modelo.
--
-- Las funciones por PM (listar_*_pm_*, pm_contra_cobrado, cantidad_*_modelo*)
-- se quedan mientras se despliega la aplicación que usa las nuevas; se borran
-- en una migración posterior.

-- 1. Clave de OT ---------------------------------------------------------------

-- "2PM193-24", "SDC-1 2PM193-24", "PM193-24 SOTANO 1" -> "193-24" (igual que la
-- columna generada pedidos.orden_trabajo); "193-24", "OT 193-24",
-- "193-24-2 ..." -> "193-24"; cualquier otro texto, tal cual en mayúsculas.
create or replace function public.ot_clave(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select coalesce(
    substring(p_texto from '(?i)PM\s*([0-9]+-[0-9]{2})(?![0-9])'),
    substring(p_texto from '(?i)^\s*(?:O\.?\s*T\.?\s*)?([0-9]+-[0-9]{2})(?![0-9])'),
    nullif(upper(btrim(coalesce(p_texto, ''))), '')
  );
$function$;

create index if not exists idx_recibos_ot_clave on public.recibos (public.ot_clave(ot));
create index if not exists idx_recibos_electrificacion_ot_clave
  on public.recibos_electrificacion (public.ot_clave(ot));

-- 2. Cantidades por OT ---------------------------------------------------------

-- Lo que declararon todos los PM vigentes de la OT para un modelo: muebles (MO
-- padres) vigentes de la versión activa. p_solo_iluminacion: la base de
-- Electrificación (solo los muebles con iluminación). null si el modelo no
-- está en la OT.
create or replace function public.cantidad_pm_ot(p_ot text, p_modelo text, p_solo_iluminacion boolean)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(pi.cantidad_total)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
  where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (not p_solo_iluminacion or public.descripcion_incluye_iluminacion(pi.descripcion));
$function$;

-- Lo ya capturado de un modelo en recibos vigentes de la OT en un área. En
-- Acabados y Armado sin reprocesos: una pieza que se vuelve a acabar no es una
-- pieza más del PM.
create or replace function public.cantidad_registrada_ot(
  p_ot text, p_modelo text, p_area text, p_excluir_recibo uuid default null
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select case when p_area = 'electrificacion' then (
    select coalesce(sum(re.cantidad), 0)
    from public.renglones_electrificacion re
    join public.recibos_electrificacion rc on rc.id = re.recibo_id
    where public.ot_clave(rc.ot) = public.ot_clave(p_ot)
      and rc.estado <> 'cancelado'
      and public.norm_modelo(re.modelo) = public.norm_modelo(p_modelo)
      and (p_excluir_recibo is null or rc.id <> p_excluir_recibo)
  ) else (
    select coalesce(sum(g.cantidad), 0)
    from public.renglones g
    join public.recibos rc on rc.id = g.recibo_id
    where public.ot_clave(rc.ot) = public.ot_clave(p_ot)
      and rc.tipo = p_area
      and rc.estado <> 'cancelado'
      and g.tipo_trabajo <> 'reproceso'
      and public.norm_modelo(g.modelo) = public.norm_modelo(p_modelo)
      and (p_excluir_recibo is null or rc.id <> p_excluir_recibo)
  ) end;
$function$;

revoke execute on function public.cantidad_pm_ot(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.cantidad_registrada_ot(text, text, text, uuid) from public, anon, authenticated;

-- 3. Validación de la OT al guardar ------------------------------------------

-- Las seis funciones de guardado (guardar_* y modificar_* de las tres áreas)
-- llaman a esta para ligar el recibo a su PM. Ahora el recibo va por OT: solo
-- se valida que la OT tenga algún PM vigente y se devuelve null (pedido_id
-- queda vacío en los recibos nuevos). Acepta la OT ("193-24") y, por los
-- recibos anteriores, también un número de PM ("2PM193-24").
create or replace function public.pedido_id_por_ot(p_ot text)
returns uuid
language plpgsql
stable
set search_path = ''
as $function$
begin
  if public.ot_clave(p_ot) is null or not exists (
    select 1 from public.pedidos
    where public.ot_clave(numero_pedido) = public.ot_clave(p_ot)
      and eliminado_en is null
      and eliminado_definitivo_en is null
  ) then
    raise exception 'La OT % no está en el PM de Planeación; elige una de la lista.', p_ot;
  end if;
  return null;
end;
$function$;

-- 4. Discrepancias con la OT ---------------------------------------------------

alter table public.discrepancias_pm add column if not exists orden_trabajo text;

update public.discrepancias_pm d set orden_trabajo = public.ot_clave(rc.ot)
  from public.recibos rc
  where rc.id = d.recibo_id and d.orden_trabajo is null;
update public.discrepancias_pm d set orden_trabajo = public.ot_clave(rc.ot)
  from public.recibos_electrificacion rc
  where rc.id = d.recibo_electrificacion_id and d.orden_trabajo is null;

create index if not exists idx_discrepancias_pm_orden_trabajo on public.discrepancias_pm (orden_trabajo);

-- 5. El control: por OT + modelo + área ---------------------------------------

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

  -- Uno tras otro por OT + modelo + área: el segundo espera a que el primero
  -- termine y ya cuenta sus piezas.
  perform pg_advisory_xact_lock(hashtextextended(
    'conciliacion_ot:' || v_area || ':' || coalesce(v_ot, '-') || ':'
      || public.norm_modelo(new.modelo), 0));

  v_pm := public.cantidad_pm_ot(v_ot, new.modelo, v_area = 'electrificacion');
  v_acumulada := public.cantidad_registrada_ot(v_ot, new.modelo, v_area);

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
      area, recibo_electrificacion_id, renglon_electrificacion_id, orden_trabajo, modelo,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid()
    );
  else
    insert into public.discrepancias_pm (
      area, recibo_id, renglon_id, orden_trabajo, modelo,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid()
    );
  end if;
  return new;
end;
$function$;

revoke execute on function public.est_conciliar_renglon_pm() from public, anon, authenticated;

-- 6. OT y modelos para los generadores -----------------------------------------

-- OT con algún PM vigente: proyecto más frecuente, cuántos PM y modelos
-- padre tiene. Las del año más reciente primero.
create or replace function public.listar_ots_recibos()
returns table(orden_trabajo text, proyecto text, num_pms bigint, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select public.ot_clave(p.numero_pedido),
      mode() within group (order by pr.nombre),
      count(distinct p.id),
      count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> ''),
      coalesce(sum(pi.cantidad_total), 0)
    from public.pedidos p
    join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
    left join public.proyectos pr on pr.id = p.proyecto_id
    left join public.planeacion_items pi
      on pi.pedido_version_id = pv.id
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    where p.eliminado_en is null
      and p.eliminado_definitivo_en is null
    group by public.ot_clave(p.numero_pedido)
    order by substring(public.ot_clave(p.numero_pedido) from '-([0-9]{2})$') desc nulls last,
      public.ot_clave(p.numero_pedido);
end;
$function$;

-- Modelos padre (MO) de todos los PM vigentes de la OT: cantidad sumada, primera
-- línea de la descripción, en qué PM vienen y, con p_tipo, lo ya capturado en
-- recibos vigentes de la OT en esa área.
create or replace function public.listar_modelos_ot_recibos(
  p_ot text, p_tipo text default null, p_excluir_recibo uuid default null
)
returns table(modelo text, cantidad_pm numeric, descripcion text, cantidad_registrada numeric, pms text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      min(split_part(btrim(coalesce(pi.descripcion, '')), E'\n', 1)),
      case when p_tipo is null then 0::numeric
           else public.cantidad_registrada_ot(p_ot, min(pi.modelo), p_tipo, p_excluir_recibo) end,
      string_agg(distinct p.numero_pedido, ', ' order by p.numero_pedido)
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$function$;

-- Electrificación: solo las OT y los modelos con iluminación (es lo único que
-- se electrifica).
create or replace function public.listar_ots_electrificacion()
returns table(orden_trabajo text, proyecto text, num_pms bigint, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select public.ot_clave(p.numero_pedido),
      mode() within group (order by pr.nombre),
      count(distinct p.id),
      count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> ''),
      coalesce(sum(pi.cantidad_total), 0)
    from public.pedidos p
    join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
    left join public.proyectos pr on pr.id = p.proyecto_id
    join public.planeacion_items pi
      on pi.pedido_version_id = pv.id
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and public.descripcion_incluye_iluminacion(pi.descripcion)
    where p.eliminado_en is null
      and p.eliminado_definitivo_en is null
    group by public.ot_clave(p.numero_pedido)
    order by substring(public.ot_clave(p.numero_pedido) from '-([0-9]{2})$') desc nulls last,
      public.ot_clave(p.numero_pedido);
end;
$function$;

create or replace function public.listar_modelos_ot_electrificacion(p_ot text, p_excluir_recibo uuid default null)
returns table(modelo text, cantidad_pm numeric, cantidad_registrada numeric, pms text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      public.cantidad_registrada_ot(p_ot, min(pi.modelo), 'electrificacion', p_excluir_recibo),
      string_agg(distinct p.numero_pedido, ', ' order by p.numero_pedido)
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and public.descripcion_incluye_iluminacion(pi.descripcion)
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$function$;

revoke execute on function public.listar_ots_recibos() from public, anon;
grant execute on function public.listar_ots_recibos() to authenticated;
revoke execute on function public.listar_modelos_ot_recibos(text, text, uuid) from public, anon;
grant execute on function public.listar_modelos_ot_recibos(text, text, uuid) to authenticated;
revoke execute on function public.listar_ots_electrificacion() from public, anon;
grant execute on function public.listar_ots_electrificacion() to authenticated;
revoke execute on function public.listar_modelos_ot_electrificacion(text, uuid) from public, anon;
grant execute on function public.listar_modelos_ot_electrificacion(text, uuid) to authenticated;

-- 7. OT contra cobrado ---------------------------------------------------------

-- Por OT y modelo: lo que declararon todos sus PM contra lo capturado en
-- recibos vigentes de Acabados, Armado y Electrificación, con las mismas reglas
-- que el control. Incluye los modelos cobrados que no están en la OT
-- (cantidad_pm null). Solo para el personal de Estimaciones.
create or replace function public.ot_contra_cobrado(p_ot text default null)
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
  discrepancias_pendientes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
-- Las columnas de salida se llaman como columnas de las tablas (modelo,
-- orden_trabajo...): dentro de las consultas manda la columna.
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
    pm as (
      select po.ot, public.norm_modelo(pi.modelo) as clave,
        min(pi.modelo) as modelo,
        min(split_part(btrim(coalesce(pi.descripcion, '')), E'\n', 1)) as descripcion,
        sum(pi.cantidad_total) as cantidad,
        coalesce(sum(pi.cantidad_total)
          filter (where public.descripcion_incluye_iluminacion(pi.descripcion)), 0) as cantidad_ilum
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
      join pedidos_ot po on po.id = pv.pedido_id
      where pi.tipo_registro = 'MO' and pi.parent_item_id is null
        and btrim(coalesce(pi.modelo, '')) <> ''
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
      group by po.ot, public.norm_modelo(pi.modelo)
    ),
    cobrado as (
      select public.ot_clave(rc.ot) as ot, public.norm_modelo(g.modelo) as clave, min(g.modelo) as modelo,
        coalesce(sum(g.cantidad) filter (where rc.tipo = 'acabados' and g.tipo_trabajo <> 'reproceso'), 0) as acabados,
        coalesce(sum(g.cantidad) filter (where rc.tipo = 'armado' and g.tipo_trabajo <> 'reproceso'), 0) as armado,
        0::numeric as electrificacion,
        coalesce(sum(g.cantidad) filter (where g.tipo_trabajo = 'reproceso'), 0) as reprocesos
      from public.renglones g
      join public.recibos rc on rc.id = g.recibo_id
      join ots on ots.ot = public.ot_clave(rc.ot)
      where rc.estado <> 'cancelado'
      group by public.ot_clave(rc.ot), public.norm_modelo(g.modelo)
      union all
      select public.ot_clave(rc.ot), public.norm_modelo(re.modelo), min(re.modelo),
        0, 0, sum(re.cantidad), 0
      from public.renglones_electrificacion re
      join public.recibos_electrificacion rc on rc.id = re.recibo_id
      join ots on ots.ot = public.ot_clave(rc.ot)
      where rc.estado <> 'cancelado'
      group by public.ot_clave(rc.ot), public.norm_modelo(re.modelo)
    ),
    cobrado_modelo as (
      select c.ot, c.clave, min(c.modelo) as modelo,
        sum(c.acabados) as acabados, sum(c.armado) as armado,
        sum(c.electrificacion) as electrificacion, sum(c.reprocesos) as reprocesos
      from cobrado c
      group by c.ot, c.clave
    ),
    pendientes as (
      select d.orden_trabajo as ot, public.norm_modelo(d.modelo) as clave, count(*) as n
      from public.discrepancias_pm d
      where d.estado = 'pendiente'
      group by d.orden_trabajo, public.norm_modelo(d.modelo)
    )
    select ots.ot, ots.proyecto, ots.num_pms, ots.pms,
      coalesce(pm.modelo, c.modelo), pm.descripcion,
      pm.cantidad, coalesce(pm.cantidad_ilum, 0),
      coalesce(c.acabados, 0), coalesce(c.armado, 0), coalesce(c.electrificacion, 0),
      coalesce(c.reprocesos, 0), coalesce(d.n, 0)
    from pm
    full join cobrado_modelo c on c.ot = pm.ot and c.clave = pm.clave
    join ots on ots.ot = coalesce(pm.ot, c.ot)
    left join pendientes d
      on d.ot = ots.ot and d.clave = coalesce(pm.clave, c.clave)
    order by substring(ots.ot from '-([0-9]{2})$') desc nulls last, ots.ot,
      coalesce(pm.modelo, c.modelo);
end;
$function$;

revoke execute on function public.ot_contra_cobrado(text) from public, anon;
grant execute on function public.ot_contra_cobrado(text) to authenticated;
