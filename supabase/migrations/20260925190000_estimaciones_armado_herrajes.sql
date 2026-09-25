-- ============================================================================
-- Armado: "Colocación de herrajes" deja de ser un tipo de armado y pasa a ser
-- una opción aparte (Sí / No) que se puede combinar con Natural o Laminado.
--
--   * renglones.colocacion_herrajes (boolean): solo se llena en Armado.
--   * guardar_recibo_armado: el tipo de armado ahora es Natural o Laminado, y
--     recibe el Sí/No de herrajes ('colocacionHerrajes').
--
-- Aún no había recibos de Armado guardados, así que no hay datos que migrar.
-- ============================================================================

alter table public.renglones add column colocacion_herrajes boolean;

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
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado') then
      raise exception 'Renglón %: falta el tipo de armado (Natural o Laminado).',
        v_siguiente_numero;
    end if;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, colocacion_herrajes, tipo_trabajo,
      causa_reproceso, cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano,
      pu_propuesto, pu_aceptado, banda, justificacion, nota
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
