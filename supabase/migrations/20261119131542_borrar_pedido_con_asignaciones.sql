-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.eliminar_pedido_definitivo asignaciones_produccion
--
-- Eliminar definitivamente un pedido que ya tiene asignaciones de Producción.
--
-- Las asignaciones sobreviven al pedido: sus llaves a pedido y mueble son ON DELETE SET NULL. Al borrar el
-- pedido, esas acciones se disparan en cadena junto con las de ruta, informe y parte (que también tocan la
-- fila de la asignación). En una simulación de punta a punta, borrar un pedido con una asignación fallaba con
-- "violates foreign key constraint asignaciones_produccion_planeacion_item_id_fkey": Postgres vuelve a validar
-- la llave de una fila que ya se tocó en la misma transacción, y el mueble ya no existe.
-- Para que el borrado no dependa de ese orden, se sueltan las asignaciones (pedido y mueble en null) ANTES de
-- borrar: es exactamente lo que la base hacía sola, pero en un solo paso y sin filas a medias.
-- Solo cambia eso; el resto de la función es igual a la vigente.

create or replace function public.eliminar_pedido_definitivo(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tiene_informes boolean;
  v_items uuid[];
begin
  if not (public.is_admin() or public.is_admin_planeacion()) then
    raise exception 'Solo un administrador de Planeación o desarrollador puede eliminar definitivamente.';
  end if;

  select array_agg(pi.id) into v_items
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    where pv.pedido_id = p_pedido_id;

  select exists (
    select 1 from public.informes_calidad where planeacion_item_id = any(coalesce(v_items, '{}'))
  ) into v_tiene_informes;

  if v_tiene_informes and not public.is_admin() then
    update public.pedidos
      set cancelado_en = coalesce(cancelado_en, now()),
          cancelado_por = coalesce(cancelado_por, auth.uid()),
          motivo_cancelacion = 'Eliminado — folio(s) de Calidad conservados',
          eliminado_definitivo_en = now(),
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

  -- Las asignaciones de Producción se conservan, sin pedido ni mueble (ver arriba).
  update public.asignaciones_produccion set planeacion_item_id = null
    where planeacion_item_id = any(coalesce(v_items, '{}'));
  update public.asignaciones_produccion set pedido_id = null
    where pedido_id = p_pedido_id;

  if v_items is not null and public.is_admin() then
    perform public.limpiar_dependencias_items(v_items);
  elsif v_items is not null then
    update public.renglones_electrificacion set planeacion_item_id = null
      where planeacion_item_id = any(v_items);
  end if;

  delete from public.pedidos where id = p_pedido_id;

  if not found then
    raise exception 'El pedido no existe.';
  end if;

  return false;
end;
$function$;
