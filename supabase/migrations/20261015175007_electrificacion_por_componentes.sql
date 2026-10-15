-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.admite_electrificacion
-- @verifica function-contiene public.crear_asignacion_produccion admite_electrificacion

-- ============================================================================
-- Producción — Electrificación también se detecta por los componentes.
--
-- Un mueble padre admite Electrificación si él o alguno de sus componentes (hijos)
-- menciona iluminación (misma regla de Estimaciones) o "electrificación" (ej. una
-- "CHAROLA ELECTRIFICACIÓN"). Estimaciones conserva su regla (solo el padre).
-- ============================================================================

create or replace function public.admite_electrificacion(p_item_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.planeacion_items x
    where (x.id = p_item_id or x.parent_item_id = p_item_id)
      and (
        public.descripcion_incluye_iluminacion(x.descripcion)
        or regexp_replace(
             regexp_replace(
               translate(lower(coalesce(x.descripcion, '')), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuaeiouu'),
               '\s+', ' ', 'g'),
             '\m(no incluyen?|no llevan?|sin)( (la|el|las|los))? electrificacion\M', '', 'g')
           ~ 'electrific'
      )
  );
$$;

revoke execute on function public.admite_electrificacion(uuid) from public, anon;
grant execute on function public.admite_electrificacion(uuid) to authenticated;

create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_equipo record;
  v_asignado numeric;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null
     or p_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida') then
    raise exception 'Proceso no válido.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;
  if v_encargado is not null and char_length(v_encargado) > 80 then
    raise exception 'El nombre del encargado es demasiado largo.';
  end if;

  -- Bloquea el ítem: dos asignaciones simultáneas del mismo mueble se
  -- atienden una tras otra y no pueden pasarse juntas de la cantidad.
  select pi.id, pi.item_code, pi.modelo, pi.descripcion, pi.unidad, pi.cantidad_total,
         pi.tipo_registro, pi.estado_liberacion, pi.eliminacion_solicitada_en,
         pi.estado_revision, pv.es_version_activa,
         p.id as pedido_id, p.numero_pedido, p.eliminado_en, p.cancelado_en
    into v_item
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where pi.id = p_item_id
    for update of pi;

  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.tipo_registro <> 'MO' then
    raise exception 'Solo se asignan muebles (ítems padre), no componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; asigna desde la versión activa.';
  end if;
  if v_item.estado_liberacion <> 'enviado_a_produccion' then
    raise exception 'El ítem % todavía no está liberado a producción.', v_item.item_code;
  end if;
  if v_item.eliminacion_solicitada_en is not null
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El ítem % o su PM está cancelado o eliminado.', v_item.item_code;
  end if;
  -- Solo se electrifica lo que la lleva (en el mueble o en sus componentes).
  if p_proceso = 'electrificacion'
     and not public.admite_electrificacion(v_item.id) then
    raise exception 'El ítem % no lleva electrificación ni iluminación; no se asigna a Electrificación.', v_item.item_code;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  -- El retrabajo no cuenta contra la cantidad del mueble (informe_rechazo_id).
  select coalesce(sum(cantidad), 0) into v_asignado
    from public.asignaciones_produccion
    where planeacion_item_id = p_item_id and proceso = p_proceso and cancelada_en is null
      and informe_rechazo_id is null;

  if v_asignado + p_cantidad > v_item.cantidad_total then
    raise exception 'Solo quedan % por asignar de % para % (ya asignadas: %).',
      v_item.cantidad_total - v_asignado, v_item.cantidad_total, p_proceso, v_asignado;
  end if;

  -- El nombre queda guardado en el equipo para elegirlo la próxima vez.
  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text) from public, anon;
grant execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text) to authenticated;
