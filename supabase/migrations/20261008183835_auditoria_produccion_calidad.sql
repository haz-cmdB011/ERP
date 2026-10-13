-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.auditar_produccion_calidad
-- @verifica trigger public.asignaciones_produccion.trg_auditar_asignaciones_produccion
-- @verifica trigger public.entregas_produccion.trg_auditar_entregas_produccion
-- @verifica trigger public.informes_calidad.trg_auditar_informes_calidad
-- @verifica trigger public.equipos_produccion.trg_auditar_equipos_produccion
-- @verifica function-contiene public.faltantes_reglas_produccion_calidad trg_auditar_entregas_produccion

-- ============================================================================
-- Auditoría del flujo Producción–Calidad. Hasta ahora la bitácora solo veía
-- pedidos, ítems y recibos. Se registra, con quién y cuándo:
--   * asignaciones: creada (o retrabajo de un folio) y cancelada (con motivo);
--   * entregas: registrada, verificada, rechazada por Producción y anulada;
--   * informes de Calidad: cada folio (aprobado o no, piezas, motivo);
--   * equipos: alta, desactivación y reactivación.
-- Los detalles copian PM, ítem, modelo, equipo y folio para que el registro se
-- entienda aunque después cambie o se borre algo.
-- faltantes_reglas_produccion_calidad avisa si alguno de estos triggers falta.
-- ============================================================================

create or replace function public.auditar_produccion_calidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_a record;
  v_equipo text;
  v_item record;
begin
  if tg_table_name = 'asignaciones_produccion' then
    select nombre into v_equipo from public.equipos_produccion where id = new.equipo_id;
    if tg_op = 'INSERT' then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id,
                case when new.informe_rechazo_id is not null then 'retrabajo_asignado' else 'asignado' end,
                jsonb_build_object(
                  'numero_pedido', new.numero_pedido, 'item_code', new.item_code, 'modelo', new.modelo,
                  'equipo', v_equipo, 'proceso', new.proceso, 'cantidad', new.cantidad,
                  'folio', (select folio from public.informes_calidad where id = new.informe_rechazo_id)
                ));
    elsif old.cancelada_en is null and new.cancelada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'asignacion_cancelada',
                jsonb_build_object(
                  'numero_pedido', new.numero_pedido, 'item_code', new.item_code, 'modelo', new.modelo,
                  'equipo', v_equipo, 'proceso', new.proceso, 'cantidad', new.cantidad,
                  'motivo', new.motivo_cancelacion
                ));
    end if;
    return new;
  end if;

  if tg_table_name = 'entregas_produccion' then
    select a.numero_pedido, a.item_code, a.modelo, a.proceso, q.nombre as equipo
      into v_a
      from public.asignaciones_produccion a
      join public.equipos_produccion q on q.id = a.equipo_id
      where a.id = new.asignacion_id;
    if tg_op = 'INSERT' then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_registrada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad
                ));
      return new;
    end if;
    if old.verificada_en is null and new.verificada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_verificada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad
                ));
    end if;
    if old.rechazada_en is null and new.rechazada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_rechazada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad, 'motivo', new.motivo_rechazo
                ));
    end if;
    if old.anulada_en is null and new.anulada_en is not null then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, tg_table_name, new.id, 'entrega_anulada',
                jsonb_build_object(
                  'numero_pedido', v_a.numero_pedido, 'item_code', v_a.item_code, 'modelo', v_a.modelo,
                  'equipo', v_a.equipo, 'proceso', v_a.proceso, 'cantidad', new.cantidad,
                  'folio', new.folios_calidad, 'motivo', new.motivo_anulacion
                ));
    end if;
    return new;
  end if;

  if tg_table_name = 'informes_calidad' then
    -- Solo INSERT: los informes no se editan ni se borran.
    select pi.item_code, pi.modelo, p.numero_pedido
      into v_item
      from public.planeacion_items pi
      join public.pedido_versiones pv on pv.id = pi.pedido_version_id
      join public.pedidos p on p.id = pv.pedido_id
      where pi.id = new.planeacion_item_id;
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id,
              case when new.aprobado then 'informe_aprobado' else 'informe_no_aprobado' end,
              jsonb_build_object(
                'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code, 'modelo', v_item.modelo,
                'folio', new.folio, 'cantidad', new.cantidad, 'motivo', new.descripcion,
                'categoria', new.categoria
              ));
    return new;
  end if;

  -- equipos_produccion
  if tg_op = 'INSERT' then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id, 'equipo_creado',
              jsonb_build_object('equipo', new.nombre, 'proceso', array_to_string(new.procesos, ', ')));
  elsif old.activo is distinct from new.activo then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id,
              case when new.activo then 'equipo_reactivado' else 'equipo_desactivado' end,
              jsonb_build_object('equipo', new.nombre, 'proceso', array_to_string(new.procesos, ', ')));
  end if;
  return new;
end;
$$;

-- Función de trigger: no debe poder llamarse desde la API pública.
revoke execute on function public.auditar_produccion_calidad() from public, anon, authenticated;

drop trigger if exists trg_auditar_asignaciones_produccion on public.asignaciones_produccion;
create trigger trg_auditar_asignaciones_produccion
  after insert or update on public.asignaciones_produccion
  for each row execute function public.auditar_produccion_calidad();

drop trigger if exists trg_auditar_entregas_produccion on public.entregas_produccion;
create trigger trg_auditar_entregas_produccion
  after insert or update on public.entregas_produccion
  for each row execute function public.auditar_produccion_calidad();

drop trigger if exists trg_auditar_informes_calidad on public.informes_calidad;
create trigger trg_auditar_informes_calidad
  after insert on public.informes_calidad
  for each row execute function public.auditar_produccion_calidad();

drop trigger if exists trg_auditar_equipos_produccion on public.equipos_produccion;
create trigger trg_auditar_equipos_produccion
  after insert or update on public.equipos_produccion
  for each row execute function public.auditar_produccion_calidad();

-- La revisión de las pruebas de la base cubre también estos triggers.
create or replace function public.faltantes_reglas_produccion_calidad()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(falta order by falta), '{}')
  from (
    select 'trigger ' || t.tabla || '.' || t.nombre as falta
    from (values
      ('planeacion_items', 'trg_protect_planeacion_items_columns_produccion'),
      ('planeacion_items', 'trg_proteger_liberacion_con_trabajo'),
      ('planeacion_items', 'trg_asignar_folio_produccion'),
      ('asignaciones_produccion', 'trg_auditar_asignaciones_produccion'),
      ('entregas_produccion', 'trg_auditar_entregas_produccion'),
      ('informes_calidad', 'trg_auditar_informes_calidad'),
      ('equipos_produccion', 'trg_auditar_equipos_produccion')
    ) as t(tabla, nombre)
    where not exists (
      select 1 from pg_trigger g
      join pg_class c on c.oid = g.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t.tabla
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
