-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.informes_calidad.entrega_id
-- @verifica column public.informes_calidad.cantidad
-- @verifica constraint public.informes_calidad.informes_calidad_lote_check
-- @verifica column public.asignaciones_produccion.informe_rechazo_id
-- @verifica function public.evaluar_entrega_calidad
-- @verifica function public.crear_retrabajo_produccion
-- @verifica function-contiene public.crear_informe_calidad Evaluar lote
-- @verifica function-contiene public.crear_informes_calidad_aprobados evaluar_entrega_calidad
-- @verifica function-contiene public.crear_asignacion_produccion informe_rechazo_id is null
-- @verifica function-contiene public.anular_entrega_produccion i.entrega_id = p_entrega_id
-- @verifica column public.lotes_calidad.pendiente
-- @verifica column public.rechazos_calidad.por_reasignar
-- @verifica column public.asignaciones_produccion_resumen.folio_rechazo

-- ============================================================================
-- Calidad evalúa por lote y Producción reasigna lo rechazado como retrabajo.
--
-- Lote = una entrega de un equipo (de armado o de barniz) que el trabajador de
-- Producción ya verificó.
--
-- * Calidad evalúa el lote con evaluar_entrega_calidad: cuántas piezas aprueba
--   y cuántas rechaza. Un folio por resultado: si el lote sale mixto se crean
--   dos informes (uno aprobado con N piezas y otro no aprobado con M piezas,
--   con motivo). Se puede evaluar un lote en partes; nunca más piezas que las
--   que tiene. Cada informe queda ligado a su entrega (entrega_id, cantidad).
-- * Los muebles (MO) ya no se evalúan "en general": crear_informe_calidad solo
--   sirve para los componentes (FU), que se siguen evaluando aparte y sin
--   cantidades. "Aprobar todos" (crear_informes_calidad_aprobados) aprueba lo
--   pendiente de los lotes de cada mueble y los componentes sin evaluar.
-- * Lo rechazado aparece en Producción (rechazos_calidad) y se reasigna con
--   crear_retrabajo_produccion al equipo que se elija, para el mismo proceso.
--   El retrabajo es una asignación con informe_rechazo_id: no cuenta contra la
--   cantidad del mueble y no puede pasar de las piezas rechazadas. Su entrega
--   se verifica y vuelve a Calidad como un lote más.
-- * Una entrega no se anula si Calidad ya evaluó piezas de ella (antes se
--   aproximaba por fechas; ahora es exacto).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Columnas
-- ---------------------------------------------------------------------------
alter table public.informes_calidad
  add column entrega_id uuid references public.entregas_produccion(id),
  add column cantidad numeric,
  add constraint informes_calidad_lote_check check (
    (entrega_id is null and cantidad is null)
    or (entrega_id is not null and cantidad > 0)
  );
create index idx_informes_calidad_entrega on public.informes_calidad (entrega_id);

alter table public.asignaciones_produccion
  add column informe_rechazo_id uuid references public.informes_calidad(id) on delete set null;
create index idx_asignaciones_produccion_informe_rechazo
  on public.asignaciones_produccion (informe_rechazo_id);

-- ---------------------------------------------------------------------------
-- Calidad evalúa un lote
-- ---------------------------------------------------------------------------
create or replace function public.evaluar_entrega_calidad(
  p_entrega_id uuid,
  p_aprobadas numeric,
  p_rechazadas numeric,
  p_motivo text default null,
  p_categoria text default null
)
returns table (informe_id uuid, folio text, aprobado boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_e record;
  v_aprob numeric := coalesce(p_aprobadas, 0);
  v_rech numeric := coalesce(p_rechazadas, 0);
  v_evaluado numeric;
  v_pendiente numeric;
  v_piezas numeric;
  v_categoria text := nullif(btrim(coalesce(p_categoria, '')), '');
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;
  if v_aprob < 0 or v_rech < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if v_aprob + v_rech <= 0 then
    raise exception 'Indica cuántas piezas apruebas o rechazas.';
  end if;
  if v_rech > 0 and nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Indica el motivo por el que no se aprueban las piezas rechazadas.';
  end if;
  if v_categoria is not null
     and v_categoria not in ('acabado', 'medidas', 'dano', 'faltante', 'material', 'armado', 'otro') then
    raise exception 'Tipo de defecto no válido.';
  end if;

  -- Bloquea la entrega: dos evaluaciones a la vez no pasan juntas del lote.
  select e.cantidad, e.verificada_en, e.anulada_en, e.rechazada_en,
         a.cancelada_en, a.planeacion_item_id,
         pi.estado_revision, pi.eliminacion_solicitada_en,
         p.eliminado_en, p.cancelado_en
    into v_e
    from public.entregas_produccion e
    join public.asignaciones_produccion a on a.id = e.asignacion_id
    left join public.planeacion_items pi on pi.id = a.planeacion_item_id
    left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    left join public.pedidos p on p.id = pv.pedido_id
    where e.id = p_entrega_id
    for update of e;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_e.anulada_en is not null or v_e.rechazada_en is not null or v_e.cancelada_en is not null then
    raise exception 'La entrega ya no está vigente (anulada, rechazada por Producción o de una asignación cancelada).';
  end if;
  if v_e.verificada_en is null then
    raise exception 'Producción todavía no verifica esta entrega.';
  end if;
  if v_e.planeacion_item_id is null
     or v_e.estado_revision = 'cancelado'
     or v_e.eliminacion_solicitada_en is not null
     or v_e.eliminado_en is not null
     or v_e.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado o eliminado; ya no se evalúa.';
  end if;

  select coalesce(sum(i.cantidad), 0) into v_evaluado
    from public.informes_calidad i where i.entrega_id = p_entrega_id;
  v_pendiente := v_e.cantidad - v_evaluado;
  if v_aprob + v_rech > v_pendiente then
    raise exception 'Este lote solo tiene % pieza(s) por evaluar.', v_pendiente;
  end if;

  v_piezas := public.piezas_verificadas_mueble(v_e.planeacion_item_id);

  if v_aprob > 0 then
    insert into public.informes_calidad (
      planeacion_item_id, folio, aprobado, elaborado_por, piezas_verificadas, entrega_id, cantidad
    ) values (
      v_e.planeacion_item_id,
      'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0'),
      true, auth.uid(), v_piezas, p_entrega_id, v_aprob
    )
    returning id, folio, aprobado into informe_id, folio, aprobado;
    return next;
  end if;

  if v_rech > 0 then
    insert into public.informes_calidad (
      planeacion_item_id, folio, aprobado, descripcion, categoria, elaborado_por,
      piezas_verificadas, entrega_id, cantidad
    ) values (
      v_e.planeacion_item_id,
      'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0'),
      false, btrim(p_motivo), v_categoria, auth.uid(), v_piezas, p_entrega_id, v_rech
    )
    returning id, folio, aprobado into informe_id, folio, aprobado;
    return next;
  end if;
end;
$$;

revoke execute on function public.evaluar_entrega_calidad(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.evaluar_entrega_calidad(uuid, numeric, numeric, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Los muebles se evalúan por lote; crear_informe_calidad queda para componentes
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
  if v_item.tipo_registro = 'MO' then
    raise exception 'Los muebles se evalúan por lote: usa "Evaluar lote" en la entrega.';
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

-- "Aprobar todos": de cada mueble, todas las piezas pendientes de sus lotes;
-- de cada componente, un informe aprobado. Todo o nada (una transacción).
create or replace function public.crear_informes_calidad_aprobados(p_item_ids uuid[])
returns table (item_id uuid, informe_id uuid)
language plpgsql
security invoker
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

-- ---------------------------------------------------------------------------
-- Producción reasigna lo rechazado como retrabajo
-- ---------------------------------------------------------------------------
create or replace function public.crear_retrabajo_produccion(
  p_informe_id uuid,
  p_equipo_id uuid,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r record;
  v_equipo record;
  v_reasignado numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede reasignar retrabajos.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;

  -- Bloquea el informe: dos reasignaciones a la vez no pasan juntas del rechazo.
  select i.aprobado, i.cantidad, i.folio,
         a.planeacion_item_id, a.pedido_id, a.numero_pedido, a.item_code, a.modelo,
         a.descripcion, a.unidad, a.proceso,
         pi.estado_revision, pi.eliminacion_solicitada_en,
         p.eliminado_en, p.cancelado_en
    into v_r
    from public.informes_calidad i
    join public.entregas_produccion e on e.id = i.entrega_id
    join public.asignaciones_produccion a on a.id = e.asignacion_id
    left join public.planeacion_items pi on pi.id = a.planeacion_item_id
    left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    left join public.pedidos p on p.id = pv.pedido_id
    where i.id = p_informe_id
    for update of i;
  if not found then
    raise exception 'El informe no existe o no es de un lote.';
  end if;
  if v_r.aprobado then
    raise exception 'El informe % está aprobado; no hay nada que retrabajar.', v_r.folio;
  end if;
  if v_r.planeacion_item_id is null
     or v_r.estado_revision = 'cancelado'
     or v_r.eliminacion_solicitada_en is not null
     or v_r.eliminado_en is not null
     or v_r.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado o eliminado.';
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (v_r.proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, v_r.proceso;
  end if;

  select coalesce(sum(cantidad), 0) into v_reasignado
    from public.asignaciones_produccion
    where informe_rechazo_id = p_informe_id and cancelada_en is null;
  if v_reasignado + p_cantidad > v_r.cantidad then
    raise exception 'Del folio % solo quedan % pieza(s) por reasignar.', v_r.folio, v_r.cantidad - v_reasignado;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, informe_rechazo_id
  ) values (
    v_r.planeacion_item_id, v_r.pedido_id, v_r.numero_pedido, v_r.item_code, v_r.modelo,
    v_r.descripcion, v_r.unidad, p_equipo_id, v_r.proceso, p_cantidad, p_fecha_asignacion,
    nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), p_informe_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_retrabajo_produccion(uuid, uuid, numeric, date, text) from public, anon;
grant execute on function public.crear_retrabajo_produccion(uuid, uuid, numeric, date, text) to authenticated;

-- El retrabajo no cuenta contra la cantidad del mueble: solo cambia la suma
-- de lo ya asignado (informe_rechazo_id is null).
create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_equipo record;
  v_asignado numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null or p_proceso not in ('armado', 'barniz') then
    raise exception 'Proceso no válido.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;

  -- Bloquea el ítem: dos asignaciones simultáneas del mismo mueble se
  -- atienden una tras otra y no pueden pasarse juntas de la cantidad.
  select pi.id, pi.item_code, pi.modelo, pi.descripcion, pi.unidad, pi.cantidad_total,
         pi.tipo_registro, pi.estado_liberacion, pi.eliminacion_solicitada_en,
         pi.estado_revision, pv.es_version_activa,
         p.id as pedido_id, p.numero_pedido, p.eliminado_en, p.cancelado_en
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
    raise exception 'Solo se asignan muebles (ítems padre), no componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; asigna desde la versión activa.';
  end if;
  if v_item.estado_liberacion <> 'enviado_a_produccion' then
    raise exception 'El ítem % todavía no está liberado a producción.', v_item.item_code;
  end if;
  if v_item.eliminacion_solicitada_en is not null
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El ítem % o su PM está cancelado o eliminado.', v_item.item_code;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  select coalesce(sum(cantidad), 0) into v_asignado
    from public.asignaciones_produccion
    where planeacion_item_id = p_item_id and proceso = p_proceso and cancelada_en is null
      and informe_rechazo_id is null;

  if v_asignado + p_cantidad > v_item.cantidad_total then
    raise exception 'Solo quedan % por asignar de % para % (ya asignadas: %).',
      v_item.cantidad_total - v_asignado, v_item.cantidad_total, p_proceso, v_asignado;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Una entrega con piezas ya evaluadas por Calidad no se anula (exacto, por lote)
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
  v_anulada timestamptz;
  v_folio text;
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo el administrador de Producción puede anular entregas.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la anulación.';
  end if;

  select anulada_en into v_anulada
    from public.entregas_produccion where id = p_entrega_id for update;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_anulada is not null then
    raise exception 'La entrega ya estaba anulada.';
  end if;

  select i.folio into v_folio
    from public.informes_calidad i
    where i.entrega_id = p_entrega_id
    order by i.elaborado_en
    limit 1;
  if v_folio is not null then
    raise exception 'Calidad ya evaluó estas piezas (folio %); no se puede anular la entrega.', v_folio;
  end if;

  update public.entregas_produccion
    set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
    where id = p_entrega_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vistas (security_invoker: respetan el RLS de cada tabla)
-- ---------------------------------------------------------------------------

-- Un lote por entrega verificada y vigente, con lo que Calidad ya evaluó.
-- `vigente` = el mueble y su PM no están cancelados ni eliminados.
create view public.lotes_calidad
with (security_invoker = true) as
select
  e.id as entrega_id,
  e.asignacion_id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.proceso,
  a.equipo_id,
  q.nombre as equipo,
  a.informe_rechazo_id,
  ir.folio as folio_rechazo,
  e.fecha_entrega,
  e.verificada_en,
  e.cantidad,
  coalesce(ev.aprobadas, 0) as aprobadas,
  coalesce(ev.rechazadas, 0) as rechazadas,
  e.cantidad - coalesce(ev.aprobadas, 0) - coalesce(ev.rechazadas, 0) as pendiente,
  coalesce(
    pi.id is not null
    and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null
    and p.eliminado_definitivo_en is null
    and p.cancelado_en is null,
    false
  ) as vigente
from public.entregas_produccion e
join public.asignaciones_produccion a on a.id = e.asignacion_id
join public.equipos_produccion q on q.id = a.equipo_id
left join public.informes_calidad ir on ir.id = a.informe_rechazo_id
left join public.planeacion_items pi on pi.id = a.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id
left join lateral (
  select sum(i.cantidad) filter (where i.aprobado) as aprobadas,
         sum(i.cantidad) filter (where not i.aprobado) as rechazadas
  from public.informes_calidad i
  where i.entrega_id = e.id
) ev on true
where e.verificada_en is not null
  and e.anulada_en is null
  and e.rechazada_en is null
  and a.cancelada_en is null;

-- Piezas que Calidad rechazó en un lote y cuánto de eso ya se reasignó.
create view public.rechazos_calidad
with (security_invoker = true) as
select
  i.id as informe_id,
  i.folio,
  i.elaborado_en,
  i.descripcion as motivo,
  i.categoria,
  i.cantidad,
  i.entrega_id,
  e.fecha_entrega,
  a.id as asignacion_id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.proceso,
  a.equipo_id,
  q.nombre as equipo,
  coalesce(r.reasignado, 0) as reasignado,
  i.cantidad - coalesce(r.reasignado, 0) as por_reasignar,
  coalesce(
    pi.id is not null
    and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null
    and p.eliminado_definitivo_en is null
    and p.cancelado_en is null,
    false
  ) as vigente
from public.informes_calidad i
join public.entregas_produccion e on e.id = i.entrega_id
join public.asignaciones_produccion a on a.id = e.asignacion_id
join public.equipos_produccion q on q.id = a.equipo_id
left join public.planeacion_items pi on pi.id = a.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id
left join lateral (
  select sum(x.cantidad) as reasignado
  from public.asignaciones_produccion x
  where x.informe_rechazo_id = i.id and x.cancelada_en is null
) r on true
where not i.aprobado;

-- La hoja de asignaciones gana de qué rechazo viene cada retrabajo (al final:
-- create or replace view no deja reordenar columnas).
create or replace view public.asignaciones_produccion_resumen
with (security_invoker = true) as
select
  a.id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.equipo_id,
  e.nombre as equipo,
  e.encargado as equipo_encargado,
  e.es_planta,
  a.proceso,
  a.cantidad,
  a.fecha_asignacion,
  a.notas,
  a.creado_en,
  a.cancelada_en,
  a.motivo_cancelacion,
  coalesce(en.entregado, 0) as entregado,
  en.ultima_entrega,
  en.folios_calidad,
  coalesce(en.num_entregas, 0) as num_entregas,
  case
    when a.cancelada_en is not null then 'cancelada'
    when coalesce(en.entregado, 0) >= a.cantidad then 'entregada'
    when coalesce(en.entregado, 0) > 0 then 'parcial'
    else 'en_proceso'
  end as estado,
  coalesce(en.verificado, 0) as verificado,
  coalesce(en.entregado, 0) - coalesce(en.verificado, 0) as por_verificar,
  en.ultima_verificacion,
  a.informe_rechazo_id,
  ir.folio as folio_rechazo
from public.asignaciones_produccion a
join public.equipos_produccion e on e.id = a.equipo_id
left join public.informes_calidad ir on ir.id = a.informe_rechazo_id
left join lateral (
  select sum(x.cantidad) as entregado,
         max(x.fecha_entrega) as ultima_entrega,
         string_agg(x.folios_calidad, ', ' order by x.fecha_entrega, x.registrado_en) as folios_calidad,
         count(*) as num_entregas,
         sum(x.cantidad) filter (where x.verificada_en is not null) as verificado,
         max((x.verificada_en at time zone 'America/Mexico_City')::date) as ultima_verificacion
  from public.entregas_produccion x
  where x.asignacion_id = a.id and x.anulada_en is null and x.rechazada_en is null
) en on true;
