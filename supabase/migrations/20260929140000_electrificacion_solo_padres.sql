-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.cantidad_pm_modelo parent_item_id is null
-- @verifica function-contiene public.listar_ots_pm_electrificacion parent_item_id is null
-- @verifica function-contiene public.listar_modelos_pm_electrificacion parent_item_id is null

-- ============================================================================
-- Electrificación — la cantidad de referencia del PM sale SOLO de los ítems
-- PADRE (tipo_registro 'MO' sin parent_item_id), para todos los roles.
--
-- CORRECCIÓN: los hijos (FU) llevan el mismo nombre de modelo que su padre, así
-- que sumar "todas las filas del modelo" contaba también a los hijos (por
-- ejemplo FXIJ-12 en 1PM168-25: 1 del padre + 13 de sus hijos = 14, cuando el
-- padre declara 1). El PM sumaba 17,221 piezas contando todo y 2,897 contando
-- solo padres.
--
-- Además, para el maquilador se mantiene el filtro de la descripción
-- ("INCLUYE ILUMINACIÓN" / "CON ILUMINACIÓN") de la migración anterior.
-- Solo se reemplazan tres funciones (misma firma); guardar/modificar llaman a
-- cantidad_pm_modelo y heredan el cambio.
-- ============================================================================

-- Lo que Planeación declaró para ese modelo en esa OT (solo padres); null si
-- el modelo no existe como padre. Para un maquilador, solo los padres con
-- iluminación.
create or replace function public.cantidad_pm_modelo(p_pedido uuid, p_modelo text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select sum(pi.cantidad_total)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  where pv.pedido_id = p_pedido
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (not public.is_maquilador() or public.descripcion_incluye_iluminacion(pi.descripcion));
$$;

-- OT visibles: totales solo con padres. Para el maquilador, solo las OT que
-- tienen al menos un padre con iluminación (y sus totales cuentan esos padres).
create or replace function public.listar_ots_pm_electrificacion()
returns table (
  pedido_id uuid,
  numero_pedido text,
  proyecto text,
  num_modelos bigint,
  piezas numeric
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
    group by p.id, p.numero_pedido, pr.nombre
    having not v_maq or count(pi.id) > 0
    order by p.numero_pedido;
end;
$$;

-- Modelos de una OT (solo padres) con lo declarado y lo ya registrado en otros
-- recibos. Para el maquilador, solo los padres con iluminación.
create or replace function public.listar_modelos_pm_electrificacion(
  p_pedido uuid,
  p_excluir_recibo uuid default null
)
returns table (
  modelo text,
  cantidad_pm numeric,
  cantidad_registrada numeric
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
      public.cantidad_registrada_modelo(p_pedido, min(pi.modelo), p_excluir_recibo)
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
