-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.est_conciliar_renglon_pm supera el límite del PM
-- @verifica function-contiene public.est_conciliar_renglon_pm Calidad solo tiene
--
-- Mensajes cortos al rechazar un renglón de recibo (misma regla que
-- cobro_limitado_por_pm_y_calidad): "supera el límite del PM" o "Calidad solo
-- tiene N pz aprobadas". Solo cambia el texto de los dos errores.

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
  v_en_variante boolean;
  v_aprobado numeric;
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

  v_en_variante := new.descripcion_pm is not null
    and public.cantidad_pm_variante(v_ot, new.modelo, new.descripcion_pm, false) is not null;

  if v_en_variante then
    -- La variante está en la OT. Un mueble cuya ruta repite el proceso del área
    -- se espera tantas veces como lo repita.
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
    select case v_area when 'acabados' then sum(a.aprobado_acabados) else sum(a.aprobado_armado) end
      into v_aprobado
      from public.aprobado_calidad_variante(v_ot) a
      where a.clave = public.norm_modelo(new.modelo)
        and (
          (v_en_variante and a.vclave = public.norm_descripcion(new.descripcion_pm))
          or (not v_en_variante and not a.componente)
        );
    if coalesce(v_aprobado, 0) < v_acumulada then
      raise exception 'Renglón %: no se puede, Calidad solo tiene % pz aprobadas.', new.numero, coalesce(v_aprobado, 0);
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function public.est_conciliar_renglon_pm() from public, anon, authenticated;
