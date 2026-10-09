-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.registrar_entrega_produccion p_resultado
-- @verifica function-contiene public.auditar_produccion_calidad nace ya revisada

-- ============================================================================
-- Foto y preaprobación en un solo paso.
--
-- En el taller, quien va a ver lo que terminó un equipo toma la foto de la hoja
-- y en ese momento decide si las piezas cumplen. El sistema lo pedía en dos
-- pasos (registrar la entrega y, aparte, "Cumple: mandar a Calidad") y si el
-- segundo no se hacía Calidad no veía nada que evaluar. Por eso se apagó la
-- verificación (20261009151636_calidad_sin_verificacion_produccion).
--
-- 1. registrar_entrega_produccion recibe la decisión de quien registra:
--      * 'cumple': la entrega nace verificada y pasa a Calidad como lote;
--      * 'no_cumple' (con motivo): nace rechazada, no cuenta como entregada y
--        el equipo vuelve a entregar esas piezas;
--      * sin decisión (null): nace "por verificar", como antes. Así siguen
--        sirviendo las capturas que se guardaron sin red con la versión
--        anterior de la pantalla, y los botones de verificar/rechazar.
--    La función vieja (cinco parámetros) se borra: con las dos, una llamada
--    con cinco parámetros sería ambigua.
--
-- 2. La bitácora registra también la decisión de una entrega que nace ya
--    revisada (verificada o rechazada), no solo que se registró.
--
-- 3. Se vuelve a encender la verificación de Producción
--    (ajustes_flujo.verificacion_produccion). Para apagarla otra vez:
--        update public.ajustes_flujo set activo = false, actualizado_en = now()
--          where clave = 'verificacion_produccion';
--
-- Aplicar ANTES de fusionar el PR: la pantalla nueva manda p_resultado.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Registrar la entrega con la decisión
-- ---------------------------------------------------------------------------
drop function if exists public.registrar_entrega_produccion(uuid, date, numeric, text, text);

create function public.registrar_entrega_produccion(
  p_asignacion_id uuid,
  p_fecha_entrega date,
  p_cantidad numeric,
  p_folios_calidad text,
  p_foto_path text,
  p_resultado text default null,
  p_motivo_rechazo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asignacion record;
  v_entregado numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_entrega is null then
    raise exception 'Falta la fecha de entrega.';
  end if;
  if nullif(btrim(coalesce(p_folios_calidad, '')), '') is null then
    raise exception 'Escribe el folio de la hoja de entrega.';
  end if;
  -- La foto se sube antes, en una carpeta con el id de la asignación.
  if p_foto_path is null or p_foto_path not like p_asignacion_id::text || '/%' then
    raise exception 'Falta la foto de la hoja de entrega.';
  end if;
  if p_resultado is not null and p_resultado not in ('cumple', 'no_cumple') then
    raise exception 'Indica si las piezas cumplen o no.';
  end if;
  if p_resultado = 'no_cumple' and nullif(btrim(coalesce(p_motivo_rechazo, '')), '') is null then
    raise exception 'Escribe por qué no cumplen las piezas.';
  end if;

  select id, cantidad, fecha_asignacion, cancelada_en into v_asignacion
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_asignacion.cancelada_en is not null then
    raise exception 'La asignación está cancelada.';
  end if;
  if p_fecha_entrega < v_asignacion.fecha_asignacion then
    raise exception 'La fecha de entrega no puede ser anterior a la de asignación (%).',
      to_char(v_asignacion.fecha_asignacion, 'DD/MM/YYYY');
  end if;
  if p_fecha_entrega > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de entrega no puede ser futura.';
  end if;

  select coalesce(sum(cantidad), 0) into v_entregado
    from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null;
  if v_entregado + p_cantidad > v_asignacion.cantidad then
    raise exception 'Solo faltan % por entregar de %.',
      v_asignacion.cantidad - v_entregado, v_asignacion.cantidad;
  end if;

  insert into public.entregas_produccion (
    asignacion_id, fecha_entrega, cantidad, folios_calidad, foto_path, registrado_por,
    verificada_en, verificada_por, rechazada_en, rechazada_por, motivo_rechazo
  ) values (
    p_asignacion_id, p_fecha_entrega, p_cantidad, btrim(p_folios_calidad), p_foto_path, auth.uid(),
    case when p_resultado = 'cumple' then now() end,
    case when p_resultado = 'cumple' then auth.uid() end,
    case when p_resultado = 'no_cumple' then now() end,
    case when p_resultado = 'no_cumple' then auth.uid() end,
    case when p_resultado = 'no_cumple' then btrim(p_motivo_rechazo) end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_entrega_produccion(uuid, date, numeric, text, text, text, text)
  from public, anon;
grant execute on function public.registrar_entrega_produccion(uuid, date, numeric, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bitácora: la decisión de una entrega que nace ya revisada
-- ---------------------------------------------------------------------------
create or replace function public.auditar_produccion_calidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_a record;
  v_equipo text;
  v_item record;
begin
  if tg_table_name = 'asignaciones_produccion' then
    select nombre into v_equipo from public.equipos_produccion where id = new.equipo_id;
    if tg_op = 'INSERT' then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id,
                case when new.informe_rechazo_id is not null then 'retrabajo_asignado' else 'asignado' end,
                jsonb_build_object(
                  'numero_pedido', new.numero_pedido, 'item_code', new.item_code, 'modelo', new.modelo,
                  'equipo', v_equipo, 'proceso', new.proceso, 'cantidad', new.cantidad,
                  'folio', (select folio from public.informes_calidad where id = new.informe_rechazo_id)
                ));
    elsif old.cancelada_en is null and new.cancelada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'asignacion_cancelada',
                jsonb_build_object(
                  'numero_pedido', new.numero_pedido, 'item_code', new.item_code, 'modelo', new.modelo,
                  'equipo', v_equipo, 'proceso', new.proceso, 'cantidad', new.cantidad,
                  'motivo', new.motivo_cancelacion
                ));
    end if;
    return new;
  end if;

  if tg_table_name = 'entregas_produccion' then
    select a.numero_pedido, a.item_code, a.modelo, a.proceso, q.nombre as equipo
      into v_a
      from public.asignaciones_produccion a
      join public.equipos_produccion q on q.id = a.equipo_id
      where a.id = new.asignacion_id;
    if tg_op = 'INSERT' then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_registrada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad
                ));
      -- La entrega nace ya revisada cuando quien toma la foto decide en ese
      -- momento si cumple (o si la verificación está apagada): también se
      -- registra esa decisión.
      if new.verificada_en is not null then
        insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
          values (v_usuario, tg_table_name, new.id, 'entrega_verificada',
                  jsonb_build_object(
                    'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                    'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                    'folio', new.folios_calidad
                  ));
      end if;
      if new.rechazada_en is not null then
        insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
          values (v_usuario, tg_table_name, new.id, 'entrega_rechazada',
                  jsonb_build_object(
                    'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                    'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                    'folio', new.folios_calidad, 'motivo', new.motivo_rechazo
                  ));
      end if;
      return new;
    end if;
    if old.verificada_en is null and new.verificada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_verificada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad
                ));
    end if;
    if old.rechazada_en is null and new.rechazada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_rechazada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad, 'motivo', new.motivo_rechazo
                ));
    end if;
    if old.anulada_en is null and new.anulada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_anulada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad, 'motivo', new.motivo_anulacion
                ));
    end if;
    return new;
  end if;

  if tg_table_name = 'informes_calidad' then
    -- Solo INSERT: los informes no se editan ni se borran.
    select pi.item_code, pi.modelo, p.numero_pedido
      into v_item
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id
      join public.pedidos p on p.id = pv.pedido_id
      where pi.id = new.planeacion_item_id;
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id,
              case when new.aprobado then 'informe_aprobado' else 'informe_no_aprobado' end,
              jsonb_build_object(
                'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code, 'modelo', v_item.modelo,
                'folio', new.folio, 'cantidad', new.cantidad, 'motivo', new.descripcion,
                'categoria', new.categoria
              ));
    return new;
  end if;

  -- equipos_produccion
  if tg_op = 'INSERT' then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id, 'equipo_creado',
              jsonb_build_object('equipo', new.nombre, 'proceso', array_to_string(new.procesos, ', ')));
  elsif old.activo is distinct from new.activo then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id,
              case when new.activo then 'equipo_reactivado' else 'equipo_desactivado' end,
              jsonb_build_object('equipo', new.nombre, 'proceso', array_to_string(new.procesos, ', ')));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Se vuelve a encender la verificación de Producción
-- ---------------------------------------------------------------------------
update public.ajustes_flujo
  set activo = true, actualizado_en = now()
  where clave = 'verificacion_produccion';
