alter table public.planeacion_items add column motivo_cancelacion text;

alter table public.pedidos
  add column cancelado_en timestamptz,
  add column cancelado_por uuid references auth.users(id),
  add column motivo_cancelacion text;

create or replace function public.cancelar_pedido(p_pedido_id uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_planeacion() then
    raise exception 'No tienes permiso para cancelar este pedido.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Debes indicar el motivo de la cancelación.';
  end if;

  update public.pedidos
    set cancelado_en = now(), cancelado_por = auth.uid(), motivo_cancelacion = p_motivo
    where id = p_pedido_id;

  update public.planeacion_items pi
    set estado_revision = 'cancelado',
        motivo_cancelacion = coalesce(pi.motivo_cancelacion, p_motivo)
    from public.pedido_versiones pv
    where pi.pedido_version_id = pv.id
      and pv.pedido_id = p_pedido_id;
end;
$$;
revoke execute on function public.cancelar_pedido(uuid, text) from public, anon;
grant execute on function public.cancelar_pedido(uuid, text) to authenticated;

create or replace function public.reactivar_pedido(p_pedido_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_planeacion() then
    raise exception 'No tienes permiso para reactivar este pedido.';
  end if;
  update public.pedidos
    set cancelado_en = null, cancelado_por = null, motivo_cancelacion = null
    where id = p_pedido_id;
end;
$$;
revoke execute on function public.reactivar_pedido(uuid) from public, anon;
grant execute on function public.reactivar_pedido(uuid) to authenticated;
