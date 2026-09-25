-- Mismo principio que eliminar_item_definitivo: si el pedido tiene algún
-- ítem con folio de Calidad, "Eliminar definitivo" ya no lo borra (el
-- borrado de pedidos cascada a versiones/items/informes) — lo deja
-- cancelado en su lugar, visible en /planeacion/cancelados y
-- /produccion/cancelados, para no perder el historial de folios.
create or replace function public.eliminar_pedido_definitivo(p_pedido_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_tiene_informes boolean;
begin
  if not (public.is_admin() or public.is_admin_planeacion()) then
    raise exception 'Solo un administrador de Planeación o desarrollador puede eliminar definitivamente.';
  end if;

  select exists (
    select 1
    from public.informes_calidad ic
    join public.planeacion_items pi on pi.id = ic.planeacion_item_id
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    where pv.pedido_id = p_pedido_id
  ) into v_tiene_informes;

  if v_tiene_informes then
    update public.pedidos
      set cancelado_en = coalesce(cancelado_en, now()),
          cancelado_por = coalesce(cancelado_por, auth.uid()),
          motivo_cancelacion = coalesce(motivo_cancelacion, 'Eliminado — folio(s) de Calidad conservados')
      where id = p_pedido_id;

    update public.planeacion_items pi
      set estado_revision = 'cancelado',
          motivo_cancelacion = coalesce(pi.motivo_cancelacion, 'Eliminado — folio de Calidad conservado')
      from public.pedido_versiones pv
      where pi.pedido_version_id = pv.id
        and pv.pedido_id = p_pedido_id;

    return true;
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
