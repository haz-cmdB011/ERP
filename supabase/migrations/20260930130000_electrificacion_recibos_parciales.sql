-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- (La regla de parciales pasó al trigger est_conciliar_renglon_pm en
--  20260930191049_control_pm_recibos; las funciones de guardado ya no la contienen.)
-- @verifica function public.guardar_recibo_electrificacion
-- @verifica function public.modificar_recibo_electrificacion

-- ============================================================================
-- Electrificación — recibos parciales: el motivo se exige solo si se PASA.
--
-- Antes, cada recibo de un modelo pedía motivo hasta que la suma acumulada
-- (OT + modelo) igualara exactamente lo declarado en el PM; un recibo parcial
-- (menos piezas de las declaradas) siempre generaba discrepancia. Ahora:
--   * acumulado <= declarado  -> sin discrepancia (menor = parcial: falta
--                                cobrar el resto en otros recibos);
--   * acumulado >  declarado  -> discrepancia, se exige motivo;
--   * el modelo no existe en la OT (declarado nulo) -> discrepancia, motivo.
--
-- Solo cambia esa condición (y el texto del error) en las dos funciones de
-- guardado; el resto es idéntico a 20260929120000.
-- ============================================================================

create or replace function public.guardar_recibo_electrificacion(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  v_cantidad_pm numeric;
  v_cantidad_acumulada numeric;
  v_motivo_descuadre text;
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

    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id
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
      v_pedido_id
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    -- Conciliación por OT + modelo: solo es descuadre si se pasa de lo
    -- declarado o si el modelo no existe en la OT (ver comentario inicial).
    v_cantidad_pm := public.cantidad_pm_modelo(v_pedido_id, r->>'modelo');
    v_cantidad_acumulada := public.cantidad_registrada_modelo(v_pedido_id, r->>'modelo');

    v_motivo_descuadre := nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '');
    if v_cantidad_pm is null or v_cantidad_acumulada > v_cantidad_pm then
      if v_motivo_descuadre is null then
        raise exception
          'Renglón %: la cantidad supera lo declarado en el PM (o el modelo no está en la OT); captura el motivo.',
          v_siguiente_numero;
      end if;
      insert into public.discrepancias_electrificacion (
        renglon_id, recibo_id, planeacion_item_id, modelo, cantidad_capturada,
        cantidad_acumulada, cantidad_pm, motivo, creado_por
      ) values (
        v_renglon_id, v_recibo_id, null, r->>'modelo',
        coalesce((r->>'cantidad')::numeric, 1), v_cantidad_acumulada, v_cantidad_pm,
        v_motivo_descuadre, auth.uid()
      );
    end if;

    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('electrificacion', v_recibo_id);
  return v_recibo_id;
end;
$$;
revoke execute on function public.guardar_recibo_electrificacion(
  text, date, text, text, text, public.est_prioridad, text, jsonb) from public, anon;
grant execute on function public.guardar_recibo_electrificacion(
  text, date, text, text, text, public.est_prioridad, text, jsonb) to authenticated;

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
as $$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  v_num_charola integer;
  v_renglon_id uuid;
  v_pedido_id uuid;
  v_cantidad_pm numeric;
  v_cantidad_acumulada numeric;
  v_motivo_descuadre text;
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

  -- Borra también las discrepancias del recibo (cascade): se vuelven a evaluar
  -- con lo que se guarda ahora.
  delete from public.renglones_electrificacion where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id
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
      v_pedido_id
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_cantidad_pm := public.cantidad_pm_modelo(v_pedido_id, r->>'modelo');
    v_cantidad_acumulada := public.cantidad_registrada_modelo(v_pedido_id, r->>'modelo');

    v_motivo_descuadre := nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '');
    if v_cantidad_pm is null or v_cantidad_acumulada > v_cantidad_pm then
      if v_motivo_descuadre is null then
        raise exception
          'Renglón %: la cantidad supera lo declarado en el PM (o el modelo no está en la OT); captura el motivo.',
          v_numero;
      end if;
      insert into public.discrepancias_electrificacion (
        renglon_id, recibo_id, planeacion_item_id, modelo, cantidad_capturada,
        cantidad_acumulada, cantidad_pm, motivo, creado_por
      ) values (
        v_renglon_id, p_recibo_id, null, r->>'modelo',
        coalesce((r->>'cantidad')::numeric, 1), v_cantidad_acumulada, v_cantidad_pm,
        v_motivo_descuadre, auth.uid()
      );
    end if;

    v_numero := v_numero + 1;
  end loop;
end;
$$;
