-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.est_conciliar_renglon_pm supera el límite del PM
-- @verifica function-contiene public.est_conciliar_renglon_pm Calidad solo tiene
-- @verifica function-contiene public.est_conciliar_renglon_pm cantidad_reproceso_asignada
--
-- Vuelve a poner el tope duro de cobro sobre la versión de reprocesos_segun_produccion.
-- Esa migración (4 nov) reescribió est_conciliar_renglon_pm entera y borró lo que
-- cobro_limitado_por_pm_y_calidad / mensajes_cobro_cortos (3 nov) habían dejado.
--
-- Un renglón normal de recibo:
--   1. No pasa del PM de la OT (ni cobra un modelo que no está en ella). No hay
--      motivo que lo salve: si el PM está mal, Planeación lo corrige.
--   2. En Acabados y Armado, tampoco pasa de lo que Calidad aprobó del modelo.
-- Un reproceso queda como en reprocesos_segun_produccion: no gasta saldo del PM,
-- se mide contra el retrabajo que Producción reasignó y, si se pasa, pide motivo y
-- deja una discrepancia. Electrificación solo tiene el tope del PM (Calidad no la
-- compara). Los componentes de un mueble con despiece propio (partes del despiece)
-- no se comparan pieza por pieza con Calidad, que solo aprueba hijos del PM: ver el
-- comentario en el cuerpo.

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
  v_en_variante boolean := false;
  v_aprobado numeric;
  v_filas_padre integer;
  v_filas_total integer;
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

    if v_pm is not null and v_acumulada <= v_pm then
      return new;
    end if;

    v_motivo := nullif(btrim(coalesce(new.motivo_descuadre, '')), '');
    if v_motivo is null then
      raise exception
        'Renglón %: el reproceso supera lo que Producción reasignó como retrabajo (o no reasignó ese modelo); captura el motivo.',
        new.numero;
    end if;

    insert into public.discrepancias_pm (
      area, recibo_id, renglon_id, orden_trabajo, modelo, descripcion_pm,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por, es_reproceso
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo, new.descripcion_pm,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid(), true
    );
    return new;
  end if;

  v_en_variante := new.descripcion_pm is not null
    and public.cantidad_pm_variante(v_ot, new.modelo, new.descripcion_pm, false) is not null;

  if v_en_variante then
    -- La variante está en la OT. En Electrificación, una variante sin
    -- iluminación da null: no está en el PM de Electrificación. Un mueble cuya
    -- ruta repite el proceso del área se espera tantas veces como lo repita.
    v_pm := public.cantidad_pm_variante_area(v_ot, new.modelo, new.descripcion_pm, v_area);
    v_acumulada := public.cantidad_registrada_variante(v_ot, new.modelo, new.descripcion_pm, v_area);
  else
    v_pm := public.cantidad_pm_ot_area(v_ot, new.modelo, v_area);
    v_acumulada := public.cantidad_registrada_ot(v_ot, new.modelo, v_area);
  end if;

  -- 1. Tope del PM.
  if v_pm is null or v_acumulada > v_pm then
    raise exception 'Renglón %: no se puede, supera el límite del PM (% pz).', new.numero, coalesce(v_pm, 0);
  end if;

  -- 2. Tope de lo que Calidad aprobó (Acabados y Armado).
  if v_area in ('acabados', 'armado') then
    select case v_area when 'acabados' then sum(a.aprobado_acabados) else sum(a.aprobado_armado) end,
           count(*) filter (where not a.componente),
           count(*)
      into v_aprobado, v_filas_padre, v_filas_total
      from public.aprobado_calidad_variante(v_ot) a
      where a.clave = public.norm_modelo(new.modelo)
        and (
          (v_en_variante and a.vclave = public.norm_descripcion(new.descripcion_pm))
          or (not v_en_variante and not a.componente)
        );

    -- Un componente de un mueble con despiece propio sale de las partes del
    -- despiece (componentes_recibo_ot), pero Calidad solo aprueba los hijos del
    -- PM, enteros y por su cantidad. Ahí no se puede comparar pieza por pieza:
    -- una parte sin hijo no se evalúa por separado (solo rige el tope del PM) y
    -- una con hijo cuenta si Calidad le aprobó algo.
    if v_en_variante and v_filas_padre = 0
      -- Es un componente de la OT (no un mueble padre, que sí debe pasar por Calidad)...
      and exists (
        select 1 from public.componentes_recibo_ot(v_ot) c
        where public.norm_modelo(c.modelo) = public.norm_modelo(new.modelo)
          and public.norm_descripcion(c.descripcion) = public.norm_descripcion(new.descripcion_pm)
      )
      and not exists (
        select 1
        from public.planeacion_items pi
        join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
        join public.pedidos p on p.id = pv.pedido_id
        where pi.tipo_registro = 'MO' and pi.parent_item_id is null
          and p.eliminado_en is null and p.eliminado_definitivo_en is null
          and public.ot_clave(p.numero_pedido) = v_ot
          and public.norm_modelo(pi.modelo) = public.norm_modelo(new.modelo)
          and public.norm_descripcion(pi.descripcion) = public.norm_descripcion(new.descripcion_pm)
      )
      -- ...y la OT tiene algún mueble con despiece propio.
      and exists (
        select 1
        from public.despieces_produccion d
        join public.planeacion_items pa on pa.id = d.planeacion_item_id
        join public.pedido_versiones pv on pv.id = pa.pedido_version_id and pv.es_version_activa
        join public.pedidos p on p.id = pv.pedido_id
        where not d.igual_a_sugerencia
          and p.eliminado_en is null and p.eliminado_definitivo_en is null
          and public.ot_clave(p.numero_pedido) = v_ot
      )
    then
      if v_filas_total = 0 or coalesce(v_aprobado, 0) > 0 then
        return new;
      end if;
    end if;

    if coalesce(v_aprobado, 0) < v_acumulada then
      raise exception 'Renglón %: no se puede, Calidad solo tiene % pz aprobadas.', new.numero, coalesce(v_aprobado, 0);
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function public.est_conciliar_renglon_pm() from public, anon, authenticated;
