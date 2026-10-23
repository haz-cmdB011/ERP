-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.partes_despiece.porcentaje
-- @verifica function public.requiere_despiece
-- @verifica function-contiene public.guardar_despiece_produccion porcentaje
-- @verifica function-contiene public.crear_asignacion_produccion requiere_despiece

-- ============================================================================
-- Producción — el despiece se usa para asignar.
--
--   * Cada parte del despiece vale un % del mueble (partes_despiece.porcentaje):
--     con él, el panel muestra el avance del mueble ponderado por parte. Se
--     captura al guardar el despiece; si una línea lo trae, todas deben traerlo y
--     sumar 100. Sin % (despieces viejos), las partes valen lo mismo.
--     El cobro y la revisión final no cambian: un mueble sigue contando cuando
--     todas sus partes (cobertura_por_partes).
--   * Un mueble con componentes en el PM no se asigna sin despiece guardado
--     (requiere_despiece). Los muebles sin componentes se asignan completos.
-- ============================================================================

alter table public.partes_despiece
  add column porcentaje numeric,
  add constraint partes_despiece_porcentaje_check check (porcentaje is null or (porcentaje >= 0 and porcentaje <= 100));

-- Un mueble necesita despiece si tiene componentes vigentes en el PM y aún no tiene
-- partes vigentes.
create or replace function public.requiere_despiece(p_item_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
      select 1 from public.planeacion_items h
      where h.parent_item_id = p_item_id
        and h.eliminacion_solicitada_en is null
        and coalesce(h.estado_revision, '') <> 'cancelado'
    )
    and not exists (
      select 1 from public.partes_despiece pd
      where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
    );
$$;

revoke execute on function public.requiere_despiece(uuid) from public, anon;
grant execute on function public.requiere_despiece(uuid) to authenticated;

-- Asignar exige el despiece: se agrega la comprobación a la definición vigente.
do $$
declare
  v_def text;
  v_nueva text;
  v_ancla constant text := '  -- La parte, si se asigna una: vigente y de este mueble.';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'crear_asignacion_produccion';
  v_nueva := replace(v_def, v_ancla,
    '  -- Con componentes en el PM, primero el despiece (despiece_porcentaje_obligatorio).' || E'\n' ||
    '  if public.requiere_despiece(v_item.id) then' || E'\n' ||
    '    raise exception ''El ítem % tiene componentes: guarda su despiece antes de asignarlo.'', v_item.item_code;' || E'\n' ||
    '  end if;' || E'\n\n' || v_ancla);
  if v_nueva = v_def then
    raise exception 'crear_asignacion_produccion no trae el punto esperado.';
  end if;
  execute v_nueva;
end;
$$;

-- Guardar el despiece con el % de cada parte (misma función, más el porcentaje).
create or replace function public.guardar_despiece_produccion(
  p_item_id uuid,
  p_lineas jsonb,
  p_version_esperada integer,
  p_igual_a_sugerencia boolean default false,
  p_clave_envio text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_linea jsonb;
  v_n integer := 0;
  v_descripcion text;
  v_material text;
  v_unidad text;
  v_piezas numeric;
  v_porcentaje numeric;
  v_con_porcentaje integer := 0;
  v_suma_porcentaje numeric := 0;
  v_hijo uuid;
  v_hijos_usados uuid[] := '{}';
  v_parte_id uuid;
  v_parte record;
  v_ids uuid[] := '{}';
  v_limpias jsonb := '[]'::jsonb;
  v_actual record;
  v_version integer;
  v_id uuid;
  v_clave text := nullif(btrim(coalesce(p_clave_envio, '')), '');
  v_base jsonb;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede guardar el despiece.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión del despiece que tenías abierta.';
  end if;
  if v_clave is not null and length(v_clave) > 100 then
    raise exception 'La clave de envío no es válida.';
  end if;

  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.eliminacion_solicitada_en,
         pi.estado_revision, pi.cantidad_total, pv.es_version_activa,
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

  if v_clave is not null then
    select d.version into v_version
      from public.despieces_produccion d
      join public.despieces_produccion_historial h on h.despiece_id = d.id
      where d.planeacion_item_id = p_item_id and h.clave_envio = v_clave;
    if found then
      return v_version;
    end if;
  end if;

  if v_item.tipo_registro <> 'MO' then
    raise exception 'El despiece es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; despiézalo desde la versión activa.';
  end if;
  if v_item.eliminacion_solicitada_en is not null
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El ítem % o su PM está cancelado o eliminado.', v_item.item_code;
  end if;

  select d.id, d.version into v_actual
    from public.despieces_produccion d
    where d.planeacion_item_id = p_item_id
    for update;
  if coalesce(v_actual.version, 0) <> p_version_esperada then
    raise exception 'Alguien más guardó este despiece mientras lo editabas (versión %, tú tenías la %). Carga la versión actual y vuelve a aplicar tus cambios.',
      coalesce(v_actual.version, 0), p_version_esperada;
  end if;

  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'El despiece necesita al menos una línea.';
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    raise exception 'El despiece no puede pasar de 200 líneas.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_lineas) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_linea) <> 'object' then
      raise exception 'Línea %: formato no válido.', v_n;
    end if;

    v_descripcion := nullif(regexp_replace(btrim(coalesce(v_linea->>'descripcion', '')), '\s+', ' ', 'g'), '');
    v_material := nullif(regexp_replace(btrim(coalesce(v_linea->>'material', '')), '\s+', ' ', 'g'), '');
    v_unidad := upper(nullif(regexp_replace(btrim(coalesce(v_linea->>'unidad', '')), '\s+', ' ', 'g'), ''));

    if v_descripcion is null then
      raise exception 'Línea %: escribe la descripción.', v_n;
    end if;
    if length(v_descripcion) > 300 then
      raise exception 'Línea %: la descripción es muy larga.', v_n;
    end if;
    if length(coalesce(v_material, '')) > 60 then
      raise exception 'Línea %: el material es muy largo.', v_n;
    end if;
    if length(coalesce(v_unidad, '')) > 30 then
      raise exception 'Línea %: la unidad es muy larga.', v_n;
    end if;

    if coalesce(v_linea->>'piezas_por_mueble', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Línea %: la cantidad por mueble debe ser un número mayor que cero.', v_n;
    end if;
    v_piezas := round((v_linea->>'piezas_por_mueble')::numeric, 2);
    if v_piezas <= 0 then
      raise exception 'Línea %: la cantidad por mueble debe ser mayor que cero.', v_n;
    end if;
    if v_piezas > 100000 then
      raise exception 'Línea %: la cantidad por mueble es demasiado grande.', v_n;
    end if;

    -- El % del mueble que vale la parte (opcional; si una línea lo trae, todas).
    v_porcentaje := null;
    if nullif(v_linea->>'porcentaje', '') is not null then
      if (v_linea->>'porcentaje') !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'Línea %: el porcentaje debe ser un número entre 0 y 100.', v_n;
      end if;
      v_porcentaje := round((v_linea->>'porcentaje')::numeric, 2);
      if v_porcentaje > 100 then
        raise exception 'Línea %: el porcentaje no puede pasar de 100.', v_n;
      end if;
      v_con_porcentaje := v_con_porcentaje + 1;
      v_suma_porcentaje := v_suma_porcentaje + v_porcentaje;
    end if;

    v_hijo := null;
    if nullif(v_linea->>'hijo_id', '') is not null then
      if (v_linea->>'hijo_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Línea %: el componente de origen no es válido.', v_n;
      end if;
      v_hijo := (v_linea->>'hijo_id')::uuid;
      if not exists (
        select 1 from public.planeacion_items h
        where h.id = v_hijo and h.parent_item_id = p_item_id
      ) then
        raise exception 'Línea %: el componente de origen no pertenece a este mueble.', v_n;
      end if;
      if exists (
        select 1 from public.planeacion_items h
        where h.id = v_hijo
          and (h.eliminacion_solicitada_en is not null or h.estado_revision = 'cancelado')
      ) then
        raise exception 'Línea %: su componente de origen está cancelado o eliminado en el PM; quita la línea o desvincúlala.', v_n;
      end if;
      if v_hijo = any (v_hijos_usados) then
        raise exception 'Línea %: ese componente del PM se repite en otra línea.', v_n;
      end if;
      v_hijos_usados := v_hijos_usados || v_hijo;
    end if;

    -- La parte de la línea: la que trae (si es una parte vigente de este mueble); si
    -- no trae, la vigente que salió del mismo componente del PM (al volver a la
    -- sugerencia se conserva); si no, una parte nueva.
    v_parte_id := null;
    if nullif(v_linea->>'id', '') is not null
       and (v_linea->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select pd.id into v_parte_id
        from public.partes_despiece pd
        where pd.id = (v_linea->>'id')::uuid and pd.planeacion_item_id = p_item_id and pd.retirada_en is null;
    end if;
    if v_parte_id is null and v_hijo is not null then
      select pd.id into v_parte_id
        from public.partes_despiece pd
        where pd.planeacion_item_id = p_item_id and pd.retirada_en is null and pd.hijo_id = v_hijo
          and not (pd.id = any (v_ids))
          -- No la que otra línea trae por su id (se desvinculó de este componente).
          and not exists (
            select 1 from jsonb_array_elements(p_lineas) as o(linea)
            where o.linea->>'id' = pd.id::text
          )
        order by pd.orden
        limit 1;
    end if;
    if v_parte_id is not null and v_parte_id = any (v_ids) then
      raise exception 'Línea %: esa parte se repite en otra línea.', v_n;
    end if;
    -- Bloqueo: una parte ya asignada no baja su cantidad por mueble.
    if v_parte_id is not null then
      select pd.descripcion, pd.piezas_por_mueble into v_parte
        from public.partes_despiece pd where pd.id = v_parte_id;
      if v_piezas < v_parte.piezas_por_mueble and exists (
        select 1 from public.asignaciones_produccion a
        where a.parte_id = v_parte_id and a.cancelada_en is null
      ) then
        raise exception 'Línea %: "%" ya está asignada a un equipo; su cantidad por mueble no puede bajar de %.',
          v_n, v_parte.descripcion, v_parte.piezas_por_mueble;
      end if;
    end if;
    v_parte_id := coalesce(v_parte_id, gen_random_uuid());
    v_ids := v_ids || v_parte_id;

    v_limpias := v_limpias || jsonb_build_array(jsonb_build_object(
      'id', v_parte_id,
      'descripcion', v_descripcion,
      'material', v_material,
      'unidad', v_unidad,
      'piezas_por_mueble', v_piezas,
      'porcentaje', v_porcentaje,
      'hijo_id', v_hijo
    ));
  end loop;

  if v_con_porcentaje > 0 and v_con_porcentaje <> v_n then
    raise exception 'Pon el porcentaje en todas las líneas del despiece (o en ninguna).';
  end if;
  if v_con_porcentaje > 0 and abs(v_suma_porcentaje - 100) > 0.05 then
    raise exception 'Los porcentajes del despiece suman %; deben sumar 100.', v_suma_porcentaje;
  end if;

  -- Bloqueo: una parte ya asignada no sale del despiece.
  select pd.descripcion into v_parte
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null and not (pd.id = any (v_ids))
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.parte_id = pd.id and a.cancelada_en is null
      )
    order by pd.orden
    limit 1;
  if found then
    raise exception '"%" ya está asignada a un equipo: no se puede quitar del despiece (cancela antes sus asignaciones).',
      v_parte.descripcion;
  end if;

  select jsonb_build_object(
           'muebles', coalesce(v_item.cantidad_total, 0),
           'hijos', coalesce(jsonb_agg(jsonb_build_object(
             'id', h.id,
             'item_code', h.item_code,
             'descripcion', left(coalesce(split_part(h.descripcion, E'\n', 1), ''), 120),
             'cantidad_x_mueble', h.cantidad_x_mueble,
             'cantidad_total', h.cantidad_total
           ) order by h.item_code, h.fila_excel_origen), '[]'::jsonb)
         )
    into v_base
    from public.planeacion_items h
    where h.parent_item_id = p_item_id
      and h.eliminacion_solicitada_en is null
      and coalesce(h.estado_revision, '') <> 'cancelado';

  if v_actual.id is null then
    v_version := 1;
    insert into public.despieces_produccion (
      planeacion_item_id, lineas, igual_a_sugerencia, base_pm, version, creado_por, actualizado_por
    ) values (
      p_item_id, v_limpias, coalesce(p_igual_a_sugerencia, false), v_base, v_version, auth.uid(), auth.uid()
    )
    returning id into v_id;
  else
    v_id := v_actual.id;
    v_version := v_actual.version + 1;
    update public.despieces_produccion
      set lineas = v_limpias,
          igual_a_sugerencia = coalesce(p_igual_a_sugerencia, false),
          base_pm = v_base,
          version = v_version,
          actualizado_por = auth.uid(),
          actualizado_en = now()
      where id = v_id;
  end if;

  -- Las partes: las de las líneas se crean o se actualizan; las que salieron (sin
  -- asignaciones vigentes, ya revisado arriba) quedan retiradas.
  insert into public.partes_despiece (
    id, despiece_id, planeacion_item_id, orden, descripcion, material, unidad, piezas_por_mueble, porcentaje, hijo_id
  )
  select (x->>'id')::uuid, v_id, p_item_id, t.n::integer, x->>'descripcion', x->>'material', x->>'unidad',
    (x->>'piezas_por_mueble')::numeric, nullif(x->>'porcentaje', '')::numeric, nullif(x->>'hijo_id', '')::uuid
  from jsonb_array_elements(v_limpias) with ordinality as t(x, n)
  on conflict (id) do update
    set orden = excluded.orden,
        descripcion = excluded.descripcion,
        material = excluded.material,
        unidad = excluded.unidad,
        piezas_por_mueble = excluded.piezas_por_mueble,
        porcentaje = excluded.porcentaje,
        hijo_id = excluded.hijo_id;
  update public.partes_despiece
    set retirada_en = now()
    where planeacion_item_id = p_item_id and retirada_en is null and not (id = any (v_ids));

  insert into public.despieces_produccion_historial (
    despiece_id, version, lineas, igual_a_sugerencia, clave_envio, guardado_por
  ) values (
    v_id, v_version, v_limpias, coalesce(p_igual_a_sugerencia, false), v_clave, auth.uid()
  );

  insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
    values (auth.uid(), 'despieces_produccion', v_id, 'despiece_guardado',
            jsonb_build_object(
              'numero_pedido', v_item.numero_pedido,
              'item_code', v_item.item_code,
              'modelo', v_item.modelo,
              'version', v_version,
              'lineas', jsonb_array_length(v_limpias),
              'igual_a_sugerencia', coalesce(p_igual_a_sugerencia, false)
            ));

  return v_version;
end;
$$;
