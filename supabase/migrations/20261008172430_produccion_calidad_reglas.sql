-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.item_verificado_por_produccion
-- @verifica function-contiene public.crear_informe_calidad item_verificado_por_produccion
-- @verifica function public.proteger_liberacion_con_trabajo
-- @verifica trigger public.planeacion_items.trg_proteger_liberacion_con_trabajo
-- @verifica function-contiene public.anular_entrega_produccion no se puede anular la entrega
-- @verifica function public.faltantes_reglas_produccion_calidad

-- ============================================================================
-- Reglas entre Producción y Calidad que antes solo cumplía la pantalla.
--
-- 1. Calidad solo evalúa lo que Producción verificó: crear_informe_calidad
--    exige que el mueble (o, si es un componente, su mueble padre) tenga
--    piezas entregadas por un equipo y verificadas por el trabajador.
--
-- 4. Lo que Calidad ya evaluó no se mueve por debajo:
--    * un ítem con asignaciones vigentes o con informes de Calidad no regresa
--      a "pendiente" (aplica a todos, también a Planeación);
--    * una entrega verificada no se anula si Calidad ya la evaluó.
--
-- 10. faltantes_reglas_produccion_calidad(): lista los triggers y el RLS de
--     los que dependen estas reglas y que no estén en la base. La usa
--     `npm run test:db` (solo lectura) para detectar si alguien los quita o
--     los desactiva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Calidad solo evalúa lo verificado
-- ---------------------------------------------------------------------------
create or replace function public.item_verificado_por_produccion(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
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
      and e.verificada_en is not null
  );
$$;

revoke execute on function public.item_verificado_por_produccion(uuid) from public, anon;
grant execute on function public.item_verificado_por_produccion(uuid) to authenticated;

create or replace function public.crear_informe_calidad(
  p_item_id uuid,
  p_aprobado boolean,
  p_descripcion text,
  p_categoria text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_folio text;
  v_id uuid;
  v_item record;
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
  if not public.item_verificado_por_produccion(p_item_id) then
    raise exception 'Producción todavía no verifica piezas de este mueble; no se puede evaluar.';
  end if;

  v_folio := 'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0');

  insert into public.informes_calidad (planeacion_item_id, folio, aprobado, descripcion, categoria, elaborado_por)
    values (
      p_item_id, v_folio, p_aprobado, nullif(btrim(coalesce(p_descripcion, '')), ''),
      case when p_aprobado then null else nullif(btrim(coalesce(p_categoria, '')), '') end,
      auth.uid()
    )
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_informe_calidad(uuid, boolean, text, text) from public, anon;
grant execute on function public.crear_informe_calidad(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Un ítem con trabajo en marcha no regresa a "pendiente" (para todos)
-- ---------------------------------------------------------------------------
create or replace function public.proteger_liberacion_con_trabajo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado_liberacion = 'enviado_a_produccion'
     and new.estado_liberacion is distinct from 'enviado_a_produccion' then
    if exists (
      select 1 from public.asignaciones_produccion
      where planeacion_item_id = old.id and cancelada_en is null
    ) then
      raise exception 'El ítem % ya tiene asignaciones a equipos; cancélalas antes de regresarlo a pendiente.',
        old.item_code;
    end if;
    if exists (select 1 from public.informes_calidad where planeacion_item_id = old.id) then
      raise exception 'El ítem % ya tiene informes de Calidad; no se puede regresar a pendiente.',
        old.item_code;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_liberacion_con_trabajo() from public, anon, authenticated;

drop trigger if exists trg_proteger_liberacion_con_trabajo on public.planeacion_items;
create trigger trg_proteger_liberacion_con_trabajo
  before update of estado_liberacion on public.planeacion_items
  for each row execute function public.proteger_liberacion_con_trabajo();

-- La comprobación de asignaciones ya la hace el trigger de arriba para todos;
-- aquí queda solo qué columnas puede tocar Producción.
create or replace function public.protect_planeacion_items_columns_produccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_produccion() and not public.is_planeacion() then
    if (to_jsonb(old) - 'eliminacion_solicitada_en' - 'eliminacion_solicitada_por'
          - 'estado_liberacion' - 'liberado_en' - 'liberado_por')
       is distinct from
       (to_jsonb(new) - 'eliminacion_solicitada_en' - 'eliminacion_solicitada_por'
          - 'estado_liberacion' - 'liberado_en' - 'liberado_por')
    then
      raise exception 'Producción solo puede liberar ítems o solicitar su eliminación.';
    end if;

    if new.liberado_por is distinct from old.liberado_por
       and new.liberado_por is not null
       and new.liberado_por is distinct from auth.uid() then
      raise exception 'La liberación queda a nombre de quien la hace.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Una entrega que Calidad ya evaluó no se anula
-- ---------------------------------------------------------------------------
create or replace function public.anular_entrega_produccion(
  p_entrega_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrega record;
  v_folio text;
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo el administrador de Producción puede anular entregas.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la anulación.';
  end if;

  select e.anulada_en, e.verificada_en, a.planeacion_item_id into v_entrega
    from public.entregas_produccion e
    join public.asignaciones_produccion a on a.id = e.asignacion_id
    where e.id = p_entrega_id
    for update of e;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_entrega.anulada_en is not null then
    raise exception 'La entrega ya estaba anulada.';
  end if;

  -- Informe del mueble o de sus componentes hecho después de verificarla.
  if v_entrega.verificada_en is not null and v_entrega.planeacion_item_id is not null then
    select ic.folio into v_folio
      from public.informes_calidad ic
      join public.planeacion_items pi on pi.id = ic.planeacion_item_id
      where (pi.id = v_entrega.planeacion_item_id or pi.parent_item_id = v_entrega.planeacion_item_id)
        and ic.elaborado_en >= v_entrega.verificada_en
      order by ic.elaborado_en
      limit 1;
    if v_folio is not null then
      raise exception 'Calidad ya evaluó estas piezas (folio %); no se puede anular la entrega.', v_folio;
    end if;
  end if;

  update public.entregas_produccion
    set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
    where id = p_entrega_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Revisión para las pruebas de la base (solo lectura, solo service_role)
-- ---------------------------------------------------------------------------
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
  ) x;
$$;

revoke execute on function public.faltantes_reglas_produccion_calidad() from public, anon, authenticated;
grant execute on function public.faltantes_reglas_produccion_calidad() to service_role;
