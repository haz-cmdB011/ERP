-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.listar_ots_electrificacion admite_electrificacion
-- @verifica function-contiene public.listar_modelos_ot_electrificacion admite_electrificacion
-- @verifica function-contiene public.cantidad_pm_variante admite_electrificacion
-- @verifica function-contiene public.cantidad_pm_variante_area admite_electrificacion
-- @verifica function-contiene public.cantidad_pm_ot admite_electrificacion
-- @verifica function-contiene public.cantidad_pm_ot_area admite_electrificacion
-- @verifica function-contiene public.variante_unica_ot admite_electrificacion
-- @verifica function-contiene public.ot_contra_cobrado admite_electrificacion

-- ============================================================================
-- Estimaciones — Electrificación también se detecta por los componentes.
--
-- El generador de recibos de Electrificación solo ofrecía los muebles padre cuya
-- descripción mencionaba iluminación; en varias OT el padre no lo dice y lo dice
-- un componente (ej. "CHAROLA ELECTRIFICACIÓN", "TIRA LED"). Ahora Estimaciones
-- usa la misma regla que Producción: admite_electrificacion(pi.id), que mira el
-- padre y sus hijos (iluminación o "electrificación", sin negaciones).
--
-- Cada función cambia solo esa condición: se reescribe su definición actual
-- reemplazando `descripcion_incluye_iluminacion(pi.descripcion)` (en todas, `pi`
-- es el mueble padre cuando se filtra por Electrificación). Si alguna no trae el
-- texto esperado, la migración falla en vez de quedar a medias.
-- ============================================================================

do $$
declare
  f record;
  v_def text;
  v_nueva text;
  v_esperadas constant text[] := array[
    'listar_ots_electrificacion', 'listar_modelos_ot_electrificacion',
    'cantidad_pm_variante', 'cantidad_pm_variante_area',
    'cantidad_pm_ot', 'cantidad_pm_ot_area',
    'variante_unica_ot', 'ot_contra_cobrado'
  ];
  v_hechas int := 0;
begin
  for f in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (v_esperadas)
  loop
    v_def := pg_get_functiondef(f.oid);
    v_nueva := replace(v_def,
      'public.descripcion_incluye_iluminacion(pi.descripcion)',
      'public.admite_electrificacion(pi.id)');
    if v_nueva = v_def then
      raise exception 'La función % no trae la condición de iluminación esperada.', f.proname;
    end if;
    execute v_nueva;
    v_hechas := v_hechas + 1;
  end loop;

  if v_hechas <> array_length(v_esperadas, 1) then
    raise exception 'Se esperaban % funciones y se cambiaron %.', array_length(v_esperadas, 1), v_hechas;
  end if;
end;
$$;
