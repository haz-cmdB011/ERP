-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.pedidos.archivo_origen
-- @verifica index public.pedidos_archivo_origen_key
-- @verifica index public.pedidos_numero_pedido_key
-- @verifica function-contiene public.ingest_planeacion_version p_archivo_origen

-- ============================================================================
-- Planeación — un PM se identifica por el archivo del que viene.
--
-- Antes la carga buscaba el pedido por su título ya normalizado ("PM013-26
-- SALON 3"): si el título se calculaba igual para dos archivos distintos (los
-- salones 3 y 4 del 013-26 salían los dos "2PM013-26"), el segundo se guardaba
-- como versión del primero y lo pisaba.
--
-- Ahora:
--   - pedidos.archivo_origen guarda la clave del archivo que creó el PM: el
--     nombre del archivo sin extensión, en mayúsculas y con los espacios
--     juntados (la calcula la app, ver claveArchivoOrigen en
--     src/lib/planeacion/numero-pm.ts). Las hojas extra del mismo archivo
--     llevan además el nombre de la hoja ("<ARCHIVO> :: X FECHAS").
--   - Un archivo cuyo nombre no está en la base crea un PM nuevo con su
--     versión 1. Solo un archivo con el MISMO nombre crea otra versión.
--   - El título sigue siendo único: si otro PM (de otro archivo) ya lo usa,
--     el nuevo queda "<TÍTULO> (2)", "(3)"... La función devuelve el título
--     final en numero_pedido.
--   - Un PM existente conserva su título aunque el archivo nuevo calcule otro.
--
-- La función anterior (7 argumentos, busca por título) se deja tal cual para
-- que la versión de la web que aún no se despliega siga cargando; se quitará
-- en una migración posterior.
-- ============================================================================

alter table public.pedidos add column archivo_origen text;

comment on column public.pedidos.archivo_origen is
  'Clave del archivo de Excel que creó el PM (nombre sin extensión, mayúsculas, espacios juntados; " :: <HOJA>" para hojas extra). Otro archivo con la misma clave es una versión nueva de este PM.';

-- PM ya cargados: la clave del archivo de su versión 1. La carga queda
-- ligada al PM de su primera hoja (cargas_archivo.pedido_id), así que las
-- hojas extra se quedan sin clave: si su archivo se vuelve a subir, crean un
-- PM nuevo.
update public.pedidos p
  set archivo_origen = upper(btrim(regexp_replace(
        regexp_replace(btrim(c.nombre_archivo), '\.(xlsx|xlsm|xls)$', '', 'i'),
        '\s+', ' ', 'g')))
  from public.pedido_versiones v
  join public.cargas_archivo c on c.id = v.carga_id
  where v.pedido_id = p.id
    and v.numero_version = 1
    and c.pedido_id = p.id
    and p.eliminado_definitivo_en is null;

create unique index pedidos_archivo_origen_key
  on public.pedidos (archivo_origen)
  where eliminado_definitivo_en is null and archivo_origen is not null;

create or replace function public.ingest_planeacion_version(
  p_proyecto_nombre text,
  p_cliente text,
  p_numero_pedido text,
  p_fecha_pedido date,
  p_fecha_entrega date,
  p_carga_id uuid,
  p_items jsonb,
  p_archivo_origen text
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
  v_titulo text;
  v_titulo_repetido text;
  v_n int;
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
  if p_archivo_origen is null or btrim(p_archivo_origen) = '' then
    raise exception 'Falta el nombre del archivo de origen del PM';
  end if;

  -- Dos cargas simultáneas del mismo archivo se atienden una tras otra (si
  -- no, las dos crearían el PM o calcularían el mismo número de versión).
  perform pg_advisory_xact_lock(hashtext('ingest_planeacion_version:' || p_archivo_origen));

  select id into v_proyecto_id
    from public.proyectos
    where nombre = p_proyecto_nombre and cliente = p_cliente;

  if v_proyecto_id is null then
    insert into public.proyectos (nombre, cliente)
      values (p_proyecto_nombre, p_cliente)
      returning id into v_proyecto_id;
  end if;

  -- El PM se identifica por su archivo de origen.
  select id, proyecto_id, eliminado_en, numero_pedido
    into v_pedido_id, v_pedido_proyecto_id, v_pedido_eliminado_en, v_titulo
    from public.pedidos
    where archivo_origen = p_archivo_origen
      and eliminado_definitivo_en is null
    for update;

  if v_pedido_id is not null and v_pedido_eliminado_en is not null then
    raise exception 'El PM % (archivo «%») está en la papelera de pedidos. Pide a un administrador de Planeación que lo restaure antes de subir una versión nueva.',
      v_titulo, p_archivo_origen;
  end if;

  if v_pedido_id is null then
    -- Archivo nuevo: PM nuevo. Si otro PM ya usa el título, se numera.
    v_titulo := p_numero_pedido;
    v_n := 1;
    while exists (
      select 1 from public.pedidos
      where numero_pedido = v_titulo and eliminado_definitivo_en is null
    ) loop
      v_n := v_n + 1;
      v_titulo := p_numero_pedido || ' (' || v_n || ')';
    end loop;
    if v_n > 1 then
      v_titulo_repetido := p_numero_pedido;
    end if;

    begin
      insert into public.pedidos (proyecto_id, numero_pedido, fecha_pedido, fecha_entrega, archivo_origen)
        values (v_proyecto_id, v_titulo, p_fecha_pedido, p_fecha_entrega, p_archivo_origen)
        returning id into v_pedido_id;
    exception when unique_violation then
      raise exception 'Otra carga del PM % se está procesando al mismo tiempo. Intenta de nuevo en un momento.',
        v_titulo;
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
    'numero_pedido', v_titulo,
    -- Título que ya usaba otro PM: este quedó numerado ("... (2)").
    'titulo_repetido', v_titulo_repetido,
    'items_mo', v_mo_count,
    'items_fu', v_fu_count,
    'proyecto_anterior', v_proyecto_anterior
  );
end;
$$;

revoke execute on function public.ingest_planeacion_version(text, text, text, date, date, uuid, jsonb, text)
  from public, anon;
grant execute on function public.ingest_planeacion_version(text, text, text, date, date, uuid, jsonb, text)
  to authenticated;
