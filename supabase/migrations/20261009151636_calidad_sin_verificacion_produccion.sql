-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.ajustes_flujo
-- @verifica function public.verificacion_produccion_activa
-- @verifica function public.auto_verificar_entrega_produccion
-- @verifica trigger public.entregas_produccion.trg_auto_verificar_entrega_produccion
-- @verifica function-contiene public.crear_informe_calidad verificacion_produccion_activa
-- @verifica function-contiene public.crear_informes_calidad_aprobados verificacion_produccion_activa

-- ============================================================================
-- Verificación de Producción apagada (por ahora).
--
-- Hasta aquí Calidad solo evaluaba lo que un trabajador de Producción había
-- "verificado" (mandado a Calidad): esa preaprobación frenaba el trabajo de
-- Calidad. Mientras el ajuste `verificacion_produccion` esté en falso:
--
--   * Calidad evalúa todo ítem liberado a producción, haya o no entregas:
--     - componentes (FU): igual que antes, sin exigir piezas verificadas;
--     - muebles (MO) sin lotes: un informe general del mueble (sin entrega);
--     - muebles con lotes: se siguen evaluando por lote (evaluar_entrega_calidad).
--   * Las entregas que registra un equipo nacen ya verificadas, así que pasan
--     solas a Calidad como lote (se conserva el control de piezas y el
--     retrabajo). Las que estuvieran por verificar, se dan por verificadas.
--
-- Para volver al flujo con verificación:
--     update public.ajustes_flujo set activo = true, actualizado_en = now()
--       where clave = 'verificacion_produccion';
-- Si el ajuste no existe se asume activo (el flujo anterior).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ajustes del flujo
-- ---------------------------------------------------------------------------
create table public.ajustes_flujo (
  clave text primary key,
  activo boolean not null,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users(id)
);

create index idx_ajustes_flujo_actualizado_por on public.ajustes_flujo (actualizado_por);

alter table public.ajustes_flujo enable row level security;

-- Lo leen quienes ya tienen rol; se cambia solo desde SQL (sin política de escritura).
create policy "staff_select_ajustes_flujo" on public.ajustes_flujo
  for select to authenticated
  using (public.is_staff());

insert into public.ajustes_flujo (clave, activo) values ('verificacion_produccion', false);

create or replace function public.verificacion_produccion_activa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.activo from public.ajustes_flujo a where a.clave = 'verificacion_produccion'),
    true
  );
$$;

revoke execute on function public.verificacion_produccion_activa() from public, anon;
grant execute on function public.verificacion_produccion_activa() to authenticated;

-- ---------------------------------------------------------------------------
-- Las entregas nacen verificadas mientras la verificación esté apagada
-- ---------------------------------------------------------------------------
create or replace function public.auto_verificar_entrega_produccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verificada_en is null
     and new.rechazada_en is null
     and not public.verificacion_produccion_activa() then
    new.verificada_en := now();
    new.verificada_por := new.registrado_por;
  end if;
  return new;
end;
$$;

revoke execute on function public.auto_verificar_entrega_produccion() from public, anon, authenticated;

drop trigger if exists trg_auto_verificar_entrega_produccion on public.entregas_produccion;
create trigger trg_auto_verificar_entrega_produccion
  before insert on public.entregas_produccion
  for each row execute function public.auto_verificar_entrega_produccion();

-- Lo que ya estuviera esperando verificación pasa a Calidad.
update public.entregas_produccion
  set verificada_en = now(), verificada_por = registrado_por
  where verificada_en is null
    and rechazada_en is null
    and anulada_en is null
    and not public.verificacion_produccion_activa();

-- ---------------------------------------------------------------------------
-- crear_informe_calidad: sin verificación, se evalúa todo ítem liberado
-- ---------------------------------------------------------------------------
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
  v_verifica boolean;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;

  if not p_aprobado and nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Indica el motivo por el que no se aprueba.';
  end if;

  select tipo_registro, estado_liberacion, estado_revision, eliminacion_solicitada_en
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

  v_verifica := public.verificacion_produccion_activa();
  v_piezas := public.piezas_verificadas_mueble(p_item_id);

  -- Un mueble con lotes (entregas verificadas) se evalúa por lote. Con la
  -- verificación activa, todo mueble se evalúa así.
  if v_item.tipo_registro = 'MO' and (v_verifica or v_piezas > 0) then
    raise exception 'Los muebles se evalúan por lote: usa "Evaluar lote" en la entrega.';
  end if;
  if v_verifica and v_piezas <= 0 then
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

-- ---------------------------------------------------------------------------
-- "Aprobar todos": un mueble sin lotes ni informe se aprueba completo
-- ---------------------------------------------------------------------------
create or replace function public.crear_informes_calidad_aprobados(p_item_ids uuid[])
returns table (item_id uuid, informe_id uuid)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item record;
  v_lote record;
  v_informe record;
  v_hubo boolean;
begin
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'No hay ítems que aprobar.';
  end if;
  if cardinality(p_item_ids) > 200 then
    raise exception 'Se pueden aprobar hasta 200 ítems a la vez.';
  end if;

  for v_item in
    select pi.id, pi.item_code, pi.tipo_registro
      from public.planeacion_items pi
      where pi.id = any(p_item_ids)
      order by pi.id
  loop
    item_id := v_item.id;
    if v_item.tipo_registro = 'MO' then
      v_hubo := false;
      for v_lote in
        select e.id as entrega,
               e.cantidad - coalesce((
                 select sum(i.cantidad) from public.informes_calidad i where i.entrega_id = e.id
               ), 0) as pendiente
          from public.entregas_produccion e
          join public.asignaciones_produccion a on a.id = e.asignacion_id
          where a.planeacion_item_id = v_item.id
            and a.cancelada_en is null
            and e.verificada_en is not null
            and e.anulada_en is null
            and e.rechazada_en is null
          order by e.verificada_en, e.id
      loop
        if v_lote.pendiente > 0 then
          for v_informe in
            select r.informe_id as id
              from public.evaluar_entrega_calidad(v_lote.entrega, v_lote.pendiente, 0) r
          loop
            informe_id := v_informe.id;
            v_hubo := true;
            return next;
          end loop;
        end if;
      end loop;
      -- Sin verificación de Producción, un mueble sin lotes ni informes se
      -- aprueba completo (informe general, sin entrega).
      if not v_hubo
         and not public.verificacion_produccion_activa()
         and public.piezas_verificadas_mueble(v_item.id) <= 0
         and not exists (
           select 1 from public.informes_calidad i where i.planeacion_item_id = v_item.id
         ) then
        informe_id := public.crear_informe_calidad(v_item.id, true, '', null);
        v_hubo := true;
        return next;
      end if;
      if not v_hubo then
        raise exception 'El ítem % no tiene piezas por evaluar.', v_item.item_code;
      end if;
    else
      informe_id := public.crear_informe_calidad(v_item.id, true, '', null);
      return next;
    end if;
  end loop;
end;
$$;

revoke execute on function public.crear_informes_calidad_aprobados(uuid[]) from public, anon;
grant execute on function public.crear_informes_calidad_aprobados(uuid[]) to authenticated;
