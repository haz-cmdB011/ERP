-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.despieces_produccion
-- @verifica constraint public.despieces_produccion.despieces_produccion_lineas_check
-- @verifica policy public.despieces_produccion.select_despieces_produccion
-- @verifica function public.guardar_despiece_produccion
-- @verifica function-contiene public.guardar_despiece_produccion no pertenece a este mueble

-- ============================================================================
-- Producción — despiece de un mueble (ítem padre).
--
-- El trabajador despieza el mueble como le sirva en el taller. Antes de que lo
-- haga, la pantalla le propone un despiece armado con los componentes (ítems
-- hijo) del PM (src/lib/produccion/despiece.ts); esa sugerencia NO se guarda
-- sola. Lo que se guarda aquí es lo que el trabajador decidió.
--
-- Un despiece por mueble: lineas es un arreglo jsonb que se reemplaza completo
-- en cada guardado (todo o nada). Cada línea:
--   { descripcion, material, unidad, piezas_por_mueble, hijo_id }
-- piezas_por_mueble son las piezas de UN mueble; para varios muebles se
-- multiplica por planeacion_items.cantidad_total del padre. hijo_id es el
-- componente del PM de donde salió la línea (null si la agregó el trabajador).
--
-- No toca el PM, las asignaciones ni los recibos: es solo el desglose.
-- Se escribe únicamente con guardar_despiece_produccion (security definer con
-- chequeo de is_produccion()); la tabla no tiene políticas de escritura.
-- ============================================================================

create table public.despieces_produccion (
  id uuid primary key default gen_random_uuid(),
  -- Un despiece por mueble; se va con el ítem si este se borra definitivamente.
  planeacion_item_id uuid not null unique references public.planeacion_items(id) on delete cascade,
  lineas jsonb not null,
  -- true si lo guardado es la sugerencia del sistema sin cambios.
  igual_a_sugerencia boolean not null default false,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  constraint despieces_produccion_lineas_check check (
    jsonb_typeof(lineas) = 'array' and jsonb_array_length(lineas) between 1 and 200
  )
);
create index idx_despieces_produccion_creado_por on public.despieces_produccion (creado_por);
create index idx_despieces_produccion_actualizado_por on public.despieces_produccion (actualizado_por);

alter table public.despieces_produccion enable row level security;
-- Lo ve el personal interno (no los maquiladores ni los usuarios sin rol).
create policy "select_despieces_produccion" on public.despieces_produccion
  for select to authenticated using ((select public.is_staff()));

-- Guarda (o reemplaza) el despiece de un mueble.
create or replace function public.guardar_despiece_produccion(
  p_item_id uuid,
  p_lineas jsonb,
  p_igual_a_sugerencia boolean default false
)
returns void
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
  v_hijo uuid;
  v_limpias jsonb := '[]'::jsonb;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede guardar el despiece.';
  end if;

  -- Bloquea el ítem: dos guardados simultáneos se atienden uno tras otro.
  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.eliminacion_solicitada_en,
         pi.estado_revision, pv.es_version_activa,
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
    v_unidad := nullif(regexp_replace(btrim(coalesce(v_linea->>'unidad', '')), '\s+', ' ', 'g'), '');

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
    end if;

    v_limpias := v_limpias || jsonb_build_array(jsonb_build_object(
      'descripcion', v_descripcion,
      'material', v_material,
      'unidad', v_unidad,
      'piezas_por_mueble', v_piezas,
      'hijo_id', v_hijo
    ));
  end loop;

  insert into public.despieces_produccion (
    planeacion_item_id, lineas, igual_a_sugerencia, creado_por, actualizado_por
  ) values (
    p_item_id, v_limpias, coalesce(p_igual_a_sugerencia, false), auth.uid(), auth.uid()
  )
  on conflict (planeacion_item_id) do update
    set lineas = excluded.lineas,
        igual_a_sugerencia = excluded.igual_a_sugerencia,
        actualizado_por = auth.uid(),
        actualizado_en = now()
  returning id into v_id;

  insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
    values (auth.uid(), 'despieces_produccion', v_id, 'despiece_guardado',
            jsonb_build_object(
              'numero_pedido', v_item.numero_pedido,
              'item_code', v_item.item_code,
              'modelo', v_item.modelo,
              'lineas', jsonb_array_length(v_limpias),
              'igual_a_sugerencia', coalesce(p_igual_a_sugerencia, false)
            ));
end;
$$;

revoke execute on function public.guardar_despiece_produccion(uuid, jsonb, boolean) from public, anon;
grant execute on function public.guardar_despiece_produccion(uuid, jsonb, boolean) to authenticated;
