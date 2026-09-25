-- reactivar_pedido ahora es el inverso exacto de cancelar_pedido: además
-- de limpiar los campos de cancelación del pedido, también revierte a
-- "Normal" (estado_revision null, motivo_cancelacion null) todos sus
-- ítems — antes se dejaban cancelados y el pedido reaparecía sin nada que
-- enviar a Producción.
create or replace function public.reactivar_pedido(p_pedido_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_planeacion() then
    raise exception 'No tienes permiso para reactivar este pedido.';
  end if;

  update public.planeacion_items pi
    set estado_revision = null,
        motivo_cancelacion = null
    from public.pedido_versiones pv
    where pi.pedido_version_id = pv.id
      and pv.pedido_id = p_pedido_id
      and pi.estado_revision = 'cancelado';

  update public.pedidos
    set cancelado_en = null, cancelado_por = null, motivo_cancelacion = null
    where id = p_pedido_id;
end;
$$;
