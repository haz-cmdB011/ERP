-- ============================================================================
-- Estimaciones — OT/PM y modelos de Planeación en los generadores de recibos
-- de Acabados y Armado.
--
-- Igual que listar_ots_pm_electrificacion / listar_modelos_pm_electrificacion
-- (20260929120000 y siguientes), pero SIN el filtro de iluminación: en
-- Acabados y Armado aplican todos los modelos padre (MO) del PM. Solo
-- lectura; security definer porque el personal de Estimaciones y los
-- maquiladores no leen las tablas de Planeación directamente. Nunca exponen
-- precios ni datos del cliente.
-- ============================================================================

-- PM con versión activa (no eliminados), con su proyecto y cuántos modelos
-- padre tiene.
create or replace function public.listar_ots_pm_recibos()
returns table (pedido_id uuid, numero_pedido text, proyecto text, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select p.id, p.numero_pedido, pr.nombre,
      count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> ''),
      coalesce(sum(pi.cantidad_total), 0)
    from public.pedidos p
    join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
    left join public.proyectos pr on pr.id = p.proyecto_id
    left join public.planeacion_items pi
      on pi.pedido_version_id = pv.id
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    where p.eliminado_en is null
      and p.eliminado_definitivo_en is null
    group by p.id, p.numero_pedido, pr.nombre
    order by p.numero_pedido;
end;
$$;

revoke execute on function public.listar_ots_pm_recibos() from public, anon;
grant execute on function public.listar_ots_pm_recibos() to authenticated;

-- Modelos padre (MO) de un PM: cantidad declarada (suma de sus filas) y la
-- primera línea de la descripción, para reconocerlos en el selector.
create or replace function public.listar_modelos_pm_recibos(p_pedido uuid)
returns table (modelo text, cantidad_pm numeric, descripcion text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      min(split_part(btrim(coalesce(pi.descripcion, '')), E'\n', 1))
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where pv.pedido_id = p_pedido
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$$;

revoke execute on function public.listar_modelos_pm_recibos(uuid) from public, anon;
grant execute on function public.listar_modelos_pm_recibos(uuid) to authenticated;
