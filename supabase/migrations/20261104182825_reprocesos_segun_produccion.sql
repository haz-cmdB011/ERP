-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica constraint public.renglones.renglones_causa_reproceso_check
-- @verifica column public.discrepancias_pm.es_reproceso
-- @verifica function public.retrabajo_recibo_ot
-- @verifica function public.cantidad_reproceso_asignada
-- @verifica function public.cantidad_reproceso_registrada
-- @verifica function-contiene public.est_conciliar_renglon_pm cantidad_reproceso_asignada
-- @verifica function-contiene public.listar_modelos_ot_recibos reproceso_asignado

-- ============================================================================
-- Estimaciones — un reproceso se cobra contra el retrabajo que asignó Producción.
--
-- Hasta aquí un renglón de reproceso (Acabados o Armado) no gastaba saldo del PM
-- y no se comparaba con nada: se podía cobrar cualquier cantidad. Ahora:
--   * La causa del reproceso es obligatoria (el administrador de Estimaciones la
--     necesita para decidir cuánto pagar).
--   * Lo que se espera de reproceso es lo que Producción reasignó como retrabajo
--     después de un rechazo de Calidad (asignaciones con informe_rechazo_id o
--     revision_final_rechazo_id, sin cancelar), a equipos que no son de planta, en
--     el proceso del área (Acabados ← barniz, Armado ← armado). Va en las mismas
--     unidades que asignó Producción: el mueble completo en muebles y una parte del
--     despiece en sus piezas, ligada a la misma variante que cobra el recibo
--     (componentes_recibo_ot).
--   * Reprocesos registrados (recibos vigentes del área) + este renglón ≤ lo
--     reasignado. Si se pasa, o Producción no reasignó nada de ese modelo, se pide
--     motivo y queda una discrepancia (es_reproceso) para el administrador, igual
--     que con el PM. Los renglones de producción no cambian.
-- ============================================================================

-- 1. Causa obligatoria ----------------------------------------------------------
alter table public.renglones
  add constraint renglones_causa_reproceso_check check (
    tipo_trabajo <> 'reproceso' or nullif(btrim(coalesce(causa_reproceso, '')), '') is not null
  );

-- 2. La discrepancia dice si es de un reproceso ----------------------------------
alter table public.discrepancias_pm add column es_reproceso boolean not null default false;

-- 3. Retrabajo que Producción reasignó, con la variante que cobra el recibo -----------
create or replace function public.retrabajo_recibo_ot(p_ot text, p_area text)
returns table(modelo text, descripcion text, cantidad numeric)
language sql
stable
set search_path = ''
as $function$
  select
    case when pd.id is null then pa.modelo else coalesce(h.modelo, pa.modelo) end,
    case when pd.id is null then pa.descripcion else coalesce(h.descripcion, pd.descripcion) end,
    a.cantidad
  from public.asignaciones_produccion a
  join public.equipos_produccion e on e.id = a.equipo_id and not e.es_planta
  join public.planeacion_items pa on pa.id = a.planeacion_item_id
  join public.pedido_versiones pv on pv.id = pa.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
  left join public.partes_despiece pd on pd.id = a.parte_id
  left join public.planeacion_items h on h.id = pd.hijo_id
  where a.cancelada_en is null
    and (a.informe_rechazo_id is not null or a.revision_final_rechazo_id is not null)
    and a.proceso = case p_area when 'armado' then 'armado' when 'acabados' then 'barniz' end
    and public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot)
    and p.eliminado_en is null and p.eliminado_definitivo_en is null;
$function$;

revoke execute on function public.retrabajo_recibo_ot(text, text) from public, anon, authenticated;

-- Lo reasignado de una variante (p_descripcion) o de todo el código (p_descripcion null).
-- null: Producción no reasignó nada.
create or replace function public.cantidad_reproceso_asignada(
  p_ot text, p_modelo text, p_descripcion text, p_area text
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(r.cantidad)
  from public.retrabajo_recibo_ot(p_ot, p_area) r
  where public.norm_modelo(r.modelo) = public.norm_modelo(p_modelo)
    and (p_descripcion is null or public.norm_descripcion(r.descripcion) = public.norm_descripcion(p_descripcion));
$function$;

revoke execute on function public.cantidad_reproceso_asignada(text, text, text, text) from public, anon, authenticated;

-- Reprocesos ya cobrados en recibos vigentes del área (misma variante o todo el código).
create or replace function public.cantidad_reproceso_registrada(
  p_ot text, p_modelo text, p_descripcion text, p_area text, p_excluir_recibo uuid default null
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select coalesce(sum(g.cantidad), 0)
  from public.renglones g
  join public.recibos rc on rc.id = g.recibo_id
  where public.ot_clave(rc.ot) = public.ot_clave(p_ot)
    and rc.tipo = p_area
    and rc.estado <> 'cancelado'
    and g.tipo_trabajo = 'reproceso'
    and public.norm_modelo(g.modelo) = public.norm_modelo(p_modelo)
    and (
      p_descripcion is null
      or (g.descripcion_pm is not null
          and public.norm_descripcion(g.descripcion_pm) = public.norm_descripcion(p_descripcion))
    )
    and (p_excluir_recibo is null or rc.id <> p_excluir_recibo);
$function$;

revoke execute on function public.cantidad_reproceso_registrada(text, text, text, text, uuid) from public, anon, authenticated;

-- 4. Control al guardar un renglón ---------------------------------------------------
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
  v_reproceso boolean := false;
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
    v_reproceso := v_fila->>'tipo_trabajo' = 'reproceso';
  end if;

  if v_estado = 'cancelado' then
    return new;
  end if;

  -- Uno tras otro por OT + código + área (todas sus variantes): el segundo
  -- espera a que el primero termine y ya cuenta sus piezas.
  perform pg_advisory_xact_lock(hashtextextended(
    'conciliacion_ot:' || v_area || ':' || coalesce(v_ot, '-') || ':'
      || public.norm_modelo(new.modelo), 0));

  if v_reproceso then
    -- Un reproceso se mide contra el retrabajo que Producción reasignó (no gasta saldo del PM).
    v_pm := public.cantidad_reproceso_asignada(v_ot, new.modelo, new.descripcion_pm, v_area);
    v_acumulada := public.cantidad_reproceso_registrada(v_ot, new.modelo, new.descripcion_pm, v_area);
  elsif new.descripcion_pm is not null
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
    if v_reproceso then
      raise exception
        'Renglón %: el reproceso supera lo que Producción reasignó como retrabajo (o no reasignó ese modelo); captura el motivo.',
        new.numero;
    end if;
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
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por, es_reproceso
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo, new.descripcion_pm,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid(), v_reproceso
    );
  end if;
  return new;
end;
$function$;

revoke execute on function public.est_conciliar_renglon_pm() from public, anon, authenticated;

-- 5. Modelos de la captura del recibo: también el saldo de reproceso -----------------
-- Cambia el tipo de retorno (dos columnas nuevas): se recrea.
drop function if exists public.listar_modelos_ot_recibos(text, text, uuid);

create function public.listar_modelos_ot_recibos(
  p_ot text, p_tipo text default null, p_excluir_recibo uuid default null
)
returns table(
  modelo text, cantidad_pm numeric, descripcion text, cantidad_registrada numeric, pms text,
  descripcion_pm text, variantes bigint, es_componente boolean, item_codigo text, material text,
  padre_modelo text, reproceso_asignado numeric, reproceso_registrado numeric
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
      g.es_componente, g.item_codigo, g.material, g.padre_modelo,
      -- Retrabajo que Producción reasignó de esta variante (null: nada) y lo ya cobrado de reproceso.
      case when p_tipo is null then null
           else public.cantidad_reproceso_asignada(p_ot, g.modelo, g.descripcion_pm, p_tipo) end,
      case when p_tipo is null then 0::numeric
           else public.cantidad_reproceso_registrada(
             p_ot, g.modelo, g.descripcion_pm, p_tipo, p_excluir_recibo) end
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
