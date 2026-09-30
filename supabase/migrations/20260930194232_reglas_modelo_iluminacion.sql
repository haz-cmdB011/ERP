-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.norm_modelo A-Z0-9Ñ
-- @verifica function-contiene public.cantidad_pm_modelo and public.descripcion_incluye_iluminacion(pi.descripcion)

-- Dos reglas únicas para comparar recibos contra el PM.
--
-- 1. Modelos: norm_modelo ahora ignora mayúsculas, acentos, espacios, guiones,
--    puntos y cualquier signo, así que "MS-01", "MS 01", "ms01" y "Ms.01" son
--    el mismo modelo. Antes solo ignoraba mayúsculas y espacios de más, y un
--    guion de diferencia contaba como otro modelo (fuera del PM). Todas las
--    funciones del control (trigger, cantidades, listas, PM contra cobrado)
--    usan norm_modelo, así que la regla aplica en todas partes a la vez. No
--    hay índices sobre norm_modelo que reconstruir.
--
-- 2. Iluminación: Electrificación se mide contra los muebles con iluminación
--    para todos. Antes solo al maquilador se le comparaba contra esos; al
--    personal de Estimaciones contra todos los muebles del modelo, así que el
--    mismo recibo podía cuadrar o no según quién lo capturara. Un modelo sin
--    iluminación en la OT cuenta como "no está en el PM" de Electrificación
--    (se puede capturar con motivo, y queda como discrepancia).

create or replace function public.norm_modelo(p_modelo text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select regexp_replace(
    upper(translate(coalesce(p_modelo, ''), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuAEIOUU')),
    '[^A-Z0-9Ñ]', '', 'g');
$function$;

create or replace function public.cantidad_pm_modelo(p_pedido uuid, p_modelo text)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(pi.cantidad_total)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  where pv.pedido_id = p_pedido
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and public.descripcion_incluye_iluminacion(pi.descripcion);
$function$;

create or replace function public.listar_ots_pm_electrificacion()
returns table(pedido_id uuid, numero_pedido text, proyecto text, num_modelos bigint, piezas numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  -- Solo las OT con muebles con iluminación: es lo único que se electrifica.
  return query
    select p.id, p.numero_pedido, pr.nombre,
      count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> ''),
      coalesce(sum(pi.cantidad_total), 0)
    from public.pedidos p
    join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
    left join public.proyectos pr on pr.id = p.proyecto_id
    join public.planeacion_items pi
      on pi.pedido_version_id = pv.id
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and public.descripcion_incluye_iluminacion(pi.descripcion)
    where p.eliminado_en is null
      and p.eliminado_definitivo_en is null
    group by p.id, p.numero_pedido, pr.nombre
    order by p.numero_pedido;
end;
$function$;

-- Mismas columnas que antes (con_iluminacion queda siempre en true) para no
-- cambiar la firma que usa la pantalla.
create or replace function public.listar_modelos_pm_electrificacion(p_pedido uuid, p_excluir_recibo uuid default null)
returns table(modelo text, cantidad_pm numeric, cantidad_registrada numeric, con_iluminacion boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      public.cantidad_registrada_modelo(p_pedido, min(pi.modelo), p_excluir_recibo),
      true
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where pv.pedido_id = p_pedido
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and public.descripcion_incluye_iluminacion(pi.descripcion)
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$function$;
