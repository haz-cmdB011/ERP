-- ============================================================================
-- Borrado de planeacion_items en dos pasos: cualquier miembro de Producción
-- (trabajador o administrador del área, o desarrollador) puede SOLICITAR la
-- eliminación de un ítem; solo un administrador de Producción o un
-- desarrollador puede confirmarla DEFINITIVAMENTE (delete real). Mismo
-- patrón que soft_delete_pedido/restore_pedido (security invoker + chequeo
-- interno), reutilizando is_admin_area('produccion') ya existente.
-- ============================================================================

alter table public.planeacion_items
  add column eliminacion_solicitada_en timestamptz,
  add column eliminacion_solicitada_por uuid references auth.users(id);

-- Cualquier trabajador o administrador del área de Producción (o
-- desarrollador). Mismo estilo que is_planeacion(), que ya usa exactamente
-- esta forma para el área 'planeacion'.
create or replace function public.is_produccion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('administrador', 'trabajador') and area = 'produccion'
  );
$$;

revoke execute on function public.is_produccion() from public, anon;
grant execute on function public.is_produccion() to authenticated;

-- Política UPDATE adicional: permite a Producción intentar un UPDATE sobre
-- la fila (además de planeacion_update_planeacion_items, que sigue
-- exigiendo is_planeacion() para todo lo demás). RLS es solo a nivel de
-- FILA — el trigger de abajo es lo que de verdad restringe qué columnas
-- puede tocar Producción.
create policy "produccion_solicitar_eliminacion_planeacion_items" on public.planeacion_items
  for update using (public.is_produccion()) with check (public.is_produccion());

-- Nunca hubo política de DELETE en esta tabla (RLS lo bloqueaba a todos).
create policy "produccion_admin_delete_planeacion_items" on public.planeacion_items
  for delete using (public.is_admin_area('produccion'));

-- Si quien edita es de Producción pero NO de Planeación (is_produccion()
-- true, is_planeacion() false — ej. un trabajador o admin de producción),
-- solo puede tocar las dos columnas de solicitud de eliminación. Comparar
-- to_jsonb(old/new) menos esas dos claves evita tener que enumerar a mano
-- cada columna de la tabla (y no se desactualiza si se agregan columnas
-- nuevas más adelante).
create or replace function public.protect_planeacion_items_columns_produccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_produccion() and not public.is_planeacion() then
    if (to_jsonb(old) - 'eliminacion_solicitada_en' - 'eliminacion_solicitada_por')
       is distinct from
       (to_jsonb(new) - 'eliminacion_solicitada_en' - 'eliminacion_solicitada_por')
    then
      raise exception 'Producción solo puede modificar la solicitud de eliminación de este ítem.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_planeacion_items_columns_produccion on public.planeacion_items;
create trigger trg_protect_planeacion_items_columns_produccion
  before update on public.planeacion_items
  for each row execute function public.protect_planeacion_items_columns_produccion();

create or replace function public.solicitar_eliminacion_item(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_produccion() then
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
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_produccion() then
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

create or replace function public.eliminar_item_definitivo(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo un administrador de Producción o desarrollador puede eliminar definitivamente.';
  end if;

  delete from public.planeacion_items
    where id = p_item_id and eliminacion_solicitada_en is not null;

  if not found then
    raise exception 'El ítem no existe o no tiene una solicitud de eliminación pendiente.';
  end if;
end;
$$;

revoke execute on function public.solicitar_eliminacion_item(uuid) from public, anon;
revoke execute on function public.cancelar_solicitud_eliminacion_item(uuid) from public, anon;
revoke execute on function public.eliminar_item_definitivo(uuid) from public, anon;
grant execute on function public.solicitar_eliminacion_item(uuid) to authenticated;
grant execute on function public.cancelar_solicitud_eliminacion_item(uuid) to authenticated;
grant execute on function public.eliminar_item_definitivo(uuid) to authenticated;
