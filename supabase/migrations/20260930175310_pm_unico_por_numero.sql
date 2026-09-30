-- ============================================================================
-- Planeación — un PM se identifica solo por su número.
--
-- Antes la carga buscaba el pedido por (proyecto, número de PM), y el
-- proyecto por nombre + cliente escritos exactamente igual. Si una
-- actualización del Excel corregía un error de dedo en el cliente o en el
-- nombre del proyecto, se creaba OTRO pedido con el mismo número en vez de
-- la versión nueva (y no había con qué compararla).
--
-- Ahora:
--   - El número de PM (ya normalizado por la app: "2PM009-26",
--     "SDC-1 2PM009-26") es único entre los pedidos no eliminados
--     definitivamente. Un eliminado definitivo (se conserva por sus folios de
--     Calidad, solo en Cancelados) no impide volver a cargar ese número.
--   - Si el PM ya existe, la carga crea su versión nueva aunque el proyecto o
--     el cliente vengan escritos distinto: el pedido pasa al proyecto de la
--     versión más reciente y el resultado lo informa (proyecto_anterior).
--   - Si el PM está en la papelera, la carga se rechaza con un mensaje claro
--     (antes se le agregaba una versión que nadie veía).
--   - Dos cargas simultáneas del mismo PM se atienden una tras otra.
--   - El rol anónimo ya no puede ejecutar la función (el RLS ya lo frenaba).
-- ============================================================================

alter table public.pedidos drop constraint pedidos_proyecto_id_numero_pedido_key;

create unique index pedidos_numero_pedido_key
  on public.pedidos (numero_pedido)
  where eliminado_definitivo_en is null;

create or replace function public.ingest_planeacion_version(
  p_proyecto_nombre text,
  p_cliente text,
  p_numero_pedido text,
  p_fecha_pedido date,
  p_fecha_entrega date,
  p_carga_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_proyecto_id uuid;
  v_pedido_id uuid;
  v_pedido_proyecto_id uuid;
  v_pedido_eliminado_en timestamptz;
  v_proyecto_anterior jsonb;
  v_next_version int;
  v_version_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_imagen_path text;
  v_imagen_orden int;
  v_mo_count int;
  v_fu_count int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El archivo no contiene items válidos para ingerir';
  end if;

  select id into v_proyecto_id
    from public.proyectos
    where nombre = p_proyecto_nombre and cliente = p_cliente;

  if v_proyecto_id is null then
    insert into public.proyectos (nombre, cliente)
      values (p_proyecto_nombre, p_cliente)
      returning id into v_proyecto_id;
  end if;

  -- El PM se identifica solo por su número. FOR UPDATE: otra carga del mismo
  -- PM espera a que esta termine (si no, las dos calcularían el mismo número
  -- de versión).
  select id, proyecto_id, eliminado_en
    into v_pedido_id, v_pedido_proyecto_id, v_pedido_eliminado_en
    from public.pedidos
    where numero_pedido = p_numero_pedido
      and eliminado_definitivo_en is null
    for update;

  if v_pedido_id is not null and v_pedido_eliminado_en is not null then
    raise exception 'El PM % está en la papelera de pedidos. Pide a un administrador de Planeación que lo restaure antes de subir una versión nueva.',
      p_numero_pedido;
  end if;

  if v_pedido_id is null then
    begin
      insert into public.pedidos (proyecto_id, numero_pedido, fecha_pedido, fecha_entrega)
        values (v_proyecto_id, p_numero_pedido, p_fecha_pedido, p_fecha_entrega)
        returning id into v_pedido_id;
    exception when unique_violation then
      raise exception 'Otra carga del PM % se está procesando al mismo tiempo. Intenta de nuevo en un momento.',
        p_numero_pedido;
    end;
  else
    -- Proyecto o cliente escritos distinto que en la versión anterior (ej. un
    -- error de dedo corregido): manda la versión más reciente, y se informa.
    if v_pedido_proyecto_id is distinct from v_proyecto_id then
      select jsonb_build_object('nombre', nombre, 'cliente', cliente)
        into v_proyecto_anterior
        from public.proyectos
        where id = v_pedido_proyecto_id;
    end if;

    update public.pedidos
      set proyecto_id = v_proyecto_id,
          fecha_pedido = coalesce(p_fecha_pedido, fecha_pedido),
          fecha_entrega = coalesce(p_fecha_entrega, fecha_entrega)
      where id = v_pedido_id;
  end if;

  update public.pedido_versiones
    set es_version_activa = false
    where pedido_id = v_pedido_id and es_version_activa = true;

  select coalesce(max(numero_version), 0) + 1 into v_next_version
    from public.pedido_versiones
    where pedido_id = v_pedido_id;

  insert into public.pedido_versiones (pedido_id, numero_version, carga_id, es_version_activa)
    values (v_pedido_id, v_next_version, p_carga_id, true)
    returning id into v_version_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.planeacion_items (
      pedido_version_id, item_code, tipo_registro, categoria_componente,
      tipo_material, etapa, nivel,
      departamento, elevacion, modelo, descripcion, cantidad_x_mueble, unidad,
      cantidad_total, acabados, observaciones, fila_excel_origen,
      ingenieria, lista_insumos, suministro_mats, fases_taller
    ) values (
      v_version_id,
      (v_item->>'item_code')::numeric,
      (v_item->>'tipo_registro')::public.tipo_registro_item,
      (v_item->>'categoria_componente')::public.categoria_componente_tipo,
      nullif(v_item->>'tipo_material', ''),
      nullif(v_item->>'etapa', ''),
      nullif(v_item->>'nivel', ''),
      nullif(v_item->>'departamento', ''),
      nullif(v_item->>'elevacion', ''),
      nullif(v_item->>'modelo', ''),
      nullif(v_item->>'descripcion', ''),
      nullif(v_item->>'cantidad_x_mueble', '')::numeric,
      nullif(v_item->>'unidad', ''),
      (v_item->>'cantidad_total')::numeric,
      nullif(v_item->>'acabados', ''),
      nullif(v_item->>'observaciones', ''),
      nullif(v_item->>'fila_excel_origen', '')::int,
      (v_item->>'ingenieria')::boolean,
      nullif(v_item->>'lista_insumos', ''),
      (v_item->>'suministro_mats')::boolean,
      coalesce(v_item->'fases_taller', '{}'::jsonb)
    )
    returning id into v_item_id;

    for v_imagen_path, v_imagen_orden in
      select value, ordinality - 1
      from jsonb_array_elements_text(coalesce(v_item->'imagen_paths', '[]'::jsonb)) with ordinality as t(value, ordinality)
    loop
      insert into public.planeacion_item_imagenes (planeacion_item_id, storage_path, orden)
        values (v_item_id, v_imagen_path, v_imagen_orden);
    end loop;
  end loop;

  update public.planeacion_items child
    set parent_item_id = parent.id
    from public.planeacion_items parent
    where child.pedido_version_id = v_version_id
      and child.tipo_registro = 'FU'
      and parent.pedido_version_id = v_version_id
      and parent.tipo_registro = 'MO'
      and parent.item_code = floor(child.item_code);

  select count(*) filter (where tipo_registro = 'MO'),
         count(*) filter (where tipo_registro = 'FU')
    into v_mo_count, v_fu_count
    from public.planeacion_items
    where pedido_version_id = v_version_id;

  return jsonb_build_object(
    'pedido_id', v_pedido_id,
    'pedido_version_id', v_version_id,
    'numero_version', v_next_version,
    'items_mo', v_mo_count,
    'items_fu', v_fu_count,
    'proyecto_anterior', v_proyecto_anterior
  );
end;
$$;

revoke execute on function public.ingest_planeacion_version(text, text, text, date, date, uuid, jsonb)
  from public, anon;
grant execute on function public.ingest_planeacion_version(text, text, text, date, date, uuid, jsonb)
  to authenticated;
