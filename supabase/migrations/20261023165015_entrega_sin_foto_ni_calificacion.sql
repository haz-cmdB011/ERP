-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.entregas_produccion.clave_envio
-- @verifica function-contiene public.registrar_entrega_produccion p_clave_envio

-- ============================================================================
-- Producción — la entrega se registra sin foto y sin calificar las piezas.
--
--   * Producción ya no dice si las piezas cumplen: solo registra la entrega
--     (fecha, cantidad, folio) y esta pasa a Calidad, que es quien evalúa.
--     La función nace la entrega verificada (como hacía "Cumplen"). p_resultado
--     se conserva para capturas que quedaron en la cola de algún celular con la
--     pantalla anterior.
--   * La foto de la hoja deja de pedirse (foto_path opcional). Las entregas
--     viejas conservan la suya.
--   * Repetir un envío sigue sin duplicar: antes lo impedía el índice único de
--     foto_path; ahora lo hace la clave de envío (entregas_produccion.clave_envio,
--     única), que manda el celular con cada captura.
-- ============================================================================

alter table public.entregas_produccion
  alter column foto_path drop not null,
  add column clave_envio text;

create unique index idx_entregas_produccion_clave_envio_unica
  on public.entregas_produccion (clave_envio)
  where clave_envio is not null;

drop function public.registrar_entrega_produccion(uuid, date, numeric, text, text, text, text);

create function public.registrar_entrega_produccion(
  p_asignacion_id uuid,
  p_fecha_entrega date,
  p_cantidad numeric,
  p_folios_calidad text,
  p_clave_envio text default null,
  p_foto_path text default null,
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
  v_clave text := nullif(btrim(coalesce(p_clave_envio, '')), '');
  -- Sin calificación (pantalla nueva): pasa a Calidad.
  v_resultado text := coalesce(p_resultado, 'cumple');
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if v_clave is not null and length(v_clave) > 100 then
    raise exception 'La clave de envío no es válida.';
  end if;

  -- El mismo envío repetido (la red se cortó antes de la respuesta): la misma entrega.
  if v_clave is not null then
    select e.id into v_id
      from public.entregas_produccion e
      where e.clave_envio = v_clave and e.asignacion_id = p_asignacion_id;
    if found then
      return v_id;
    end if;
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
  -- La foto ya no se pide; si viene (capturas viejas), en la carpeta de la asignación.
  if p_foto_path is not null and p_foto_path not like p_asignacion_id::text || '/%' then
    raise exception 'La foto no es de esta asignación.';
  end if;
  if v_resultado not in ('cumple', 'no_cumple') then
    raise exception 'Resultado no válido.';
  end if;
  if v_resultado = 'no_cumple' and nullif(btrim(coalesce(p_motivo_rechazo, '')), '') is null then
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
    asignacion_id, fecha_entrega, cantidad, folios_calidad, foto_path, clave_envio, registrado_por,
    verificada_en, verificada_por, rechazada_en, rechazada_por, motivo_rechazo
  ) values (
    p_asignacion_id, p_fecha_entrega, p_cantidad, btrim(p_folios_calidad), p_foto_path, v_clave, auth.uid(),
    case when v_resultado = 'cumple' then now() end,
    case when v_resultado = 'cumple' then auth.uid() end,
    case when v_resultado = 'no_cumple' then now() end,
    case when v_resultado = 'no_cumple' then auth.uid() end,
    case when v_resultado = 'no_cumple' then btrim(p_motivo_rechazo) end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.registrar_entrega_produccion(uuid, date, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_entrega_produccion(uuid, date, numeric, text, text, text, text, text) to authenticated;
