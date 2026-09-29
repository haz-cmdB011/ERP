-- ============================================================================
-- Electrificación — el maquilador solo ve (y se compara contra) los ítems
-- PADRE cuya descripción incluye la frase "INCLUYE ILUMINACIÓN".
--
-- Padre = tipo_registro 'MO' sin parent_item_id. La cantidad de referencia es
-- la cantidad_total del padre (suma por OT + modelo). Afecta SOLO a quien es
-- maquilador: el personal de Estimaciones sigue viendo y comparando contra
-- todos los modelos del PM, como antes.
--
-- Cuentan las descripciones con "INCLUYE ILUMINACIÓN" o con "CON ILUMINACIÓN".
-- Se buscan sin distinguir mayúsculas, acentos ni espacios repetidos
-- ("ILUMINACIÓN" / "ILUMINACION"), y NO cuenta cuando dice "NO INCLUYE
-- ILUMINACIÓN" (esa frase contiene a la buscada).
--
-- Solo se reemplazan tres funciones; guardar/modificar_recibo_electrificacion
-- llaman a cantidad_pm_modelo y heredan el filtro sin cambios.
-- ============================================================================

create or replace function public.descripcion_incluye_iluminacion(p_descripcion text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d like '%incluye iluminacion%' or d like '%con iluminacion%'
  from (
    select replace(
             regexp_replace(
               translate(lower(coalesce(p_descripcion, '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'),
               '\s+', ' ', 'g'),
             'no incluye iluminacion', '') as d
  ) t;
$$;
revoke execute on function public.descripcion_incluye_iluminacion(text) from public, anon, authenticated;

-- Lo que Planeación declaró para ese modelo en esa OT; null si no existe. Para
-- un maquilador, solo cuentan los padres con "INCLUYE ILUMINACIÓN".
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
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (
      not public.is_maquilador()
      or (pi.tipo_registro = 'MO' and pi.parent_item_id is null
          and public.descripcion_incluye_iluminacion(pi.descripcion))
    );
$$;

-- OT visibles: para el maquilador, solo las que tienen al menos un padre con
-- "INCLUYE ILUMINACIÓN" (y sus totales cuentan solo esos padres).
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
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (
        not v_maq
        or (pi.tipo_registro = 'MO' and pi.parent_item_id is null
            and public.descripcion_incluye_iluminacion(pi.descripcion))
      )
    where p.eliminado_en is null
    group by p.id, p.numero_pedido, pr.nombre
    having not v_maq or count(pi.id) > 0
    order by p.numero_pedido;
end;
$$;

-- Modelos de una OT con lo declarado y lo ya registrado en otros recibos. Para
-- el maquilador, solo los padres con "INCLUYE ILUMINACIÓN", con la cantidad
-- del padre como referencia.
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
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (
        not v_maq
        or (pi.tipo_registro = 'MO' and pi.parent_item_id is null
            and public.descripcion_incluye_iluminacion(pi.descripcion))
      )
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$$;
