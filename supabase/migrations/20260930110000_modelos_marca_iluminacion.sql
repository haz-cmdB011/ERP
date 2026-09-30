-- ============================================================================
-- Electrificación — marcar en la lista de modelos cuáles llevan iluminación.
--
-- listar_modelos_pm_electrificacion devuelve además `con_iluminacion`: true si
-- algún padre de ese modelo en la OT menciona iluminación (misma regla que el
-- filtro del maquilador, descripcion_incluye_iluminacion). El personal de
-- Estimaciones ve todos los modelos padre de la OT y así puede distinguir los
-- que el maquilador sí ve; para el maquilador todos salen en true.
--
-- Cambia el tipo de retorno, por eso se elimina y se vuelve a crear.
-- ============================================================================

drop function public.listar_modelos_pm_electrificacion(uuid, uuid);

create or replace function public.listar_modelos_pm_electrificacion(
  p_pedido uuid,
  p_excluir_recibo uuid default null
)
returns table (
  modelo text,
  cantidad_pm numeric,
  cantidad_registrada numeric,
  con_iluminacion boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_maq boolean := public.is_maquilador();
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      public.cantidad_registrada_modelo(p_pedido, min(pi.modelo), p_excluir_recibo),
      bool_or(public.descripcion_incluye_iluminacion(pi.descripcion))
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id and p.eliminado_en is null
    where pv.pedido_id = p_pedido
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (not v_maq or public.descripcion_incluye_iluminacion(pi.descripcion))
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$$;
revoke execute on function public.listar_modelos_pm_electrificacion(uuid, uuid) from public, anon;
grant execute on function public.listar_modelos_pm_electrificacion(uuid, uuid) to authenticated;
