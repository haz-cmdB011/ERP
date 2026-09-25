-- Planeación también puede enviar un ítem a la papelera y restaurarlo (antes
-- solo Producción/desarrollador). La RLS de UPDATE sobre planeacion_items ya
-- permitía a is_planeacion(); lo que bloqueaba era el chequeo interno de estas
-- funciones. La eliminación DEFINITIVA sigue siendo solo de administradores de
-- Producción (eliminar_item_definitivo no cambia).
create or replace function public.solicitar_eliminacion_item(p_item_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if not (public.is_produccion() or public.is_planeacion()) then
    raise exception 'No tienes permiso para solicitar la eliminación de este ítem.';
  end if;

  update public.planeacion_items
    set eliminacion_solicitada_en = now(), eliminacion_solicitada_por = auth.uid()
    where id = p_item_id;

  if not found then
    raise exception 'Ítem no encontrado.';
  end if;
end;
$$;

create or replace function public.cancelar_solicitud_eliminacion_item(p_item_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if not (public.is_produccion() or public.is_planeacion()) then
    raise exception 'No tienes permiso para cancelar esta solicitud.';
  end if;

  update public.planeacion_items
    set eliminacion_solicitada_en = null, eliminacion_solicitada_por = null
    where id = p_item_id;

  if not found then
    raise exception 'Ítem no encontrado.';
  end if;
end;
$$;
