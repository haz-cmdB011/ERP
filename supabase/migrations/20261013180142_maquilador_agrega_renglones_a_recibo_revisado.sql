-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.guardar_recibo_acabados set estado = 'pendiente', revisado_por = null
-- @verifica function-contiene public.guardar_recibo_armado set estado = 'pendiente', revisado_por = null
-- @verifica function-contiene public.guardar_recibo_electrificacion set estado = 'pendiente', revisado_por = null
-- @verifica function-contiene public.guardar_recibo_acabados if v_estado = 'pagado' then

-- ============================================================================
-- El maquilador también puede agregar renglones a un recibo ya revisado.
--
-- Al guardar un recibo con un folio que ya existe, el personal de Estimaciones podía agregarle
-- renglones mientras no estuviera pagado, pero el maquilador solo si seguía "pendiente":
-- ("El folio X ya fue revisado; no se le pueden agregar renglones"). Ahora el maquilador también
-- puede. Como sus renglones llegan sin decisión de precio (los decide Estimaciones al revisar) y
-- est_actualizar_estado_recibo solo pasa de pendiente a revisado y nunca al revés, el recibo se
-- reabre a "pendiente" para que los renglones nuevos pasen por revisión y no se paguen sin ella.
-- Un recibo pagado sigue sin admitir renglones, para cualquier rol.
--
-- Se reemplazan las tres funciones de guardado con el mismo texto de 20261002154916 y solo dos
-- cambios: la condición de arriba y el bloque que reabre el recibo. create or replace conserva sus
-- permisos.
-- ============================================================================

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
    if v_estado = 'pagado' then
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

  -- Un maquilador agrega renglones (sin decisión) a un recibo ya revisado: el recibo se reabre
  -- para revisión, así los renglones nuevos no se pagan sin que Estimaciones los revise.
  if v_maq and v_estado = 'revisado' then
    update public.recibos
      set estado = 'pendiente', revisado_por = null, revisado_en = null
      where id = v_recibo_id;
  end if;

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
    if v_estado = 'pagado' then
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

  -- Un maquilador agrega renglones (sin decisión) a un recibo ya revisado: el recibo se reabre
  -- para revisión, así los renglones nuevos no se pagan sin que Estimaciones los revise.
  if v_maq and v_estado = 'revisado' then
    update public.recibos
      set estado = 'pendiente', revisado_por = null, revisado_en = null
      where id = v_recibo_id;
  end if;

  perform public.est_actualizar_estado_recibo('armado', v_recibo_id);
  return v_recibo_id;
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
    if v_estado = 'pagado' then
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

  -- Un maquilador agrega renglones (sin decisión) a un recibo ya revisado: el recibo se reabre
  -- para revisión, así los renglones nuevos no se pagan sin que Estimaciones los revise.
  if v_maq and v_estado = 'revisado' then
    update public.recibos_electrificacion
      set estado = 'pendiente', revisado_por = null, revisado_en = null
      where id = v_recibo_id;
  end if;

  perform public.est_actualizar_estado_recibo('electrificacion', v_recibo_id);
  return v_recibo_id;
end;
$function$;
