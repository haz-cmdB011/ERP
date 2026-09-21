drop function public.eliminar_item_definitivo(uuid);

-- Antes, eliminar_item_definitivo borraba el ítem sin importar si ya
-- tenía informes de calidad (folio) — el ON DELETE CASCADE de
-- informes_calidad.planeacion_item_id se llevaba el folio con él, sin
-- forma de recuperarlo. Ahora, si el ítem ya tiene folio(s), se conserva
-- como "cancelado" (sale de la papelera y de la vista normal, y queda en
-- el panel Cancelados) en vez de borrarse físicamente.
create or replace function public.eliminar_item_definitivo(p_item_id uuid)
returns boolean language plpgsql set search_path = '' as $$
declare
  v_tiene_informes boolean;
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo un administrador de Producción o desarrollador puede eliminar definitivamente.';
  end if;

  select exists(
    select 1 from public.informes_calidad where planeacion_item_id = p_item_id
  ) into v_tiene_informes;

  if v_tiene_informes then
    update public.planeacion_items
      set estado_revision = 'cancelado',
          motivo_cancelacion = coalesce(
            motivo_cancelacion,
            'Eliminado desde Producción/Planeación — folio de Calidad conservado'
          ),
          eliminacion_solicitada_en = null,
          eliminacion_solicitada_por = null
      where id = p_item_id and eliminacion_solicitada_en is not null;

    if not found then
      raise exception 'El ítem no existe o no tiene una solicitud de eliminación pendiente.';
    end if;

    return true;
  end if;

  delete from public.planeacion_items
    where id = p_item_id and eliminacion_solicitada_en is not null;

  if not found then
    raise exception 'El ítem no existe o no tiene una solicitud de eliminación pendiente.';
  end if;

  return false;
end;
$$;

grant execute on function public.eliminar_item_definitivo(uuid) to authenticated;
