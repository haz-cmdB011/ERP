-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.pedido_id_por_ot eliminado_definitivo_en is null

-- Un PM eliminado definitivamente que se conserva por sus folios de Calidad
-- queda con eliminado_en = null y eliminado_definitivo_en con fecha. Desde
-- 20260930175310 (el PM se identifica solo por su número) ese número se puede
-- volver a cargar como PM nuevo, así que pueden convivir dos pedidos con el
-- mismo numero_pedido: el conservado y el vigente.
--
-- Estas funciones de Estimaciones solo excluían eliminado_en:
-- - pedido_id_por_ot encontraba los dos y el recibo fallaba con "La OT está
--   repetida en el PM".
-- - listar_ots_pm_electrificacion y listar_modelos_pm_electrificacion
--   ofrecían el PM conservado (cancelado) como si siguiera vigente.
-- Ahora las tres excluyen también eliminado_definitivo_en, igual que las de
-- Acabados y Armado (listar_ots_pm_recibos, listar_modelos_pm_recibos).

create or replace function public.pedido_id_por_ot(p_ot text)
returns uuid
language plpgsql
stable
set search_path = ''
as $function$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.pedidos
    where numero_pedido = btrim(coalesce(p_ot, ''))
      and eliminado_en is null
      and eliminado_definitivo_en is null;
  if v_ids is null then
    raise exception 'La OT % no está en el PM de Planeación; elige una de la lista.', p_ot;
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'La OT % está repetida en el PM; avisa a Planeación.', p_ot;
  end if;
  return v_ids[1];
end;
$function$;

create or replace function public.listar_ots_pm_electrificacion()
returns table(pedido_id uuid, numero_pedido text, proyecto text, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_maq boolean := public.is_maquilador();
begin
  if not (public.is_estimaciones() or v_maq) then
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
      and (not v_maq or public.descripcion_incluye_iluminacion(pi.descripcion))
    where p.eliminado_en is null
      and p.eliminado_definitivo_en is null
    group by p.id, p.numero_pedido, pr.nombre
    having not v_maq or count(pi.id) > 0
    order by p.numero_pedido;
end;
$function$;

create or replace function public.listar_modelos_pm_electrificacion(p_pedido uuid, p_excluir_recibo uuid default null)
returns table(modelo text, cantidad_pm numeric, cantidad_registrada numeric, con_iluminacion boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
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
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where pv.pedido_id = p_pedido
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (not v_maq or public.descripcion_incluye_iluminacion(pi.descripcion))
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$function$;

-- create or replace conserva los permisos; se repiten para dejarlos a la vista.
revoke execute on function public.listar_ots_pm_electrificacion() from public, anon;
grant execute on function public.listar_ots_pm_electrificacion() to authenticated;
revoke execute on function public.listar_modelos_pm_electrificacion(uuid, uuid) from public, anon;
grant execute on function public.listar_modelos_pm_electrificacion(uuid, uuid) to authenticated;
