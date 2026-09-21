alter table public.informes_calidad
  add column checklist jsonb;

drop function public.crear_informe_calidad(uuid, boolean, text);

create or replace function public.crear_informe_calidad(
  p_item_id uuid, p_aprobado boolean, p_descripcion text, p_checklist jsonb default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_folio text;
  v_id uuid;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;

  v_folio := 'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0');

  insert into public.informes_calidad (planeacion_item_id, folio, aprobado, descripcion, elaborado_por, checklist)
    values (p_item_id, v_folio, p_aprobado, nullif(p_descripcion, ''), auth.uid(), p_checklist)
    returning id into v_id;

  return v_id;
end;
$$;
revoke execute on function public.crear_informe_calidad(uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.crear_informe_calidad(uuid, boolean, text, jsonb) to authenticated;
