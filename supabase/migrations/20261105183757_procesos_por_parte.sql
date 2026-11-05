-- @verifica function-contiene public.guardar_despiece_produccion procesos_por_parte
-- @verifica function-contiene public.registrar_entrega_partes procesos_por_parte

-- ============================================================================
-- Producción — qué procesos lleva cada parte del despiece.
--
-- Una parte ("Puerta", "Marco", la parte eléctrica...) no siempre pasa por todos los procesos del
-- mueble. partes_despiece.procesos_omitidos (ya existía, vacía y sin uso) guarda los procesos
-- que la parte NO lleva; vacío = los lleva todos, que es lo normal. Se captura en el despiece,
-- por línea (procesos_omitidos en cada línea del JSON), y viaja con él (historial, copia al modelo).
--
--   * guardar_despiece_produccion: valida y guarda procesos_omitidos de cada línea. Se toma la
--     definición vigente de la base y se cambia con reemplazos de texto exactos (no regex): si
--     alguno no encuentra su lugar, la migración falla en vez de dejar la función rota.
--   * registrar_entrega_partes: la entrega parcial de una asignación (que es de un proceso) solo
--     admite las partes que llevan ese proceso, y los muebles completos se cuentan con esas
--     partes: la parte más atrasada DE ESE PROCESO manda. Así el Barniz de una puerta no espera
--     al marco si el marco no lleva Barniz.
-- ============================================================================

do $migracion$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef('public.guardar_despiece_produccion(uuid, jsonb, integer, boolean, text)'::regprocedure)
    into v_def;
  v_nueva := v_def;

  -- 1. Variable.
  if position($q$  v_base jsonb;
begin
$q$ in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion: no se encontró la declaración de v_base.';
  end if;
  v_nueva := replace(v_nueva, $q$  v_base jsonb;
begin
$q$, $q$  v_base jsonb;
  v_omitidos jsonb;
begin
$q$);

  -- 2. Leer y validar los procesos que la línea no lleva (procesos_por_parte).
  if position($q$    v_parte_id := null;
$q$ in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion: no se encontró el inicio de la búsqueda de la parte.';
  end if;
  v_nueva := replace(v_nueva, $q$    v_parte_id := null;
$q$, $q$    v_omitidos := '[]'::jsonb;
    if jsonb_typeof(v_linea->'procesos_omitidos') = 'array' then
      select coalesce(jsonb_agg(distinct p), '[]'::jsonb) into v_omitidos
        from jsonb_array_elements_text(v_linea->'procesos_omitidos') as p;
      if exists (
        select 1 from jsonb_array_elements_text(v_omitidos) as p
        where p not in ('armado', 'superficie_solida', 'barniz', 'electrificacion')
      ) then
        raise exception 'Línea %: uno de los procesos no es válido.', v_n;
      end if;
      if jsonb_array_length(v_omitidos) >= 4 then
        raise exception 'Línea %: la parte debe pasar al menos por un proceso.', v_n;
      end if;
    end if;

    v_parte_id := null;
$q$);

  -- 3. Se guarda en la línea limpia (despiece e historial).
  if position($q$      'hijo_id', v_hijo
    ));$q$ in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion: no se encontró la línea limpia.';
  end if;
  v_nueva := replace(v_nueva, $q$      'hijo_id', v_hijo
    ));$q$, $q$      'hijo_id', v_hijo,
      'procesos_omitidos', v_omitidos
    ));$q$);

  -- 4. Y en la parte.
  if position($q$porcentaje, hijo_id
  )
  select$q$ in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion: no se encontró el insert de partes_despiece.';
  end if;
  v_nueva := replace(v_nueva, $q$porcentaje, hijo_id
  )
  select$q$, $q$porcentaje, hijo_id, procesos_omitidos
  )
  select$q$);

  if position($q$nullif(x->>'hijo_id', '')::uuid
  from jsonb_array_elements(v_limpias)$q$ in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion: no se encontró la lista del insert.';
  end if;
  v_nueva := replace(v_nueva, $q$nullif(x->>'hijo_id', '')::uuid
  from jsonb_array_elements(v_limpias)$q$, $q$nullif(x->>'hijo_id', '')::uuid,
    array(select jsonb_array_elements_text(coalesce(x->'procesos_omitidos', '[]'::jsonb)))
  from jsonb_array_elements(v_limpias)$q$);

  if position($q$        hijo_id = excluded.hijo_id;$q$ in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion: no se encontró el on conflict.';
  end if;
  v_nueva := replace(v_nueva, $q$        hijo_id = excluded.hijo_id;$q$, $q$        hijo_id = excluded.hijo_id,
        procesos_omitidos = excluded.procesos_omitidos;$q$);

  -- Marca para @verifica.
  v_nueva := replace(v_nueva, $q$begin
  if not public.is_produccion() then$q$, $q$begin
  -- procesos_por_parte: cada línea trae los procesos que la parte no lleva.
  if not public.is_produccion() then$q$);

  if v_nueva = v_def or position('procesos_por_parte' in v_nueva) = 0 then
    raise exception 'guardar_despiece_produccion no cambió.';
  end if;
  execute v_nueva;
end;
$migracion$;

-- registrar_entrega_partes: solo las partes que llevan el proceso de la asignación.
create or replace function public.registrar_entrega_partes(
  p_asignacion_id uuid,
  p_fecha_entrega date,
  p_partes jsonb,
  p_folios_calidad text,
  p_clave_envio text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asignacion record;
  v_clave text := nullif(btrim(coalesce(p_clave_envio, '')), '');
  v_folio text := nullif(btrim(coalesce(p_folios_calidad, '')), '');
  v_linea jsonb;
  v_parte record;
  v_parte_id uuid;
  v_piezas numeric;
  v_ya numeric;
  v_vistas uuid[] := '{}';
  v_completos numeric;
  v_entregado numeric;
  v_nuevos numeric;
begin
  -- procesos_por_parte: las partes y los muebles completos se miden con las que llevan el
  -- proceso de la asignación.
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if v_clave is not null and length(v_clave) > 100 then
    raise exception 'La clave de envío no es válida.';
  end if;

  -- El mismo envío repetido (la red se cortó antes de la respuesta): ya está guardado.
  if v_clave is not null and exists (
    select 1 from public.entregas_partes_produccion
    where clave_envio = v_clave and asignacion_id = p_asignacion_id
  ) then
    return 0;
  end if;

  if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0 then
    raise exception 'Escribe cuántas piezas se entregaron de al menos una parte.';
  end if;
  if jsonb_array_length(p_partes) > 50 then
    raise exception 'Son demasiadas partes en una sola entrega.';
  end if;
  if p_fecha_entrega is null then
    raise exception 'Falta la fecha de entrega.';
  end if;
  if v_folio is null then
    raise exception 'Escribe el folio de la hoja de entrega.';
  end if;

  select id, planeacion_item_id, cantidad, fecha_asignacion, cancelada_en, parte_id, proceso into v_asignacion
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_asignacion.cancelada_en is not null then
    raise exception 'La asignación está cancelada.';
  end if;
  if v_asignacion.parte_id is not null then
    raise exception 'Esta asignación es de una parte: su entrega se registra completa.';
  end if;
  if p_fecha_entrega < v_asignacion.fecha_asignacion then
    raise exception 'La fecha de entrega no puede ser anterior a la de asignación (%).',
      to_char(v_asignacion.fecha_asignacion, 'DD/MM/YYYY');
  end if;
  if p_fecha_entrega > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de entrega no puede ser futura.';
  end if;

  for v_linea in select * from jsonb_array_elements(p_partes) loop
    begin
      v_parte_id := (v_linea ->> 'parteId')::uuid;
      v_piezas := (v_linea ->> 'piezas')::numeric;
    exception when others then
      raise exception 'Una de las partes no es válida.';
    end;
    if v_piezas is null or v_piezas <= 0 then
      raise exception 'Las piezas de cada parte deben ser mayores que cero.';
    end if;
    if v_parte_id = any (v_vistas) then
      raise exception 'Una parte está repetida en la entrega.';
    end if;
    v_vistas := v_vistas || v_parte_id;

    select pd.id, pd.descripcion, pd.piezas_por_mueble into v_parte
      from public.partes_despiece pd
      where pd.id = v_parte_id
        and pd.planeacion_item_id = v_asignacion.planeacion_item_id
        and pd.retirada_en is null
        and not (v_asignacion.proceso = any (pd.procesos_omitidos));
    if not found then
      raise exception 'Una de las partes ya no es del despiece de este mueble o no lleva este proceso.';
    end if;

    select coalesce(sum(piezas), 0) into v_ya
      from public.entregas_partes_produccion
      where asignacion_id = p_asignacion_id and parte_id = v_parte_id;
    if v_ya + v_piezas > v_parte.piezas_por_mueble * v_asignacion.cantidad then
      raise exception 'De "%" solo faltan % por entregar de %.',
        v_parte.descripcion,
        v_parte.piezas_por_mueble * v_asignacion.cantidad - v_ya,
        v_parte.piezas_por_mueble * v_asignacion.cantidad;
    end if;

    insert into public.entregas_partes_produccion (
      asignacion_id, parte_id, piezas, fecha_entrega, folios_calidad, clave_envio
    ) values (
      p_asignacion_id, v_parte_id, v_piezas, p_fecha_entrega, v_folio, v_clave
    );
  end loop;

  -- Muebles completos que alcanzan las partes que llevan este proceso (la más atrasada manda).
  select min(floor(coalesce(e.total, 0) / pd.piezas_por_mueble)) into v_completos
    from public.partes_despiece pd
    left join (
      select parte_id, sum(piezas) as total
      from public.entregas_partes_produccion
      where asignacion_id = p_asignacion_id
      group by parte_id
    ) e on e.parte_id = pd.id
    where pd.planeacion_item_id = v_asignacion.planeacion_item_id and pd.retirada_en is null
      and not (v_asignacion.proceso = any (pd.procesos_omitidos));
  v_completos := least(coalesce(v_completos, 0), v_asignacion.cantidad);

  select coalesce(sum(cantidad), 0) into v_entregado
    from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null;

  v_nuevos := v_completos - v_entregado;
  if v_nuevos > 0 then
    perform public.registrar_entrega_produccion(
      p_asignacion_id, p_fecha_entrega, v_nuevos, v_folio,
      case when v_clave is not null then v_clave || ':mueble' end
    );
    return v_nuevos::integer;
  end if;
  return 0;
end;
$$;

revoke execute on function public.registrar_entrega_partes(uuid, date, jsonb, text, text) from public, anon;
grant execute on function public.registrar_entrega_partes(uuid, date, jsonb, text, text) to authenticated;
