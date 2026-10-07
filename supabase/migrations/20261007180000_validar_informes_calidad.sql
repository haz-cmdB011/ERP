-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.crear_informe_calidad Indica el motivo
-- @verifica function-contiene public.crear_informe_calidad ya no se evalúa
-- @verifica function public.crear_informes_calidad_aprobados

-- ============================================================================
-- Informes de Calidad: las reglas que solo cumplía la pantalla ahora las exige
-- la base.
--
--   * Un informe "No aprobado" lleva motivo (antes solo lo pedía el formulario;
--     llamando a la función directo se podía emitir un folio permanente sin él).
--   * Solo se evalúan ítems que existen, están enviados a producción y no están
--     cancelados ni eliminados.
--
-- Además, crear_informes_calidad_aprobados aprueba varios ítems de una vez en
-- una sola transacción: si uno falla, ninguno queda aprobado. Cada folio sale
-- de crear_informe_calidad, así que las validaciones son las mismas.
-- ============================================================================

create or replace function public.crear_informe_calidad(
  p_item_id uuid,
  p_aprobado boolean,
  p_descripcion text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_folio text;
  v_id uuid;
  v_item record;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;

  if not p_aprobado and nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Indica el motivo por el que no se aprueba.';
  end if;

  select estado_liberacion, estado_revision, eliminacion_solicitada_en
    into v_item
    from public.planeacion_items
    where id = p_item_id;
  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.estado_liberacion is distinct from 'enviado_a_produccion' then
    raise exception 'El ítem todavía no se envió a producción.';
  end if;
  if v_item.estado_revision = 'cancelado' then
    raise exception 'El ítem está cancelado y ya no se evalúa.';
  end if;
  if v_item.eliminacion_solicitada_en is not null then
    raise exception 'El ítem fue eliminado y ya no se evalúa.';
  end if;

  v_folio := 'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0');

  insert into public.informes_calidad (planeacion_item_id, folio, aprobado, descripcion, elaborado_por)
    values (p_item_id, v_folio, p_aprobado, nullif(btrim(coalesce(p_descripcion, '')), ''), auth.uid())
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_informe_calidad(uuid, boolean, text) from public, anon;
grant execute on function public.crear_informe_calidad(uuid, boolean, text) to authenticated;

create or replace function public.crear_informes_calidad_aprobados(p_item_ids uuid[])
returns table (item_id uuid, informe_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
begin
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'No hay ítems que aprobar.';
  end if;
  if cardinality(p_item_ids) > 200 then
    raise exception 'Se pueden aprobar hasta 200 ítems a la vez.';
  end if;

  for v_item in select distinct x from unnest(p_item_ids) as x order by x
  loop
    item_id := v_item;
    informe_id := public.crear_informe_calidad(v_item, true, '');
    return next;
  end loop;
end;
$$;

revoke execute on function public.crear_informes_calidad_aprobados(uuid[]) from public, anon;
grant execute on function public.crear_informes_calidad_aprobados(uuid[]) to authenticated;
