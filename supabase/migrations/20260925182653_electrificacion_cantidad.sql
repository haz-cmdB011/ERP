-- ============================================================================
-- Electrificación — cantidad de piezas por renglón.
--
-- El precio (sugerido, propuesto y aceptado) pasa a ser POR PIEZA, igual que
-- en Acabados: metros de LED y kit de charolas describen UNA pieza, y el
-- importe es cantidad × pu_aceptado. Aún no hay recibos guardados, así que
-- no hay datos que convertir; el default 1 deja cualquier fila existente
-- con el mismo importe que tenía.
-- ============================================================================

alter table public.renglones_electrificacion
  add column cantidad numeric(12, 2) not null default 1 check (cantidad > 0);

alter table public.renglones_electrificacion drop column importe;
alter table public.renglones_electrificacion
  add column importe numeric(14, 2) generated always as (cantidad * pu_aceptado) stored;

create or replace function public.guardar_recibo_electrificacion(
  p_folio text,
  p_fecha_recibo date,
  p_contratista text,
  p_obra text,
  p_ot text,
  p_prioridad public.est_prioridad,
  p_motivo_prioridad text,
  p_renglones jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recibo_id uuid;
  v_renglon_id uuid;
  v_siguiente_numero integer;
  v_num_charola integer;
  r jsonb;
  c jsonb;
begin
  if not public.is_estimaciones() then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select id into v_recibo_id from public.recibos_electrificacion where folio = p_folio;

  if v_recibo_id is null then
    insert into public.recibos_electrificacion (
      folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
    ) values (
      p_folio, p_fecha_recibo, p_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
      p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
    )
    returning id into v_recibo_id;
    v_siguiente_numero := 1;
  else
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones_electrificacion where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      coalesce((r->>'cantidad')::numeric, 1),
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      nullif(r->>'puSugerido', '')::numeric,
      r->>'fuente',
      (r->>'propuesto')::numeric,
      (r->>'aceptado')::numeric,
      (r->>'banda')::public.est_banda,
      nullif(r->>'justificacion', ''),
      nullif(r->>'nota', '')
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

  return v_recibo_id;
end;
$$;
