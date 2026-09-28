-- ============================================================================
-- "Eliminar definitivo" hecho por el DESARROLLADOR borra de verdad.
--
-- Para el resto de roles se mantiene la protección: un pedido/ítem con
-- folio(s) de Calidad no se borra, se conserva como cancelado (ver
-- eliminar_definitivo_con_folios). El desarrollador (is_admin()) necesita
-- poder limpiar la base desde la página, así que para él se borra todo:
--   * informes de Calidad (ya caían en cascada con el ítem),
--   * folios de Producción (ON DELETE SET NULL los dejaba huérfanos),
--   * y se desliga el ítem de los renglones de Electrificación (esa FK no
--     tiene regla de borrado y habría impedido borrar el ítem; el recibo se
--     conserva).
-- Security definer: el borrado toca tablas de otras áreas; el permiso se
-- valida explícitamente al inicio de cada función.
-- ============================================================================

-- Borra los datos de otras áreas ligados a estos ítems (y a sus componentes
-- hijos, que caen en cascada con el padre) antes de borrarlos.
create or replace function public.limpiar_dependencias_items(p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Solo el desarrollador puede borrar datos ligados a ítems.';
  end if;

  with recursive arbol as (
    select id from public.planeacion_items where id = any(p_item_ids)
    union
    select i.id from public.planeacion_items i join arbol a on i.parent_item_id = a.id
  )
  select array_agg(id) into v_ids from arbol;

  if v_ids is null then
    return;
  end if;

  update public.renglones_electrificacion set planeacion_item_id = null
    where planeacion_item_id = any(v_ids);
  delete from public.folios_produccion where planeacion_item_id = any(v_ids);
  delete from public.informes_calidad where planeacion_item_id = any(v_ids);
end;
$$;
revoke execute on function public.limpiar_dependencias_items(uuid[]) from public, anon;
grant execute on function public.limpiar_dependencias_items(uuid[]) to authenticated;

create or replace function public.eliminar_pedido_definitivo(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiene_informes boolean;
  v_items uuid[];
begin
  if not (public.is_admin() or public.is_admin_planeacion()) then
    raise exception 'Solo un administrador de Planeación o desarrollador puede eliminar definitivamente.';
  end if;

  select array_agg(pi.id) into v_items
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    where pv.pedido_id = p_pedido_id;

  select exists (
    select 1 from public.informes_calidad where planeacion_item_id = any(coalesce(v_items, '{}'))
  ) into v_tiene_informes;

  -- Administrador de Planeación: un pedido con folios de Calidad se conserva.
  if v_tiene_informes and not public.is_admin() then
    update public.pedidos
      set cancelado_en = coalesce(cancelado_en, now()),
          cancelado_por = coalesce(cancelado_por, auth.uid()),
          motivo_cancelacion = 'Eliminado — folio(s) de Calidad conservados',
          eliminado_definitivo_en = now(),
          eliminado_en = null,
          eliminado_por = null
      where id = p_pedido_id;

    update public.planeacion_items pi
      set estado_revision = 'cancelado',
          motivo_cancelacion = coalesce(pi.motivo_cancelacion, 'Eliminado — folio de Calidad conservado')
      from public.pedido_versiones pv
      where pi.pedido_version_id = pv.id
        and pv.pedido_id = p_pedido_id;

    return true;
  end if;

  -- Desarrollador (o pedido sin folios): se borra todo.
  if v_items is not null and public.is_admin() then
    perform public.limpiar_dependencias_items(v_items);
  elsif v_items is not null then
    update public.renglones_electrificacion set planeacion_item_id = null
      where planeacion_item_id = any(v_items);
  end if;

  delete from public.pedidos where id = p_pedido_id;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  return false;
end;
$$;
revoke execute on function public.eliminar_pedido_definitivo(uuid) from public, anon;
grant execute on function public.eliminar_pedido_definitivo(uuid) to authenticated;

create or replace function public.eliminar_item_definitivo(p_item_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tiene_informes boolean;
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo un administrador de Producción o desarrollador puede eliminar definitivamente.';
  end if;

  if not exists (
    select 1 from public.planeacion_items where id = p_item_id and eliminacion_solicitada_en is not null
  ) then
    raise exception 'El ítem no existe o no tiene una solicitud de eliminación pendiente.';
  end if;

  select exists(
    select 1 from public.informes_calidad where planeacion_item_id = p_item_id
  ) into v_tiene_informes;

  -- Administrador de Producción: un ítem con folio de Calidad se conserva.
  if v_tiene_informes and not public.is_admin() then
    update public.planeacion_items
      set estado_revision = 'cancelado',
          motivo_cancelacion = coalesce(
            motivo_cancelacion,
            'Eliminado desde Producción/Planeación — folio de Calidad conservado'
          ),
          eliminacion_solicitada_en = null,
          eliminacion_solicitada_por = null
      where id = p_item_id;
    return true;
  end if;

  if public.is_admin() then
    perform public.limpiar_dependencias_items(array[p_item_id]);
  else
    update public.renglones_electrificacion set planeacion_item_id = null
      where planeacion_item_id = p_item_id;
  end if;

  delete from public.planeacion_items where id = p_item_id;
  return false;
end;
$$;
revoke execute on function public.eliminar_item_definitivo(uuid) from public, anon;
grant execute on function public.eliminar_item_definitivo(uuid) to authenticated;
