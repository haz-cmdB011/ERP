-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.descripcion_incluye_iluminacion lamparas?
-- @verifica function public.norm_descripcion
-- @verifica column public.renglones.descripcion_pm
-- @verifica column public.renglones_electrificacion.descripcion_pm
-- @verifica column public.discrepancias_pm.descripcion_pm
-- @verifica constraint public.renglones_electrificacion.renglones_electrificacion_fuente_sugerido_check
-- @verifica function public.cantidad_pm_variante
-- @verifica function public.cantidad_registrada_variante
-- @verifica function public.variante_unica_ot
-- @verifica trigger public.renglones.renglones_completar_variante_pm
-- @verifica trigger public.renglones_electrificacion.renglones_electrificacion_completar_variante_pm
-- @verifica function-contiene public.est_conciliar_renglon_pm cantidad_pm_variante
-- @verifica function-contiene public.listar_modelos_ot_recibos descripcion_pm
-- @verifica function-contiene public.listar_modelos_ot_electrificacion descripcion_pm
-- @verifica function-contiene public.listar_ots_recibos norm_descripcion
-- @verifica function-contiene public.listar_ots_electrificacion norm_descripcion
-- @verifica function-contiene public.ot_contra_cobrado norm_descripcion
-- @verifica function-contiene public.guardar_recibo_acabados descripcionPm
-- @verifica function-contiene public.guardar_recibo_armado descripcionPm
-- @verifica function-contiene public.guardar_recibo_electrificacion descripcionPm
-- @verifica function-contiene public.modificar_recibo_acabados descripcionPm
-- @verifica function-contiene public.modificar_recibo_armado descripcionPm
-- @verifica function-contiene public.modificar_recibo_electrificacion descripcionPm

-- Robustez entre Planeación y Estimaciones.
--
-- 1. Iluminación: un padre se electrifica si su descripción menciona
--    iluminación (como antes) o LED, lámpara, luminaria, foco o spot. El
--    VRG-01 de la 193-24 ("INCLUYE LAMPARA LED") no entraba porque solo se
--    buscaba "ilumina". Se siguen descartando las negaciones ("NO INCLUYE
--    ILUMINACIÓN", "SIN LED", "NO LLEVA LÁMPARA"...). "Tira", "contacto" o
--    "caja eléctrica" no cuentan: la maquila de Electrificación es LED y
--    charolas de drivers.
--
-- 2. Variantes de modelo: el código de modelo solo no identifica al mueble.
--    En la 102-24 "MUEBLE" es cama king, cama queen, macetas y cosmetiquera, y
--    "TIRAS" son tres medidas distintas; el generador las juntaba en una sola
--    opción y sumaba sus piezas. Ahora un modelo de la OT es CÓDIGO +
--    DESCRIPCIÓN del padre: dos padres con el mismo código y la misma
--    descripción (sin importar mayúsculas, acentos, signos ni espacios, ver
--    norm_descripcion) son el mismo modelo aunque vengan en PM distintos; si la
--    descripción cambia, es otro.
--
--    - Cada renglón guarda la descripción del PM que se eligió
--      (descripcion_pm). El control de piezas compara por OT + código +
--      descripción. Si el renglón no trae descripción, o la que trae ya no
--      está en la OT (Planeación corrigió el texto), se compara por código
--      como antes, para no bloquear la captura.
--    - Si el código tiene una sola variante en la OT, la base completa la
--      descripción sola (renglones capturados escribiendo el modelo, recibos
--      anteriores).
--    - cantidad_pm_ot / cantidad_registrada_ot (por código) se quedan: son la
--      regla de respaldo y la usan las pruebas de la base.
--
-- 3. Electrificación acepta la fuente 'precedente' (el precio sugerido sale
--    del último precio pagado del mismo modelo, ver motor-electrificacion.ts).

-- 1. Iluminación ----------------------------------------------------------------

create or replace function public.descripcion_incluye_iluminacion(p_descripcion text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d like '%ilumina%'
      or d ~ '\m(leds?|lamparas?|luminari[ao]s?|focos?|spots?)\M'
  from (
    select regexp_replace(
             regexp_replace(
               translate(lower(coalesce(p_descripcion, '')), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuaeiouu'),
               '\s+', ' ', 'g'),
             '\m(no incluyen?|no llevan?|sin)( (la|el|las|los))? (iluminacion|leds?|lamparas?|luminari[ao]s?|focos?|spots?)\M',
             '', 'g') as d
  ) t;
$$;

-- 2. Variantes ------------------------------------------------------------------

-- Clave de la descripción de un padre: minúsculas, sin acentos, sin espacios ni
-- signos. "Zoclo en lámina de acero al carbón" = "ZOCLO EN LAMINA DE ACERO AL
-- CARBON"; "cama king" <> "cama queen".
create or replace function public.norm_descripcion(p_descripcion text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    lower(translate(coalesce(p_descripcion, ''), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')),
    '[^a-z0-9ñ]', '', 'g');
$$;

alter table public.renglones add column if not exists descripcion_pm text;
alter table public.renglones_electrificacion add column if not exists descripcion_pm text;
alter table public.discrepancias_pm add column if not exists descripcion_pm text;

comment on column public.renglones.descripcion_pm is
  'Descripción del padre del PM elegido (la variante del modelo). null = se concilia solo por código.';
comment on column public.renglones_electrificacion.descripcion_pm is
  'Descripción del padre del PM elegido (la variante del modelo). null = se concilia solo por código.';

-- Lo que declararon los PM vigentes de la OT para una variante (código +
-- descripción). null si la variante no está en la OT.
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
  where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and public.norm_descripcion(pi.descripcion) = public.norm_descripcion(p_descripcion)
    and pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (not p_solo_iluminacion or public.descripcion_incluye_iluminacion(pi.descripcion));
$function$;

-- Lo ya capturado de una variante en recibos vigentes de la OT en un área (sin
-- reprocesos en Acabados y Armado).
create or replace function public.cantidad_registrada_variante(
  p_ot text, p_modelo text, p_descripcion text, p_area text, p_excluir_recibo uuid default null
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
      and re.descripcion_pm is not null
      and public.norm_descripcion(re.descripcion_pm) = public.norm_descripcion(p_descripcion)
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
      and g.descripcion_pm is not null
      and public.norm_descripcion(g.descripcion_pm) = public.norm_descripcion(p_descripcion)
      and (p_excluir_recibo is null or rc.id <> p_excluir_recibo)
  ) end;
$function$;

-- La descripción de la única variante del código en la OT; null si tiene
-- varias o ninguna. p_solo_iluminacion: entre los padres con iluminación.
create or replace function public.variante_unica_ot(p_ot text, p_modelo text, p_solo_iluminacion boolean)
returns text
language sql
stable
set search_path = ''
as $function$
  select case when count(distinct public.norm_descripcion(pi.descripcion)) = 1
              then min(btrim(coalesce(pi.descripcion, ''))) end
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

revoke execute on function public.cantidad_pm_variante(text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.cantidad_registrada_variante(text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.variante_unica_ot(text, text, boolean) from public, anon, authenticated;

-- Recibos anteriores: los renglones cuyo código tiene una sola variante en su
-- OT quedan ligados a ella. Los demás siguen conciliándose por código.
update public.renglones g
  set descripcion_pm = public.variante_unica_ot(rc.ot, g.modelo, false)
  from public.recibos rc
  where rc.id = g.recibo_id and g.descripcion_pm is null
    and public.variante_unica_ot(rc.ot, g.modelo, false) is not null;

update public.renglones_electrificacion re
  set descripcion_pm = public.variante_unica_ot(rc.ot, re.modelo, true)
  from public.recibos_electrificacion rc
  where rc.id = re.recibo_id and re.descripcion_pm is null
    and public.variante_unica_ot(rc.ot, re.modelo, true) is not null;

-- Antes de guardar un renglón: si no trae descripción, o la que trae ya no está
-- en la OT, y el código tiene una sola variante, se liga a esa.
create or replace function public.est_completar_variante_pm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ot text;
  v_ilum boolean := tg_table_name = 'renglones_electrificacion';
  v_unica text;
begin
  if v_ilum then
    select ot into v_ot from public.recibos_electrificacion where id = new.recibo_id;
  else
    select ot into v_ot from public.recibos where id = new.recibo_id;
  end if;

  if new.descripcion_pm is not null
     and public.cantidad_pm_variante(v_ot, new.modelo, new.descripcion_pm, false) is not null then
    return new;
  end if;

  v_unica := public.variante_unica_ot(v_ot, new.modelo, v_ilum);
  if v_unica is not null then
    new.descripcion_pm := v_unica;
  end if;
  return new;
end;
$function$;

revoke execute on function public.est_completar_variante_pm() from public, anon, authenticated;

drop trigger if exists renglones_completar_variante_pm on public.renglones;
create trigger renglones_completar_variante_pm
  before insert or update of modelo, descripcion_pm on public.renglones
  for each row execute function public.est_completar_variante_pm();

drop trigger if exists renglones_electrificacion_completar_variante_pm on public.renglones_electrificacion;
create trigger renglones_electrificacion_completar_variante_pm
  before insert or update of modelo, descripcion_pm on public.renglones_electrificacion
  for each row execute function public.est_completar_variante_pm();

-- El control: por OT + variante + área; por OT + código si el renglón no trae
-- una variante de la OT.
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
    -- iluminación da null: no está en el PM de Electrificación.
    v_pm := public.cantidad_pm_variante(v_ot, new.modelo, new.descripcion_pm, v_area = 'electrificacion');
    v_acumulada := public.cantidad_registrada_variante(v_ot, new.modelo, new.descripcion_pm, v_area);
  else
    v_pm := public.cantidad_pm_ot(v_ot, new.modelo, v_area = 'electrificacion');
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

-- Cambiar la variante de un renglón también lo vuelve a conciliar.
drop trigger if exists trg_conciliar_renglon_pm on public.renglones;
create trigger trg_conciliar_renglon_pm
  after insert or update of modelo, descripcion_pm, cantidad, tipo_trabajo, motivo_descuadre on public.renglones
  for each row execute function public.est_conciliar_renglon_pm();

drop trigger if exists trg_conciliar_renglon_electrificacion_pm on public.renglones_electrificacion;
create trigger trg_conciliar_renglon_electrificacion_pm
  after insert or update of modelo, descripcion_pm, cantidad, motivo_descuadre on public.renglones_electrificacion
  for each row execute function public.est_conciliar_renglon_pm();

-- 3. OT y modelos para los generadores ------------------------------------------

-- Un modelo por variante (código + descripción) de todos los PM vigentes de la
-- OT. descripcion: primera línea, para la lista; descripcion_pm: el texto
-- completo, que es lo que guarda el renglón; variantes: cuántas variantes tiene
-- ese código en la OT (más de una = hay que fijarse en la descripción).
drop function if exists public.listar_modelos_ot_recibos(text, text, uuid);
create function public.listar_modelos_ot_recibos(
  p_ot text, p_tipo text default null, p_excluir_recibo uuid default null
)
returns table(
  modelo text, cantidad_pm numeric, descripcion text, cantidad_registrada numeric, pms text,
  descripcion_pm text, variantes bigint
)
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
      split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1),
      case when p_tipo is null then 0::numeric
           else public.cantidad_registrada_variante(
             p_ot, min(pi.modelo), min(btrim(coalesce(pi.descripcion, ''))), p_tipo, p_excluir_recibo) end,
      string_agg(distinct p.numero_pedido, ', ' order by p.numero_pedido),
      min(btrim(coalesce(pi.descripcion, ''))),
      count(*) over (partition by public.norm_modelo(pi.modelo))
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    group by public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion)
    having coalesce(sum(pi.cantidad_total), 0) > 0
    order by min(pi.modelo), min(btrim(coalesce(pi.descripcion, '')));
end;
$function$;

drop function if exists public.listar_modelos_ot_electrificacion(text, uuid);
create function public.listar_modelos_ot_electrificacion(p_ot text, p_excluir_recibo uuid default null)
returns table(
  modelo text, cantidad_pm numeric, cantidad_registrada numeric, pms text,
  descripcion text, descripcion_pm text, variantes bigint
)
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
      public.cantidad_registrada_variante(
        p_ot, min(pi.modelo), min(btrim(coalesce(pi.descripcion, ''))), 'electrificacion', p_excluir_recibo),
      string_agg(distinct p.numero_pedido, ', ' order by p.numero_pedido),
      split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1),
      min(btrim(coalesce(pi.descripcion, ''))),
      count(*) over (partition by public.norm_modelo(pi.modelo))
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
    group by public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion)
    having coalesce(sum(pi.cantidad_total), 0) > 0
    order by min(pi.modelo), min(btrim(coalesce(pi.descripcion, '')));
end;
$function$;

revoke execute on function public.listar_modelos_ot_recibos(text, text, uuid) from public, anon;
grant execute on function public.listar_modelos_ot_recibos(text, text, uuid) to authenticated;
revoke execute on function public.listar_modelos_ot_electrificacion(text, uuid) from public, anon;
grant execute on function public.listar_modelos_ot_electrificacion(text, uuid) to authenticated;

-- num_modelos cuenta variantes (lo mismo que ofrece la lista de modelos).
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
        count(distinct public.norm_modelo(pi.modelo) || '|' || public.norm_descripcion(pi.descripcion))
          filter (where btrim(coalesce(pi.modelo, '')) <> '') as num_modelos,
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
        count(distinct public.norm_modelo(pi.modelo) || '|' || public.norm_descripcion(pi.descripcion))
          filter (where btrim(coalesce(pi.modelo, '')) <> '') as num_modelos,
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

-- 4. OT contra cobrado: por variante ---------------------------------------------

-- Una fila por OT + variante del PM. Lo cobrado se suma a su variante; lo
-- cobrado sin variante de la OT (código fuera del PM, o recibos anteriores con
-- un código de varias variantes) queda en su propia fila con cantidad_pm null.
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
        public.norm_descripcion(pi.descripcion) as vclave,
        min(pi.modelo) as modelo,
        split_part(min(btrim(coalesce(pi.descripcion, ''))), E'\n', 1) as descripcion,
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
      group by po.ot, public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion)
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
      coalesce(c.reprocesos, 0), coalesce(d.n, 0)
    from pm
    full join cobrado_modelo c on c.ot = pm.ot and c.clave = pm.clave and c.vclave = pm.vclave
    join ots on ots.ot = coalesce(pm.ot, c.ot)
    left join pendientes d
      on d.ot = ots.ot and d.clave = coalesce(pm.clave, c.clave)
      and d.vclave is not distinct from coalesce(pm.vclave, c.vclave)
    order by substring(ots.ot from '-([0-9]{2})$') desc nulls last, ots.ot,
      coalesce(pm.modelo, c.modelo), coalesce(pm.descripcion, c.descripcion);
end;
$function$;

revoke execute on function public.ot_contra_cobrado(text) from public, anon;
grant execute on function public.ot_contra_cobrado(text) to authenticated;

-- 5. Electrificación: fuente 'precedente' ----------------------------------------

alter table public.renglones_electrificacion
  drop constraint if exists renglones_electrificacion_fuente_sugerido_check;
alter table public.renglones_electrificacion
  add constraint renglones_electrificacion_fuente_sugerido_check
  check (fuente_sugerido in ('parametrico', 'precedente', 'manual'));

-- 6. Guardado: cada renglón trae la descripción de la variante (descripcionPm) --
-- Mismas funciones que 20260930191049_control_pm_recibos.sql con la columna
-- descripcion_pm. '' es una variante válida (padre sin descripción); null o
-- ausente = sin variante.
create or replace function public.guardar_recibo_acabados(p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;

  select id, estado into v_recibo_id, v_estado
    from public.recibos where folio = p_folio and tipo = 'acabados' and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos (
        folio, tipo, fecha_recibo, contratista, obra, ot, pedido_id, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, 'acabados', p_fecha_recibo, v_contratista, nullif(p_obra, ''), btrim(p_ot),
        public.pedido_id_por_ot(p_ot), p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre, descripcion_pm
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      nullif(r->>'acabado', ''),
      nullif(r->>'acabado2', ''),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      coalesce(
        (select array_agg(f) from jsonb_array_elements_text(coalesce(r->'fases', '[]'::jsonb)) f),
        '{}'
      ),
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else (r->>'fuente')::public.est_fuente_sugerido end,
      coalesce((r->>'sinTamano')::boolean, false),
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), ''),
      btrim(r->>'descripcionPm')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('acabados', v_recibo_id);
  return v_recibo_id;
end;
$function$;

create or replace function public.guardar_recibo_armado(p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;

  select id, estado into v_recibo_id, v_estado
    from public.recibos where folio = p_folio and tipo = 'armado' and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos (
        folio, tipo, fecha_recibo, contratista, obra, ot, pedido_id, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, 'armado', p_fecha_recibo, v_contratista, nullif(p_obra, ''), btrim(p_ot),
        public.pedido_id_por_ot(p_ot), p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado') then
      raise exception 'Renglón %: falta el tipo de armado (Natural o Laminado).',
        v_siguiente_numero;
    end if;

    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, colocacion_herrajes, tipo_trabajo,
      causa_reproceso, cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano,
      pu_propuesto, pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre, descripcion_pm
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      r->>'tipoArmado',
      coalesce((r->>'colocacionHerrajes')::boolean, false),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else (r->>'fuente')::public.est_fuente_sugerido end,
      coalesce((r->>'sinTamano')::boolean, false),
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), ''),
      btrim(r->>'descripcionPm')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('armado', v_recibo_id);
  return v_recibo_id;
end;
$function$;

create or replace function public.modificar_recibo_acabados(p_recibo_id uuid, p_fecha_recibo date, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  r jsonb;
begin
  if not public.is_maquilador() then
    raise exception 'Solo el maquilador que capturó el recibo puede modificarlo.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select capturado_por, estado into v_capturado_por, v_estado
    from public.recibos where id = p_recibo_id and tipo = 'acabados';
  if v_estado is null or v_capturado_por is distinct from auth.uid() then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede modificar un recibo pendiente de revisión.';
  end if;

  select count(*) into v_decididos from public.renglones
    where recibo_id = p_recibo_id and decision is not null;
  if v_decididos > 0 then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  update public.recibos set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = btrim(p_ot),
    pedido_id = public.pedido_id_por_ot(p_ot),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  -- Borra también sus discrepancias (cascade): se vuelven a evaluar con lo
  -- que se guarda ahora.
  delete from public.renglones where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre, descripcion_pm
    ) values (
      p_recibo_id,
      v_numero,
      r->>'modelo',
      r->>'familia',
      nullif(r->>'acabado', ''),
      nullif(r->>'acabado2', ''),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      coalesce(
        (select array_agg(f) from jsonb_array_elements_text(coalesce(r->'fases', '[]'::jsonb)) f),
        '{}'
      ),
      null,
      'manual',
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      0,
      null,
      null,
      nullif(r->>'nota', ''),
      null,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), ''),
      btrim(r->>'descripcionPm')
    );
    v_numero := v_numero + 1;
  end loop;
end;
$function$;

create or replace function public.modificar_recibo_armado(p_recibo_id uuid, p_fecha_recibo date, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  r jsonb;
begin
  if not public.is_maquilador() then
    raise exception 'Solo el maquilador que capturó el recibo puede modificarlo.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select capturado_por, estado into v_capturado_por, v_estado
    from public.recibos where id = p_recibo_id and tipo = 'armado';
  if v_estado is null or v_capturado_por is distinct from auth.uid() then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede modificar un recibo pendiente de revisión.';
  end if;

  select count(*) into v_decididos from public.renglones
    where recibo_id = p_recibo_id and decision is not null;
  if v_decididos > 0 then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  update public.recibos set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = btrim(p_ot),
    pedido_id = public.pedido_id_por_ot(p_ot),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  -- Borra también sus discrepancias (cascade): se vuelven a evaluar con lo
  -- que se guarda ahora.
  delete from public.renglones where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado') then
      raise exception 'Renglón %: falta el tipo de armado (Natural o Laminado).', v_numero;
    end if;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, colocacion_herrajes, tipo_trabajo,
      causa_reproceso, cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano,
      pu_propuesto, pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre, descripcion_pm
    ) values (
      p_recibo_id,
      v_numero,
      r->>'modelo',
      r->>'familia',
      r->>'tipoArmado',
      coalesce((r->>'colocacionHerrajes')::boolean, false),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      null,
      'manual',
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      0,
      null,
      null,
      nullif(r->>'nota', ''),
      null,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), ''),
      btrim(r->>'descripcionPm')
    );
    v_numero := v_numero + 1;
  end loop;
end;
$function$;

create or replace function public.guardar_recibo_electrificacion(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_renglon_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_num_charola integer;
  v_aceptado numeric;
  v_propuesto numeric;
  v_pedido_id uuid;
  r jsonb;
  c jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;
  v_pedido_id := public.pedido_id_por_ot(p_ot);

  select id, estado into v_recibo_id, v_estado
    from public.recibos_electrificacion where folio = p_folio and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos_electrificacion (
        folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, p_fecha_recibo, v_contratista, nullif(p_obra, ''), btrim(p_ot),
        p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones_electrificacion where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    -- La conciliación con el PM la hace el trigger trg_conciliar_renglon_electrificacion_pm.
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id, motivo_descuadre, descripcion_pm
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      coalesce((r->>'cantidad')::numeric, 1),
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else r->>'fuente' end,
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end,
      v_pedido_id,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), ''),
      btrim(r->>'descripcionPm')
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('electrificacion', v_recibo_id);
  return v_recibo_id;
end;
$function$;

create or replace function public.modificar_recibo_electrificacion(
  p_recibo_id uuid,
  p_fecha_recibo date,
  p_obra text,
  p_ot text,
  p_prioridad public.est_prioridad,
  p_motivo_prioridad text,
  p_renglones jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  v_num_charola integer;
  v_renglon_id uuid;
  v_pedido_id uuid;
  r jsonb;
  c jsonb;
begin
  if not public.is_maquilador() then
    raise exception 'Solo el maquilador que capturó el recibo puede modificarlo.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select capturado_por, estado into v_capturado_por, v_estado
    from public.recibos_electrificacion where id = p_recibo_id;
  if v_estado is null or v_capturado_por is distinct from auth.uid() then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede modificar un recibo pendiente de revisión.';
  end if;

  select count(*) into v_decididos from public.renglones_electrificacion
    where recibo_id = p_recibo_id and decision is not null;
  if v_decididos > 0 then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  v_pedido_id := public.pedido_id_por_ot(p_ot);

  update public.recibos_electrificacion set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = btrim(p_ot),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  -- Borra también sus discrepancias (cascade): se vuelven a evaluar con lo
  -- que se guarda ahora.
  delete from public.renglones_electrificacion where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id, motivo_descuadre, descripcion_pm
    ) values (
      p_recibo_id,
      v_numero,
      r->>'modelo',
      coalesce((r->>'cantidad')::numeric, 1),
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      null,
      'manual',
      (r->>'propuesto')::numeric,
      0,
      null,
      null,
      nullif(r->>'nota', ''),
      null,
      v_pedido_id,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), ''),
      btrim(r->>'descripcionPm')
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_numero := v_numero + 1;
  end loop;
end;
$function$;

revoke execute on function public.guardar_recibo_acabados(text, date, text, text, text, public.est_prioridad, text, jsonb) from public, anon;
grant execute on function public.guardar_recibo_acabados(text, date, text, text, text, public.est_prioridad, text, jsonb) to authenticated;
revoke execute on function public.guardar_recibo_armado(text, date, text, text, text, public.est_prioridad, text, jsonb) from public, anon;
grant execute on function public.guardar_recibo_armado(text, date, text, text, text, public.est_prioridad, text, jsonb) to authenticated;
