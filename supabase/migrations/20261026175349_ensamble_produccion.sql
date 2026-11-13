-- REEMPLAZADA por rutas_por_parte (mismo día): el Ensamble dejó de ser un proceso y cada
-- parte tiene su propia ruta. Se conserva porque quedó aplicada en la base; lo que dejó
-- (admite_ensamble, equipo_hace, el proceso 'ensamble') lo quita la siguiente, así que
-- aquí solo se comprueban las restricciones que siguen existiendo.
-- @verifica constraint public.asignaciones_produccion.asignaciones_produccion_proceso_check
-- @verifica constraint public.pasos_ruta_produccion.pasos_ruta_produccion_proceso_check

-- ============================================================================
-- Producción — Ensamble: después de armar cada parte del despiece por separado, el
-- mueble se ensambla completo (ej. ATS HALO: 6 partes, cada una a un equipo, y
-- después se arma todo el mueble).
--
--   * Proceso nuevo 'ensamble' en la ruta del mueble. La ruta sugerida lo pone justo
--     después de Armado en los muebles con dos o más partes que pasan por Armado
--     (admite_ensamble). Lo hacen los equipos de Armado (equipo_hace): no es un
--     proceso de equipo ni de una parte (una parte no puede omitirlo).
--   * El ensamble se asigna en MUEBLES (el mueble completo, uno o varios equipos).
--     Antes del ensamble, un mueble con componentes se asigna solo por partes (como
--     hasta ahora); después, por partes o como mueble completo. Lo listo para
--     ensamblar sale de la parte más atrasada en el paso anterior (cobertura_por_partes,
--     sin cambios).
--   * La ruta se vuelve a editar, solo a nivel mueble (guardar_ruta_produccion): un
--     paso de Ensamble nuevo exige admite_ensamble; los pasos con asignaciones no
--     cambian de orden entre sí, y lo asignado como mueble completo de un mueble con
--     componentes no puede quedar antes del Ensamble.
--   * Revisión final (piezas_listas_revision_final): cada parte cuenta lo del mueble
--     completo y lo suyo en el último paso que lleva. Antes lo del mueble completo solo
--     contaba en el último paso de la ruta, así que una parte cuyo último paso es el
--     Ensamble (ej. el herraje, que no va a Barniz) se quedaba en 0.
--   * El cobro no cambia todavía: el ensamble no cuenta en Estimaciones (fase 2).
-- ============================================================================

-- 1. El proceso ensamble ---------------------------------------------------------------------
alter table public.asignaciones_produccion drop constraint asignaciones_produccion_proceso_check;
alter table public.asignaciones_produccion add constraint asignaciones_produccion_proceso_check
  check (proceso = any (array['armado', 'barniz', 'electrificacion', 'superficie_solida', 'ensamble']));

alter table public.pasos_ruta_produccion drop constraint pasos_ruta_produccion_proceso_check;
alter table public.pasos_ruta_produccion add constraint pasos_ruta_produccion_proceso_check
  check (proceso = any (array['armado', 'barniz', 'electrificacion', 'superficie_solida', 'ensamble']));

-- Un mueble lleva Ensamble si tiene dos o más partes vigentes que pasan por Armado.
create or replace function public.admite_ensamble(p_item_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 2
  from public.partes_despiece pd
  where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
    and not ('armado' = any (pd.procesos_omitidos));
$$;

revoke execute on function public.admite_ensamble(uuid) from public, anon;
grant execute on function public.admite_ensamble(uuid) to authenticated;

-- ¿El equipo hace el proceso? El ensamble lo hacen los equipos de Armado.
create or replace function public.equipo_hace(p_procesos text[], p_proceso text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (case when p_proceso = 'ensamble' then 'armado' else p_proceso end) = any (p_procesos);
$$;

revoke execute on function public.equipo_hace(text[], text) from public, anon;
grant execute on function public.equipo_hace(text[], text) to authenticated;

-- 2. Ruta sugerida: Armado → Ensamble → S.S. → Barniz → Electrificación --------------------------
create or replace function public.ruta_sugerida_produccion(p_item_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array['armado']
    || case when public.admite_ensamble(p_item_id) then array['ensamble'] else '{}'::text[] end
    || case when public.admite_superficie_solida(p_item_id) then array['superficie_solida'] else '{}'::text[] end
    || array['barniz']
    || case when public.admite_electrificacion(p_item_id) then array['electrificacion'] else '{}'::text[] end;
$$;

-- 3. Asignar: el ensamble en muebles; después del ensamble, por partes o mueble completo ----
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
  v_asignado numeric;
  v_asignado_parte numeric := 0;
  v_max_parte numeric;
  v_tope numeric;
  v_ya numeric;
  v_listo_mueble numeric;
  v_listo_partes jsonb;
  v_listo numeric;
  v_adelantada boolean := false;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null
     or p_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida', 'ensamble') then
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
  if p_proceso = 'electrificacion'
     and not public.admite_electrificacion(v_item.id) then
    raise exception 'El ítem % no lleva electrificación ni iluminación; no se asigna a Electrificación.', v_item.item_code;
  end if;
  if p_proceso = 'superficie_solida'
     and not public.admite_superficie_solida(v_item.id) then
    raise exception 'El ítem % no lleva superficie sólida; no se asigna a Superficie Sólida.', v_item.item_code;
  end if;

  -- Con componentes en el PM, primero el despiece (despiece_porcentaje_obligatorio).
  if public.requiere_despiece(v_item.id) then
    raise exception 'El ítem % tiene componentes: guarda su despiece antes de asignarlo.', v_item.item_code;
  end if;

  -- El ensamble es del mueble completo, nunca de una parte.
  if p_proceso = 'ensamble' and p_parte_id is not null then
    raise exception 'El ensamble se asigna con el mueble completo, no por partes.';
  end if;

  if p_parte_id is not null then
    select pd.id, pd.descripcion, pd.piezas_por_mueble, pd.unidad, pd.procesos_omitidos into v_parte
      from public.partes_despiece pd
      where pd.id = p_parte_id and pd.planeacion_item_id = v_item.id and pd.retirada_en is null;
    if not found then
      raise exception 'Esa parte ya no está en el despiece del ítem %; recarga la página.', v_item.item_code;
    end if;
    if p_proceso = any (v_parte.procesos_omitidos) then
      raise exception '"%" no lleva %.', v_parte.descripcion, p_proceso;
    end if;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not public.equipo_hace(v_equipo.procesos, p_proceso) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre,
      case when p_proceso = 'ensamble' then 'armado (el ensamble lo hacen los equipos de armado)' else p_proceso end;
  end if;

  v_tope := case when p_parte_id is null then v_item.cantidad_total
                 else v_item.cantidad_total * v_parte.piezas_por_mueble end;

  perform public.asegurar_ruta_produccion(v_item.id);
  if p_paso_id is not null then
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.id = p_paso_id and s.planeacion_item_id = v_item.id and s.retirado_en is null;
    if not found then
      raise exception 'Ese paso ya no está en la ruta del ítem %; recarga la página.', v_item.item_code;
    end if;
    if v_paso.proceso <> p_proceso then
      raise exception 'El paso % de la ruta es de %, no de %.', v_paso.orden, v_paso.proceso, p_proceso;
    end if;
  else
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and (
          select case
            when p_parte_id is null then
              coalesce(sum(a.cantidad) filter (where a.parte_id is null), 0) + coalesce((
                select max(t.n / pd.piezas_por_mueble) from (
                  select b.parte_id, sum(b.cantidad) as n from public.asignaciones_produccion b
                  where b.paso_id = s.id and b.cancelada_en is null and b.informe_rechazo_id is null
                    and b.revision_final_rechazo_id is null and b.parte_id is not null
                  group by b.parte_id
                ) t join public.partes_despiece pd on pd.id = t.parte_id
              ), 0)
            else
              coalesce(sum(a.cantidad) filter (where a.parte_id is null), 0) * v_parte.piezas_por_mueble
              + coalesce(sum(a.cantidad) filter (where a.parte_id = p_parte_id), 0)
          end
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
      ) then
        raise exception 'Ya está asignado todo el ítem % en %.', v_item.item_code, p_proceso;
      end if;
      raise exception 'La ruta del ítem % no lleva %; agrégalo a la ruta primero.', v_item.item_code, p_proceso;
    end if;
  end if;

  -- Con componentes: antes del ensamble, solo por partes (asignar_por_partes_con_componentes);
  -- en el ensamble y después, también el mueble completo.
  if p_parte_id is null and public.tiene_componentes(v_item.id)
     and v_paso.proceso <> 'ensamble'
     and not exists (
       select 1 from public.pasos_ruta_produccion s
       where s.planeacion_item_id = v_item.id and s.retirado_en is null
         and s.proceso = 'ensamble' and s.orden < v_paso.orden
     ) then
    raise exception 'El ítem % tiene componentes: antes del Ensamble se asigna por partes de su despiece.', v_item.item_code;
  end if;

  select coalesce(sum(cantidad) filter (where parte_id is null), 0),
         coalesce(sum(cantidad) filter (where parte_id = p_parte_id), 0)
    into v_asignado, v_asignado_parte
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
      and revision_final_rechazo_id is null;

  if p_parte_id is null then
    select coalesce(max(t.n / pd.piezas_por_mueble), 0) into v_max_parte
      from (
        select parte_id, sum(cantidad) as n from public.asignaciones_produccion
        where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
          and revision_final_rechazo_id is null and parte_id is not null
        group by parte_id
      ) t
      join public.partes_despiece pd on pd.id = t.parte_id;
    v_ya := v_asignado + v_max_parte;
    if v_ya + p_cantidad > v_tope then
      raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_tope - v_ya, v_tope, v_ya;
    end if;
  else
    v_ya := v_asignado * v_parte.piezas_por_mueble + v_asignado_parte;
    if v_ya + p_cantidad > v_tope then
      raise exception 'En el paso % (%), "%" solo tiene % pieza(s) por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_parte.descripcion, v_tope - v_ya, v_tope, v_ya;
    end if;
  end if;

  select s.id, s.proceso into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
      and (p_parte_id is null or not (s.proceso = any (v_parte.procesos_omitidos)))
    order by s.orden desc
    limit 1;
  if found then
    select coalesce(sum(x.cantidad) filter (where a.parte_id is null), 0)
      into v_listo_mueble
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior.id and a.cancelada_en is null and a.informe_rechazo_id is null
        and a.revision_final_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
    select coalesce(jsonb_object_agg(t.parte_id, t.n), '{}'::jsonb)
      into v_listo_partes
      from (
        select a.parte_id, sum(x.cantidad) as n
        from public.entregas_produccion x
        join public.asignaciones_produccion a on a.id = x.asignacion_id
        where a.paso_id = v_anterior.id and a.cancelada_en is null and a.informe_rechazo_id is null
          and a.revision_final_rechazo_id is null and a.parte_id is not null
          and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null
        group by a.parte_id
      ) t;
    if p_parte_id is null then
      v_listo := public.cobertura_por_partes(v_item.id, v_listo_mueble, v_listo_partes, v_anterior.proceso);
    else
      v_listo := v_listo_mueble * v_parte.piezas_por_mueble
        + coalesce((v_listo_partes ->> p_parte_id::text)::numeric, 0);
    end if;
    v_adelantada := v_ya + p_cantidad > v_listo;
  end if;

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
    v_item.descripcion,
    case when p_parte_id is null then v_item.unidad else coalesce(v_parte.unidad, v_item.unidad) end,
    p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada, p_parte_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 4. Guardar la ruta del mueble -----------------------------------------------------------------
create or replace function public.guardar_ruta_produccion(p_item_id uuid, p_pasos jsonb, p_version_esperada integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_version integer;
  v_paso jsonb;
  v_n integer := 0;
  v_id uuid;
  v_proceso text;
  v_existente record;
  v_ids uuid[] := '{}';
  v_quitado record;
  v_folio text;
  v_procesos text[] := '{}';
  v_etiqueta text;
  v_con_asignaciones uuid[];
  v_orden_nuevo uuid[];
  v_mal record;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar la ruta.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión de la ruta que tenías abierta.';
  end if;

  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.estado_liberacion,
         pi.eliminacion_solicitada_en, pi.estado_revision, pv.es_version_activa,
         p.numero_pedido, p.eliminado_en, p.cancelado_en
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
    raise exception 'La ruta es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; cambia la ruta desde la versión activa.';
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

  select version into v_version
    from public.rutas_produccion where planeacion_item_id = p_item_id
    for update;
  if coalesce(v_version, 0) <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble mientras la editabas. Recarga la página y vuelve a hacer tus cambios.';
  end if;

  if p_pasos is null or jsonb_typeof(p_pasos) <> 'array' or jsonb_array_length(p_pasos) = 0 then
    raise exception 'La ruta necesita al menos un paso.';
  end if;
  if jsonb_array_length(p_pasos) > 12 then
    raise exception 'La ruta no puede pasar de 12 pasos.';
  end if;

  if v_version is null then
    insert into public.rutas_produccion (planeacion_item_id, version)
    values (p_item_id, 0);
  end if;

  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_paso) <> 'object' then
      raise exception 'Paso %: formato no válido.', v_n;
    end if;
    v_proceso := v_paso->>'proceso';
    if v_proceso is null
       or v_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida', 'ensamble') then
      raise exception 'Paso %: proceso no válido.', v_n;
    end if;
    if nullif(v_paso->>'id', '') is not null then
      if (v_paso->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Paso %: no es válido.', v_n;
      end if;
      v_id := (v_paso->>'id')::uuid;
      if v_id = any(v_ids) then
        raise exception 'Paso %: se repite en la ruta.', v_n;
      end if;
      select s.proceso into v_existente
        from public.pasos_ruta_produccion s
        where s.id = v_id and s.planeacion_item_id = p_item_id and s.retirado_en is null;
      if not found then
        raise exception 'Paso %: ya no está en la ruta. Recarga la página.', v_n;
      end if;
      if v_existente.proceso <> v_proceso then
        raise exception 'Paso %: un paso guardado no cambia de proceso; quítalo y agrega otro.', v_n;
      end if;
      v_ids := v_ids || v_id;
    else
      if v_proceso = 'electrificacion' and not public.admite_electrificacion(p_item_id) then
        raise exception 'El ítem % no lleva electrificación ni iluminación; no se agrega Electrificación.', v_item.item_code;
      end if;
      if v_proceso = 'superficie_solida' and not public.admite_superficie_solida(p_item_id) then
        raise exception 'El ítem % no lleva superficie sólida; no se agrega Superficie Sólida.', v_item.item_code;
      end if;
      if v_proceso = 'ensamble' and not public.admite_ensamble(p_item_id) then
        raise exception 'El ítem % no tiene dos o más partes de su despiece que pasen por Armado; no se agrega Ensamble.', v_item.item_code;
      end if;
    end if;
  end loop;

  for v_quitado in
    select s.id, s.orden, s.proceso
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
      and not (s.id = any(v_ids))
    order by s.orden
  loop
    if exists (
      select 1 from public.asignaciones_produccion a
      where a.paso_id = v_quitado.id and a.cancelada_en is null
    ) then
      raise exception 'El paso % (%) tiene asignaciones; cancélalas antes de quitarlo de la ruta.',
        v_quitado.orden, v_quitado.proceso;
    end if;
    select r.folio into v_folio
      from public.revisiones_finales_calidad r
      where r.paso_retrabajo_id = v_quitado.id and not r.aprobado
      limit 1;
    if found then
      raise exception 'La revisión final (%) regresó piezas al paso % (%) que faltan por reasignar; reasígnalas antes de quitarlo de la ruta.',
        v_folio, v_quitado.orden, v_quitado.proceso;
    end if;
    update public.pasos_ruta_produccion
      set retirado_en = now(), retirado_por = auth.uid()
      where id = v_quitado.id;
  end loop;

  -- Los pasos con asignaciones vigentes no cambian de orden entre sí (lo listo y lo
  -- adelantado de cada uno dependen de su paso anterior); los demás se mueven libres.
  select coalesce(array_agg(s.id order by s.orden), '{}') into v_con_asignaciones
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.paso_id = s.id and a.cancelada_en is null
      );
  select coalesce(array_agg(x.id order by x.n), '{}') into v_orden_nuevo
    from (
      select nullif(e.value->>'id', '')::uuid as id, e.n
      from jsonb_array_elements(p_pasos) with ordinality as e(value, n)
    ) x
    where x.id = any (v_con_asignaciones);
  if v_orden_nuevo <> v_con_asignaciones then
    raise exception 'Los pasos con asignaciones no cambian de orden entre sí; mueve solo los pasos sin asignar.';
  end if;

  update public.pasos_ruta_produccion
    set orden = orden + 1000
    where planeacion_item_id = p_item_id and retirado_en is null;

  v_n := 0;
  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    v_proceso := v_paso->>'proceso';
    v_procesos := v_procesos || v_proceso;
    if nullif(v_paso->>'id', '') is not null then
      update public.pasos_ruta_produccion set orden = v_n where id = (v_paso->>'id')::uuid;
    else
      insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
      values (p_item_id, v_n, v_proceso);
    end if;
  end loop;

  -- Con componentes, lo asignado como mueble completo va en el Ensamble o después
  -- (crear_asignacion_produccion). Los retrabajos no cuentan: siguen a su paso.
  if public.tiene_componentes(p_item_id) then
    select s.orden, s.proceso into v_mal
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = p_item_id and s.retirado_en is null and s.proceso <> 'ensamble'
        and not exists (
          select 1 from public.pasos_ruta_produccion e
          where e.planeacion_item_id = p_item_id and e.retirado_en is null
            and e.proceso = 'ensamble' and e.orden < s.orden
        )
        and exists (
          select 1 from public.asignaciones_produccion a
          where a.paso_id = s.id and a.cancelada_en is null and a.parte_id is null
            and a.informe_rechazo_id is null and a.revision_final_rechazo_id is null
        )
      order by s.orden
      limit 1;
    if found then
      raise exception 'El paso % (%) tiene asignaciones del mueble completo: debe quedar después del Ensamble.',
        v_mal.orden, v_mal.proceso;
    end if;
  end if;

  update public.rutas_produccion
    set version = version + 1, actualizado_por = auth.uid(), actualizado_en = now()
    where planeacion_item_id = p_item_id
    returning version into v_version;

  select string_agg(
           case x.proceso
             when 'armado' then 'Armado'
             when 'barniz' then 'Barniz'
             when 'electrificacion' then 'Electrificación'
             when 'ensamble' then 'Ensamble'
             else 'Superficie Sólida'
           end, ' → ' order by x.n)
    into v_etiqueta
    from unnest(v_procesos) with ordinality as x(proceso, n);

  insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
  values (auth.uid(), 'rutas_produccion', p_item_id, 'ruta_guardada',
          jsonb_build_object(
            'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
            'modelo', v_item.modelo, 'ruta', v_etiqueta, 'version', v_version
          ));

  return v_version;
end;
$$;

-- 5. Retrabajos: el ensamble lo reasignan los equipos de Armado -----------------------------------
do $$
declare
  v_def text;
  v_nueva text;
  v_cambio record;
begin
  for v_cambio in
    select * from (values
      ('crear_retrabajo_produccion', 'v_r.proceso = any(v_equipo.procesos)',
       'public.equipo_hace(v_equipo.procesos, v_r.proceso)'),
      ('crear_retrabajo_revision_final', 'v_sig.proceso = any(v_equipo.procesos)',
       'public.equipo_hace(v_equipo.procesos, v_sig.proceso)')
    ) as c(nombre, antes, despues)
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_cambio.nombre;
    v_nueva := replace(v_def, v_cambio.antes, v_cambio.despues);
    if v_nueva = v_def then
      raise exception '% no trae la validación de equipo esperada.', v_cambio.nombre;
    end if;
    execute v_nueva;
  end loop;
end;
$$;

-- 6. Revisión final: cada parte con lo del mueble completo en su último paso ----------------------
create or replace function public.piezas_listas_revision_final(p_item_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with pasos as (
    select s.id, s.orden, s.proceso
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
  ),
  ultimo as (
    select id from pasos order by orden desc limit 1
  ),
  l as (
    select a.parte_id, a.paso_id, l.cantidad - l.rechazadas as n
    from public.lotes_calidad l
    join public.asignaciones_produccion a on a.id = l.asignacion_id
    where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente
  ),
  -- Cada parte y el último paso de la ruta que lleva.
  partes as (
    select pd.id, pd.piezas_por_mueble,
      (select p.id from pasos p
       where not (p.proceso = any (pd.procesos_omitidos))
       order by p.orden desc limit 1) as paso_final
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
      and exists (select 1 from pasos p where not (p.proceso = any (pd.procesos_omitidos)))
  )
  select case
    when exists (select 1 from partes) then (
      select trunc(min(
        (select coalesce(sum(l.n), 0) from l where l.parte_id is null and l.paso_id = pt.paso_final)
        + (select coalesce(sum(l.n), 0) from l where l.parte_id = pt.id and l.paso_id = pt.paso_final)
          / pt.piezas_por_mueble
      ), 2)
      from partes pt
    )
    else (select coalesce(sum(n), 0) from l where parte_id is null and paso_id = (select id from ultimo))
  end;
$$;

notify pgrst, 'reload schema';
