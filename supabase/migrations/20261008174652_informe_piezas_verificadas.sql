-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.informes_calidad.piezas_verificadas
-- @verifica function public.piezas_verificadas_mueble
-- @verifica function-contiene public.crear_informe_calidad piezas_verificadas_mueble
-- @verifica function-contiene public.item_verificado_por_produccion piezas_verificadas_mueble
-- @verifica function-contiene public.faltantes_reglas_produccion_calidad politica de escritura directa

-- ============================================================================
-- Cada informe de Calidad guarda cuántas piezas verificadas por Producción
-- tenía el mueble cuando se evaluó (piezas_verificadas).
--
-- Con eso Calidad sabe si hay piezas nuevas desde su última evaluación sin
-- comparar fechas: si hoy hay más piezas verificadas que las que guardó el
-- último informe, hay "Entrega nueva". Antes se comparaba el día de la última
-- entrega con el de la evaluación y, si Producción verificaba más piezas el
-- mismo día en que Calidad ya había aprobado, esas piezas no aparecían.
--
-- El total solo crece después de un informe: una entrega verificada no se
-- rechaza, y no se anula si Calidad ya la evaluó (20261008172430).
--
-- Los informes anteriores quedan con piezas_verificadas nulo; para ellos la
-- pantalla sigue comparando fechas.
--
-- Además, los informes solo se crean con crear_informe_calidad: la política
-- calidad_insert_informes_calidad dejaba a Calidad insertar directo en la
-- tabla (cualquier folio, sin verificar piezas ni guardarlas). La función
-- pasa a security definer (sigue exigiendo is_calidad()) y la política se
-- quita; faltantes_reglas_produccion_calidad avisa si vuelve a aparecer.
-- ============================================================================

alter table public.informes_calidad
  add column piezas_verificadas numeric,
  add constraint informes_calidad_piezas_verificadas_check check (
    piezas_verificadas is null or piezas_verificadas >= 0
  );

-- Piezas entregadas y verificadas de un mueble (o del mueble padre, si es un
-- componente), sumando todas sus asignaciones vigentes.
create or replace function public.piezas_verificadas_mueble(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(e.cantidad), 0)
  from public.planeacion_items pi
  join public.asignaciones_produccion a
    on a.planeacion_item_id = case
      when pi.tipo_registro = 'FU' and pi.parent_item_id is not null then pi.parent_item_id
      else pi.id
    end
  join public.entregas_produccion e on e.asignacion_id = a.id
  where pi.id = p_item_id
    and a.cancelada_en is null
    and e.anulada_en is null
    and e.rechazada_en is null
    and e.verificada_en is not null;
$$;

revoke execute on function public.piezas_verificadas_mueble(uuid) from public, anon;
grant execute on function public.piezas_verificadas_mueble(uuid) to authenticated;

create or replace function public.item_verificado_por_produccion(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.piezas_verificadas_mueble(p_item_id) > 0;
$$;

create or replace function public.crear_informe_calidad(
  p_item_id uuid,
  p_aprobado boolean,
  p_descripcion text,
  p_categoria text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folio text;
  v_id uuid;
  v_item record;
  v_piezas numeric;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;

  if not p_aprobado and nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Indica el motivo por el que no se aprueba.';
  end if;

  select estado_liberacion, estado_revision, eliminacion_solicitada_en
    into v_item
    from public.planeacion_items
    where id = p_item_id;
  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.estado_liberacion is distinct from 'enviado_a_produccion' then
    raise exception 'El ítem todavía no se envió a producción.';
  end if;
  if v_item.estado_revision = 'cancelado' then
    raise exception 'El ítem está cancelado y ya no se evalúa.';
  end if;
  if v_item.eliminacion_solicitada_en is not null then
    raise exception 'El ítem fue eliminado y ya no se evalúa.';
  end if;

  v_piezas := public.piezas_verificadas_mueble(p_item_id);
  if v_piezas <= 0 then
    raise exception 'Producción todavía no verifica piezas de este mueble; no se puede evaluar.';
  end if;

  v_folio := 'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0');

  insert into public.informes_calidad (
    planeacion_item_id, folio, aprobado, descripcion, categoria, elaborado_por, piezas_verificadas
  ) values (
    p_item_id, v_folio, p_aprobado, nullif(btrim(coalesce(p_descripcion, '')), ''),
    case when p_aprobado then null else nullif(btrim(coalesce(p_categoria, '')), '') end,
    auth.uid(), v_piezas
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_informe_calidad(uuid, boolean, text, text) from public, anon;
grant execute on function public.crear_informe_calidad(uuid, boolean, text, text) to authenticated;

drop policy if exists "calidad_insert_informes_calidad" on public.informes_calidad;

create or replace function public.faltantes_reglas_produccion_calidad()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(falta order by falta), '{}')
  from (
    select 'trigger ' || t.nombre as falta
    from (values
      ('trg_protect_planeacion_items_columns_produccion'),
      ('trg_proteger_liberacion_con_trabajo'),
      ('trg_asignar_folio_produccion')
    ) as t(nombre)
    where not exists (
      select 1 from pg_trigger g
      where g.tgrelid = 'public.planeacion_items'::regclass
        and g.tgname = t.nombre
        and not g.tgisinternal
        and g.tgenabled <> 'D'
    )
    union all
    select 'rls ' || r.tabla
    from (values
      ('planeacion_items'),
      ('asignaciones_produccion'),
      ('entregas_produccion'),
      ('informes_calidad'),
      ('equipos_produccion')
    ) as r(tabla)
    where not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = r.tabla and c.relrowsecurity
    )
    union all
    -- Escribir en estas tablas solo por sus funciones (security definer).
    select 'politica de escritura directa ' || p.tablename || '.' || p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('informes_calidad', 'asignaciones_produccion', 'entregas_produccion')
      and p.cmd <> 'SELECT'
  ) x;
$$;

revoke execute on function public.faltantes_reglas_produccion_calidad() from public, anon, authenticated;
grant execute on function public.faltantes_reglas_produccion_calidad() to service_role;
