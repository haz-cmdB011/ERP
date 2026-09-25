-- ============================================================================
-- Estimaciones — recibos de ARMADO (segundo tipo de recibo, junto a Acabados).
--
-- Armado reutiliza recibos/renglones y el mismo motor de precio. Lo único
-- distinto en un renglón es el "tipo de armado" (Natural, Laminado,
-- Colocación de herrajes) en lugar de acabado/segundo acabado/fases.
--
-- Cambios (todos aditivos; los recibos de Acabados existentes no se tocan):
--   * recibos.tipo: 'acabados' (por defecto) | 'armado'.
--   * El folio deja de ser único a secas y pasa a ser único POR TIPO: un
--     folio de Armado no choca con el mismo número de Acabados.
--   * renglones.tipo_armado.
--   * guardar_recibo_acabados acota la búsqueda del folio a su tipo.
--   * guardar_recibo_armado: alta atómica, igual que la de Acabados.
-- ============================================================================

alter table public.recibos
  add column tipo text not null default 'acabados'
    check (tipo in ('acabados', 'armado'));

alter table public.recibos drop constraint recibos_folio_key;
alter table public.recibos
  add constraint recibos_tipo_folio_key unique (tipo, folio);

alter table public.renglones add column tipo_armado text;

-- ---------------------------------------------------------------------------
-- guardar_recibo_acabados: mismo cuerpo de siempre; solo cambia que al buscar
-- un folio existente ("continuar folio") lo hace dentro del tipo 'acabados'.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_acabados(
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
  v_siguiente_numero integer;
  r jsonb;
begin
  if not public.is_estimaciones() then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select id into v_recibo_id
    from public.recibos where folio = p_folio and tipo = 'acabados';

  if v_recibo_id is null then
    insert into public.recibos (
      folio, tipo, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
    ) values (
      p_folio, 'acabados', p_fecha_recibo, p_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
      p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
    )
    returning id into v_recibo_id;
    v_siguiente_numero := 1;
  else
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota
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
      nullif(r->>'puSugerido', '')::numeric,
      (r->>'fuente')::public.est_fuente_sugerido,
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      (r->>'aceptado')::numeric,
      (r->>'banda')::public.est_banda,
      nullif(r->>'justificacion', ''),
      nullif(r->>'nota', '')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  return v_recibo_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- guardar_recibo_armado: alta atómica de un recibo de Armado con sus
-- renglones, o continuación de un folio de Armado ya existente. Sin acabado
-- ni fases; con tipo_armado obligatorio.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_armado(
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
  v_siguiente_numero integer;
  r jsonb;
begin
  if not public.is_estimaciones() then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select id into v_recibo_id
    from public.recibos where folio = p_folio and tipo = 'armado';

  if v_recibo_id is null then
    insert into public.recibos (
      folio, tipo, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
    ) values (
      p_folio, 'armado', p_fecha_recibo, p_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
      p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
    )
    returning id into v_recibo_id;
    v_siguiente_numero := 1;
  else
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado', 'Colocación de herrajes') then
      raise exception 'Renglón %: falta el tipo de armado (Natural, Laminado o Colocación de herrajes).',
        v_siguiente_numero;
    end if;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, tipo_trabajo, causa_reproceso,
      cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      r->>'tipoArmado',
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      nullif(r->>'puSugerido', '')::numeric,
      (r->>'fuente')::public.est_fuente_sugerido,
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      (r->>'aceptado')::numeric,
      (r->>'banda')::public.est_banda,
      nullif(r->>'justificacion', ''),
      nullif(r->>'nota', '')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  return v_recibo_id;
end;
$$;

revoke execute on function public.guardar_recibo_armado(
  text, date, text, text, text, public.est_prioridad, text, jsonb
) from public, anon;
grant execute on function public.guardar_recibo_armado(
  text, date, text, text, text, public.est_prioridad, text, jsonb
) to authenticated;
