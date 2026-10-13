-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.despieces_produccion.version
-- @verifica column public.despieces_produccion.base_pm
-- @verifica table public.despieces_produccion_historial
-- @verifica policy public.despieces_produccion_historial.select_despieces_produccion_historial
-- @verifica function-contiene public.guardar_despiece_produccion p_version_esperada
-- @verifica function-contiene public.guardar_despiece_produccion Alguien más guardó
-- @verifica function-contiene public.guardar_despiece_produccion se repite en otra línea

-- ============================================================================
-- Producción — despiece: robustez.
--
--  1. Bloqueo optimista: cada despiece tiene `version`; guardar exige la versión
--     que la persona tenía abierta. Si alguien guardó antes, se rechaza en vez
--     de pisarlo en silencio.
--  2. Historial: cada guardado deja una copia completa en
--     despieces_produccion_historial (se puede ver y recuperar).
--  3. base_pm: foto del PM (cantidad del mueble y componentes vigentes) al
--     guardar, hecha por la base. La pantalla la compara con el PM actual para
--     avisar si Planeación cambió algo después.
--  4. No se repite un mismo componente en dos líneas, ni se liga una línea a un
--     componente cancelado o enviado a la papelera.
--  5. clave_envio: guardar es seguro de repetir (cola sin conexión): la misma
--     clave sobre el mismo mueble no vuelve a guardar.
--  6. La unidad se guarda en mayúsculas.
--
-- Sigue sin tocar el PM, las asignaciones ni los recibos.
-- ============================================================================

alter table public.despieces_produccion
  add column version integer not null default 1,
  add column base_pm jsonb;

create table public.despieces_produccion_historial (
  id uuid primary key default gen_random_uuid(),
  despiece_id uuid not null references public.despieces_produccion(id) on delete cascade,
  version integer not null,
  lineas jsonb not null,
  igual_a_sugerencia boolean not null default false,
  clave_envio text,
  guardado_por uuid references auth.users(id),
  guardado_en timestamptz not null default now(),
  unique (despiece_id, version)
);
create unique index idx_despieces_historial_clave
  on public.despieces_produccion_historial (despiece_id, clave_envio)
  where clave_envio is not null;
create index idx_despieces_historial_guardado_por on public.despieces_produccion_historial (guardado_por);

alter table public.despieces_produccion_historial enable row level security;
create policy "select_despieces_produccion_historial" on public.despieces_produccion_historial
  for select to authenticated using ((select public.is_staff()));

-- Lo que ya estaba guardado queda como versión 1 del historial.
insert into public.despieces_produccion_historial
  (despiece_id, version, lineas, igual_a_sugerencia, guardado_por, guardado_en)
select id, 1, lineas, igual_a_sugerencia, actualizado_por, actualizado_en
from public.despieces_produccion;

-- La firma cambia (versión esperada, clave de envío, devuelve la versión): se
-- reemplaza la función anterior.
drop function if exists public.guardar_despiece_produccion(uuid, jsonb, boolean);

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
  v_hijo uuid;
  v_hijos_usados uuid[] := '{}';
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

  -- Bloquea el ítem: dos guardados simultáneos se atienden uno tras otro.
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

  -- ¿Este mismo envío ya se guardó? (la red se cortó antes de la respuesta)
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

  -- Versión: 0 = todavía no hay despiece guardado.
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

    v_limpias := v_limpias || jsonb_build_array(jsonb_build_object(
      'descripcion', v_descripcion,
      'material', v_material,
      'unidad', v_unidad,
      'piezas_por_mueble', v_piezas,
      'hijo_id', v_hijo
    ));
  end loop;

  -- Foto del PM en este momento, para avisar después si cambió.
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

revoke execute on function public.guardar_despiece_produccion(uuid, jsonb, integer, boolean, text) from public, anon;
grant execute on function public.guardar_despiece_produccion(uuid, jsonb, integer, boolean, text) to authenticated;
