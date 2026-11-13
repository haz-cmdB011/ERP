-- @verifica function-contiene public.crear_asignacion_produccion restaurar_crear_asignacion
-- @verifica function-contiene public.crear_asignacion_produccion requiere_despiece

-- ============================================================================
-- Producción — Restaura crear_asignacion_produccion.
--
-- La migración ruta_por_mueble_completo quitó con una expresión regular las validaciones de
-- Electrificación y Superficie Sólida, pero en PostgreSQL el '.*?' no fue perezoso (la
-- codicia de toda la expresión la fija su primer cuantificador) y borró también todo lo que
-- seguía hasta el insert: despiece obligatorio, equipo, paso de la ruta, tope y adelantada.
-- Asignar fallaba con 'record "v_paso" is not assigned yet'. Esta es la definición de
-- rutas_por_parte (la última completa) sin esas dos validaciones, escritas a mano.
-- guardar_ruta_produccion no se dañó (sus dos validaciones iban juntas).
-- ============================================================================

create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null,
  p_paso_id uuid default null,
  p_parte_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_equipo record;
  v_paso record;
  v_parte record;
  v_anterior record;
  v_tope numeric;
  v_ya numeric;
  v_listo numeric;
  v_partes jsonb;
  v_adelantada boolean := false;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_dueno text;
  v_unidad text;
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
  -- restaurar_crear_asignacion: Electrificación y S.S. las decide la ruta (ruta_por_mueble_completo).

  -- Con componentes en el PM, primero el despiece (despiece_porcentaje_obligatorio).
  if public.requiere_despiece(v_item.id) then
    raise exception 'El ítem % tiene componentes: guarda su despiece antes de asignarlo.', v_item.item_code;
  end if;

  if p_parte_id is not null then
    select pd.id, pd.descripcion, pd.piezas_por_mueble, pd.unidad into v_parte
      from public.partes_despiece pd
      where pd.id = p_parte_id and pd.planeacion_item_id = v_item.id and pd.retirada_en is null;
    if not found then
      raise exception 'Esa parte ya no está en el despiece del ítem %; recarga la página.', v_item.item_code;
    end if;
    v_dueno := format('"%s"', v_parte.descripcion);
    -- Tope por paso: una parte va en sus piezas; el mueble completo, en muebles.
    v_tope := v_item.cantidad_total * v_parte.piezas_por_mueble;
    v_unidad := coalesce(v_parte.unidad, v_item.unidad);
  else
    v_dueno := 'el mueble completo';
    v_tope := v_item.cantidad_total;
    v_unidad := v_item.unidad;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  perform public.asegurar_ruta_produccion(v_item.id);
  if p_paso_id is not null then
    select s.id, s.orden, s.proceso, s.parte_id into v_paso
      from public.pasos_ruta_produccion s
      where s.id = p_paso_id and s.planeacion_item_id = v_item.id and s.retirado_en is null;
    if not found then
      raise exception 'Ese paso ya no está en la ruta del ítem %; recarga la página.', v_item.item_code;
    end if;
    if v_paso.parte_id is distinct from p_parte_id then
      raise exception 'Ese paso no es de la ruta de %; recarga la página.', v_dueno;
    end if;
    if v_paso.proceso <> p_proceso then
      raise exception 'El paso % de la ruta es de %, no de %.', v_paso.orden, v_paso.proceso, p_proceso;
    end if;
  else
    -- El primer paso de ese proceso en la ruta del dueño que todavía tiene lugar.
    select s.id, s.orden, s.proceso, s.parte_id into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and s.parte_id is not distinct from p_parte_id
        and (
          select coalesce(sum(a.cantidad), 0)
          from public.asignaciones_produccion a
          where a.paso_id = s.id and a.cancelada_en is null and a.informe_rechazo_id is null
            and a.revision_final_rechazo_id is null
        ) < v_tope
      order by s.orden
      limit 1;
    if not found then
      if exists (
        select 1 from public.pasos_ruta_produccion s
        where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
          and s.parte_id is not distinct from p_parte_id
      ) then
        raise exception 'Ya está asignado todo % del ítem % en %.', v_dueno, v_item.item_code, p_proceso;
      end if;
      raise exception 'La ruta de % (ítem %) no lleva %; agrégalo a su ruta primero.',
        v_dueno, v_item.item_code, p_proceso;
    end if;
  end if;

  select coalesce(sum(cantidad), 0) into v_ya
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
      and revision_final_rechazo_id is null;
  if v_ya + p_cantidad > v_tope then
    if p_parte_id is null then
      raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_tope - v_ya, v_tope, v_ya;
    end if;
    raise exception 'En el paso % (%), "%" solo tiene % pieza(s) por asignar de % (ya asignadas: %).',
      v_paso.orden, p_proceso, v_parte.descripcion, v_tope - v_ya, v_tope, v_ya;
  end if;

  -- Adelantada: más de lo que el paso anterior del dueño ya entregó y se verificó. El
  -- primer paso del mueble completo va detrás de sus partes (la más atrasada).
  select s.id into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
      and s.parte_id is not distinct from p_parte_id
    order by s.orden desc
    limit 1;
  if found then
    select coalesce(sum(x.cantidad), 0) into v_listo
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior.id and a.cancelada_en is null and a.informe_rechazo_id is null
        and a.revision_final_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
  elsif p_parte_id is null then
    select coalesce(jsonb_object_agg(t.paso_id, t.n), '{}'::jsonb) into v_partes
      from (
        select a.paso_id, sum(x.cantidad) as n
        from public.entregas_produccion x
        join public.asignaciones_produccion a on a.id = x.asignacion_id
        where a.planeacion_item_id = v_item.id and a.parte_id is not null and a.paso_id is not null
          and a.cancelada_en is null and a.informe_rechazo_id is null
          and a.revision_final_rechazo_id is null
          and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null
        group by a.paso_id
      ) t;
    v_listo := public.muebles_por_partes(v_item.id, v_partes);
  end if;
  v_adelantada := v_listo is not null and v_ya + p_cantidad > v_listo;

  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado,
    paso_id, adelantada, parte_id
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada, p_parte_id
  )
  returning id into v_id;

  return v_id;
end;
$$;
