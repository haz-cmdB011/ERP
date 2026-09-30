-- PM contra cobrado: por PM y modelo, lo que Planeación declaró contra lo
-- capturado en recibos vigentes de Acabados, Armado y Electrificación. Usa las
-- mismas reglas que el control de 20260930191049_control_pm_recibos.sql:
-- muebles (MO padres) vigentes de la versión activa, recibos no cancelados, y
-- en Acabados/Armado los reprocesos van aparte (no gastan saldo). Incluye los
-- modelos cobrados que no están en el PM (cantidad_pm null).
--
-- cantidad_pm_iluminacion: la parte del PM con iluminación, que es contra lo
-- que se compara Electrificación cuando captura el maquilador.
--
-- Solo para el personal de Estimaciones (security definer: el maquilador no
-- puede leer pedidos ni los recibos de otros).

create or replace function public.pm_contra_cobrado(p_pedido uuid default null)
returns table(
  pedido_id uuid,
  numero_pedido text,
  orden_trabajo text,
  proyecto text,
  modelo text,
  descripcion text,
  cantidad_pm numeric,
  cantidad_pm_iluminacion numeric,
  acabados numeric,
  armado numeric,
  electrificacion numeric,
  reprocesos numeric,
  discrepancias_pendientes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
-- Las columnas de salida se llaman como columnas de las tablas (modelo,
-- pedido_id...): dentro de las consultas manda la columna.
#variable_conflict use_column
begin
  if not public.is_estimaciones() then
    raise exception 'Solo el personal de Estimaciones puede consultar el PM contra lo cobrado.';
  end if;

  return query
    with pms as (
      select p.id, p.numero_pedido, p.orden_trabajo, pr.nombre as proyecto
      from public.pedidos p
      left join public.proyectos pr on pr.id = p.proyecto_id
      where p.eliminado_en is null and p.eliminado_definitivo_en is null
        and (p_pedido is null or p.id = p_pedido)
    ),
    pm as (
      select pv.pedido_id, public.norm_modelo(pi.modelo) as clave,
        min(pi.modelo) as modelo,
        min(split_part(btrim(coalesce(pi.descripcion, '')), E'\n', 1)) as descripcion,
        sum(pi.cantidad_total) as cantidad,
        coalesce(sum(pi.cantidad_total)
          filter (where public.descripcion_incluye_iluminacion(pi.descripcion)), 0) as cantidad_ilum
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
      join pms on pms.id = pv.pedido_id
      where pi.tipo_registro = 'MO' and pi.parent_item_id is null
        and btrim(coalesce(pi.modelo, '')) <> ''
        and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
        and pi.eliminacion_solicitada_en is null
      group by pv.pedido_id, public.norm_modelo(pi.modelo)
    ),
    cobrado as (
      select rc.pedido_id, public.norm_modelo(g.modelo) as clave, min(g.modelo) as modelo,
        coalesce(sum(g.cantidad) filter (where rc.tipo = 'acabados' and g.tipo_trabajo <> 'reproceso'), 0) as acabados,
        coalesce(sum(g.cantidad) filter (where rc.tipo = 'armado' and g.tipo_trabajo <> 'reproceso'), 0) as armado,
        0::numeric as electrificacion,
        coalesce(sum(g.cantidad) filter (where g.tipo_trabajo = 'reproceso'), 0) as reprocesos
      from public.renglones g
      join public.recibos rc on rc.id = g.recibo_id
      join pms on pms.id = rc.pedido_id
      where rc.estado <> 'cancelado'
      group by rc.pedido_id, public.norm_modelo(g.modelo)
      union all
      select re.pedido_id, public.norm_modelo(re.modelo), min(re.modelo),
        0, 0, sum(re.cantidad), 0
      from public.renglones_electrificacion re
      join public.recibos_electrificacion rc on rc.id = re.recibo_id
      join pms on pms.id = re.pedido_id
      where rc.estado <> 'cancelado'
      group by re.pedido_id, public.norm_modelo(re.modelo)
    ),
    cobrado_modelo as (
      select c.pedido_id, c.clave, min(c.modelo) as modelo,
        sum(c.acabados) as acabados, sum(c.armado) as armado,
        sum(c.electrificacion) as electrificacion, sum(c.reprocesos) as reprocesos
      from cobrado c
      group by c.pedido_id, c.clave
    ),
    pendientes as (
      select d.pedido_id, public.norm_modelo(d.modelo) as clave, count(*) as n
      from public.discrepancias_pm d
      where d.estado = 'pendiente'
      group by d.pedido_id, public.norm_modelo(d.modelo)
    )
    select pms.id, pms.numero_pedido, pms.orden_trabajo, pms.proyecto,
      coalesce(pm.modelo, c.modelo), pm.descripcion,
      pm.cantidad, coalesce(pm.cantidad_ilum, 0),
      coalesce(c.acabados, 0), coalesce(c.armado, 0), coalesce(c.electrificacion, 0),
      coalesce(c.reprocesos, 0), coalesce(d.n, 0)
    from pm
    full join cobrado_modelo c on c.pedido_id = pm.pedido_id and c.clave = pm.clave
    join pms on pms.id = coalesce(pm.pedido_id, c.pedido_id)
    left join pendientes d
      on d.pedido_id = pms.id and d.clave = coalesce(pm.clave, c.clave)
    order by pms.numero_pedido, coalesce(pm.modelo, c.modelo);
end;
$function$;

revoke execute on function public.pm_contra_cobrado(uuid) from public, anon;
grant execute on function public.pm_contra_cobrado(uuid) to authenticated;
