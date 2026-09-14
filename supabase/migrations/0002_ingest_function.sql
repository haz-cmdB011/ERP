-- ============================================================================
-- Función de ingestión atómica de una versión de Planeación.
-- Recibe los items ya validados en la aplicación (estructura y tipos) y
-- realiza upsert de proyecto/pedido + inserción de la nueva versión +
-- items en una sola transacción (todo o nada).
-- security invoker: corre con los permisos/RLS del usuario autenticado que
-- llama la función (no bypassa RLS).
-- ============================================================================
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
security invoker
set search_path = ''
as $$
declare
  v_proyecto_id uuid;
  v_pedido_id uuid;
  v_next_version int;
  v_version_id uuid;
  v_item jsonb;
  v_mo_count int;
  v_fu_count int;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El archivo no contiene items válidos para ingerir';
  end if;

  -- upsert proyecto (por nombre + cliente)
  select id into v_proyecto_id
    from public.proyectos
    where nombre = p_proyecto_nombre and cliente = p_cliente;

  if v_proyecto_id is null then
    insert into public.proyectos (nombre, cliente)
      values (p_proyecto_nombre, p_cliente)
      returning id into v_proyecto_id;
  end if;

  -- upsert pedido (por proyecto + numero_pedido, ya es unique constraint)
  select id into v_pedido_id
    from public.pedidos
    where proyecto_id = v_proyecto_id and numero_pedido = p_numero_pedido;

  if v_pedido_id is null then
    insert into public.pedidos (proyecto_id, numero_pedido, fecha_pedido, fecha_entrega)
      values (v_proyecto_id, p_numero_pedido, p_fecha_pedido, p_fecha_entrega)
      returning id into v_pedido_id;
  else
    update public.pedidos
      set fecha_pedido = coalesce(p_fecha_pedido, fecha_pedido),
          fecha_entrega = coalesce(p_fecha_entrega, fecha_entrega)
      where id = v_pedido_id;
  end if;

  -- la version anterior deja de ser la activa
  update public.pedido_versiones
    set es_version_activa = false
    where pedido_id = v_pedido_id and es_version_activa = true;

  select coalesce(max(numero_version), 0) + 1 into v_next_version
    from public.pedido_versiones
    where pedido_id = v_pedido_id;

  insert into public.pedido_versiones (pedido_id, numero_version, carga_id, es_version_activa)
    values (v_pedido_id, v_next_version, p_carga_id, true)
    returning id into v_version_id;

  -- pase 1: insertar todos los items de la version (MO y FU), sin parent aun
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.planeacion_items (
      pedido_version_id, item_code, tipo_registro, tipo_material, etapa, nivel,
      departamento, elevacion, modelo, descripcion, cantidad_x_mueble, unidad,
      cantidad_total, acabados, observaciones, fila_excel_origen
    ) values (
      v_version_id,
      (v_item->>'item_code')::numeric,
      (v_item->>'tipo_registro')::public.tipo_registro_item,
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
      nullif(v_item->>'fila_excel_origen', '')::int
    );
  end loop;

  -- pase 2: resolver parent_item_id de las filas FU -> su MO (item_code entero = floor(item_code hijo))
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
    'items_fu', v_fu_count
  );
end;
$$;

grant execute on function public.ingest_planeacion_version(
  text, text, text, date, date, uuid, jsonb
) to authenticated;
