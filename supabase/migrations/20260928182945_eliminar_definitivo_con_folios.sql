-- ============================================================================
-- "Eliminar definitivo" de un pedido con folio(s) de Calidad.
--
-- Bug: eliminar_pedido_definitivo no borra un pedido con folios de Calidad
-- (el borrado cascada a informes_calidad y se perderían): lo cancelaba y ya.
-- Pero un pedido cancelado sigue en las listas de Planeación, Producción y
-- Calidad, así que para el usuario "no se eliminaba" (y volver a darle no
-- hacía nada distinto).
--
-- Ahora queda marcado con eliminado_definitivo_en: sale de todas las listas
-- activas, solo se ve en Cancelados (con sus folios) y ya no se puede
-- reactivar — fue una eliminación definitiva, no una cancelación.
-- ============================================================================

alter table public.pedidos add column eliminado_definitivo_en timestamptz;

-- Pedidos que ya pasaron por "Eliminar definitivo" y quedaron conservados.
update public.pedidos
  set eliminado_definitivo_en = coalesce(cancelado_en, now())
  where motivo_cancelacion = 'Eliminado — folio(s) de Calidad conservados';

create or replace function public.eliminar_pedido_definitivo(p_pedido_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
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
          motivo_cancelacion = 'Eliminado — folio(s) de Calidad conservados',
          eliminado_definitivo_en = now(),
          -- Si estaba en la papelera de pedidos, sale de ahí: ya no se
          -- restaura, se consulta en Cancelados.
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

  delete from public.pedidos where id = p_pedido_id;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  return false;
end;
$$;

-- Un pedido eliminado definitivamente no se reactiva.
create or replace function public.reactivar_pedido(p_pedido_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_planeacion() then
    raise exception 'No tienes permiso para reactivar este pedido.';
  end if;
  if exists (
    select 1 from public.pedidos
    where id = p_pedido_id and eliminado_definitivo_en is not null
  ) then
    raise exception 'Este pedido se eliminó definitivamente (se conservó solo por sus folios de Calidad); no se puede reactivar.';
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
