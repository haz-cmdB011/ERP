-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.revisiones_finales_calidad
-- @verifica policy public.revisiones_finales_calidad.select_revisiones_finales_calidad
-- @verifica column public.asignaciones_produccion.revision_final_rechazo_id
-- @verifica column public.asignaciones_produccion_resumen.revision_final_rechazo_id
-- @verifica column public.revision_final_muebles.pendientes
-- @verifica column public.rechazos_revision_final.por_reasignar
-- @verifica function public.revision_final_activa
-- @verifica function public.piezas_listas_revision_final
-- @verifica function public.registrar_revision_final
-- @verifica function public.crear_retrabajo_revision_final
-- @verifica function-contiene public.crear_asignacion_produccion revision_final_rechazo_id is null

-- ============================================================================
-- Calidad — revisión final del mueble (APAGADA hasta que Calidad la confirme).
--
-- Calidad ya revisa por proceso: cada entrega de un equipo es un lote. Falta la
-- revisión del mueble completo antes de mandarlo a obra.
--
--   * Ajuste `revision_final` en ajustes_flujo, creado APAGADO. Apagado, nada
--     cambia: no se registra la revisión final y las pantallas no la muestran.
--   * Listas para la revisión final = lo que Calidad aprobó en el ÚLTIMO paso de
--     la ruta del mueble (cada paso parte del anterior) + lo aprobado de los
--     retrabajos que mandó la propia revisión final − lo ya revisado en ella.
--   * revisiones_finales_calidad: un folio FIN- por resultado (aprobadas o
--     rechazadas, como los lotes). Lo rechazado lleva motivo y el PASO de la
--     ruta al que regresa; Producción lo reasigna como retrabajo de ese paso
--     (crear_retrabajo_revision_final), que no cuenta contra el tope del paso.
--     Al volver a entregarse y aprobarse en su lote, regresa a la revisión final.
--   * Liberado a obra = la revisión final aprobó la cantidad del mueble.
--   * Solo muebles padre. No cambia el cobro de los maquiladores (se cobra por
--     proceso aprobado) ni la revisión por lotes.
-- ============================================================================

-- 1. Ajuste ---------------------------------------------------------------------
insert into public.ajustes_flujo (clave, activo) values ('revision_final', false)
on conflict (clave) do nothing;

create or replace function public.revision_final_activa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.activo from public.ajustes_flujo a where a.clave = 'revision_final'), false);
$$;

revoke execute on function public.revision_final_activa() from public, anon;
grant execute on function public.revision_final_activa() to authenticated;

-- 2. Revisiones finales -----------------------------------------------------------
create sequence public.revisiones_finales_folio_seq;

create table public.revisiones_finales_calidad (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  folio text not null unique,
  aprobado boolean not null,
  cantidad numeric not null,
  motivo text,
  categoria text,
  -- Paso de la ruta al que regresa lo rechazado.
  paso_retrabajo_id uuid references public.pasos_ruta_produccion(id),
  elaborado_por uuid references auth.users(id) default auth.uid(),
  elaborado_en timestamptz not null default now(),
  constraint revisiones_finales_cantidad_check check (cantidad > 0),
  constraint revisiones_finales_rechazo_check check (
    aprobado
    or (nullif(btrim(coalesce(motivo, '')), '') is not null and paso_retrabajo_id is not null)
  ),
  constraint revisiones_finales_categoria_check check (
    categoria is null
    or categoria in ('acabado', 'medidas', 'dano', 'faltante', 'material', 'armado', 'otro')
  )
);
create index idx_revisiones_finales_item on public.revisiones_finales_calidad (planeacion_item_id);
create index idx_revisiones_finales_paso on public.revisiones_finales_calidad (paso_retrabajo_id);
create index idx_revisiones_finales_elaborado_por on public.revisiones_finales_calidad (elaborado_por);

alter table public.revisiones_finales_calidad enable row level security;
create policy "select_revisiones_finales_calidad" on public.revisiones_finales_calidad
  for select to authenticated using ((select public.is_staff()));
-- Sin políticas de escritura: solo entra por registrar_revision_final.

-- El retrabajo que manda la revisión final.
alter table public.asignaciones_produccion
  add column revision_final_rechazo_id uuid
    references public.revisiones_finales_calidad(id) on delete set null;
create index idx_asignaciones_produccion_revision_final
  on public.asignaciones_produccion (revision_final_rechazo_id);

-- 3. Piezas listas para la revisión final ---------------------------------------------
create or replace function public.piezas_listas_revision_final(p_item_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with ultimo as (
    select s.id
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
    order by s.orden desc
    limit 1
  )
  select coalesce(sum(l.aprobadas) filter (
           where a.revision_final_rechazo_id is null and a.paso_id = (select id from ultimo)), 0)
       + coalesce(sum(l.aprobadas) filter (where a.revision_final_rechazo_id is not null), 0)
  from public.lotes_calidad l
  join public.asignaciones_produccion a on a.id = l.asignacion_id
  where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente;
$$;

revoke execute on function public.piezas_listas_revision_final(uuid) from public, anon;
grant execute on function public.piezas_listas_revision_final(uuid) to authenticated;

-- Por mueble con ruta: lo listo, lo revisado y lo que falta revisar.
create or replace view public.revision_final_muebles
with (security_invoker = true) as
select
  pi.id as planeacion_item_id,
  pv.pedido_id,
  pi.cantidad_total,
  l.listas,
  coalesce(rf.aprobadas, 0) as aprobadas,
  coalesce(rf.rechazadas, 0) as rechazadas,
  greatest(0, l.listas - coalesce(rf.aprobadas, 0) - coalesce(rf.rechazadas, 0)) as pendientes,
  coalesce(rf.aprobadas, 0) >= pi.cantidad_total as liberado_a_obra
from public.rutas_produccion r
join public.planeacion_items pi on pi.id = r.planeacion_item_id
join public.pedido_versiones pv on pv.id = pi.pedido_version_id
cross join lateral (select public.piezas_listas_revision_final(pi.id) as listas) l
left join lateral (
  select sum(x.cantidad) filter (where x.aprobado) as aprobadas,
         sum(x.cantidad) filter (where not x.aprobado) as rechazadas
  from public.revisiones_finales_calidad x
  where x.planeacion_item_id = pi.id
) rf on true;

-- 4. Registrar la revisión final --------------------------------------------------------
create or replace function public.registrar_revision_final(
  p_item_id uuid,
  p_aprobadas numeric,
  p_rechazadas numeric,
  p_motivo text default null,
  p_categoria text default null,
  p_paso_id uuid default null
)
returns table (revision_id uuid, folio text, aprobado boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item record;
  v_aprob numeric := coalesce(p_aprobadas, 0);
  v_rech numeric := coalesce(p_rechazadas, 0);
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_categoria text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_listas numeric;
  v_revisado numeric;
  v_aprobado_antes numeric;
  v_id uuid;
  v_folio text;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para hacer la revisión final.';
  end if;
  if not public.revision_final_activa() then
    raise exception 'La revisión final está apagada.';
  end if;
  if v_aprob < 0 or v_rech < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if v_aprob + v_rech <= 0 then
    raise exception 'Indica cuántas piezas apruebas o rechazas.';
  end if;
  if v_rech > 0 and v_motivo is null then
    raise exception 'Indica el motivo por el que no se aprueban las piezas rechazadas.';
  end if;
  if v_rech > 0 and p_paso_id is null then
    raise exception 'Indica a qué paso de la ruta regresa lo rechazado.';
  end if;
  if v_categoria is not null
     and v_categoria not in ('acabado', 'medidas', 'dano', 'faltante', 'material', 'armado', 'otro') then
    raise exception 'Tipo de defecto no válido.';
  end if;

  -- Bloquea el mueble: dos revisiones a la vez no pasan juntas de lo listo.
  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.cantidad_total, pi.estado_revision,
         pi.eliminacion_solicitada_en, pv.es_version_activa, p.numero_pedido, p.eliminado_en, p.cancelado_en
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
    raise exception 'La revisión final es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminacion_solicitada_en is not null
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado, eliminado o es de una versión anterior.';
  end if;
  if v_rech > 0 and not exists (
    select 1 from public.pasos_ruta_produccion s
    where s.id = p_paso_id and s.planeacion_item_id = p_item_id and s.retirado_en is null
  ) then
    raise exception 'Ese paso ya no está en la ruta del mueble; recarga la página.';
  end if;

  v_listas := public.piezas_listas_revision_final(p_item_id);
  select coalesce(sum(x.cantidad), 0), coalesce(sum(x.cantidad) filter (where x.aprobado), 0)
    into v_revisado, v_aprobado_antes
    from public.revisiones_finales_calidad x where x.planeacion_item_id = p_item_id;
  if v_aprob + v_rech > v_listas - v_revisado then
    raise exception 'Este mueble solo tiene % pieza(s) listas para la revisión final.',
      greatest(0, v_listas - v_revisado);
  end if;
  if v_aprobado_antes + v_aprob > v_item.cantidad_total then
    raise exception 'No se pueden aprobar más piezas que las del mueble (%).', v_item.cantidad_total;
  end if;

  if v_aprob > 0 then
    v_folio := 'FIN-' || lpad(nextval('public.revisiones_finales_folio_seq')::text, 6, '0');
    insert into public.revisiones_finales_calidad (planeacion_item_id, folio, aprobado, cantidad)
    values (p_item_id, v_folio, true, v_aprob)
    returning id into v_id;
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
    values (auth.uid(), 'revisiones_finales_calidad', v_id, 'revision_final_aprobada',
            jsonb_build_object('numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
                               'modelo', v_item.modelo, 'folio', v_folio, 'cantidad', v_aprob));
    revision_id := v_id; folio := v_folio; aprobado := true;
    return next;
  end if;

  if v_rech > 0 then
    v_folio := 'FIN-' || lpad(nextval('public.revisiones_finales_folio_seq')::text, 6, '0');
    insert into public.revisiones_finales_calidad (
      planeacion_item_id, folio, aprobado, cantidad, motivo, categoria, paso_retrabajo_id
    ) values (p_item_id, v_folio, false, v_rech, v_motivo, v_categoria, p_paso_id)
    returning id into v_id;
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
    values (auth.uid(), 'revisiones_finales_calidad', v_id, 'revision_final_rechazada',
            jsonb_build_object('numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
                               'modelo', v_item.modelo, 'folio', v_folio, 'cantidad', v_rech,
                               'motivo', v_motivo));
    revision_id := v_id; folio := v_folio; aprobado := false;
    return next;
  end if;
end;
$$;

revoke execute on function public.registrar_revision_final(uuid, numeric, numeric, text, text, uuid) from public, anon;
grant execute on function public.registrar_revision_final(uuid, numeric, numeric, text, text, uuid) to authenticated;

-- 5. Lo rechazado en la revisión final, para Producción ---------------------------------
create or replace view public.rechazos_revision_final
with (security_invoker = true) as
select
  r.id as revision_id,
  r.folio,
  r.elaborado_en,
  r.motivo,
  r.categoria,
  r.cantidad,
  r.planeacion_item_id,
  pv.pedido_id,
  p.numero_pedido,
  pi.item_code,
  pi.modelo,
  pi.descripcion,
  pi.unidad,
  s.id as paso_id,
  s.orden as paso_orden,
  s.proceso,
  s.retirado_en is not null as paso_retirado,
  coalesce(ra.reasignado, 0) as reasignado,
  r.cantidad - coalesce(ra.reasignado, 0) as por_reasignar,
  (pv.es_version_activa
    and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null
    and p.eliminado_definitivo_en is null
    and p.cancelado_en is null) as vigente
from public.revisiones_finales_calidad r
join public.planeacion_items pi on pi.id = r.planeacion_item_id
join public.pedido_versiones pv on pv.id = pi.pedido_version_id
join public.pedidos p on p.id = pv.pedido_id
join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
left join lateral (
  select sum(a.cantidad) as reasignado
  from public.asignaciones_produccion a
  where a.revision_final_rechazo_id = r.id and a.cancelada_en is null
) ra on true
where not r.aprobado;

-- 6. Reasignar lo rechazado en la revisión final ---------------------------------------
create or replace function public.crear_retrabajo_revision_final(
  p_revision_id uuid,
  p_equipo_id uuid,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null
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
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
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
  if v_encargado is not null and char_length(v_encargado) > 80 then
    raise exception 'El nombre del encargado es demasiado largo.';
  end if;

  -- Bloquea la revisión: dos reasignaciones a la vez no pasan juntas del rechazo.
  select r.aprobado, r.cantidad, r.folio, r.paso_retrabajo_id,
         s.proceso, s.retirado_en as paso_retirado_en,
         pi.id as item_id, pi.item_code, pi.modelo, pi.descripcion, pi.unidad,
         pi.estado_revision, pi.eliminacion_solicitada_en,
         p.id as pedido_id, p.numero_pedido, p.eliminado_en, p.cancelado_en
    into v_r
    from public.revisiones_finales_calidad r
    join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
    join public.planeacion_items pi on pi.id = r.planeacion_item_id
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where r.id = p_revision_id
    for update of r;
  if not found then
    raise exception 'La revisión final no existe o no tiene rechazo.';
  end if;
  if v_r.aprobado then
    raise exception 'La revisión % está aprobada; no hay nada que retrabajar.', v_r.folio;
  end if;
  if v_r.estado_revision = 'cancelado'
     or v_r.eliminacion_solicitada_en is not null
     or v_r.eliminado_en is not null
     or v_r.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado o eliminado.';
  end if;
  if v_r.paso_retirado_en is not null then
    raise exception 'El paso al que regresaba ya no está en la ruta del mueble.';
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
    where revision_final_rechazo_id = p_revision_id and cancelada_en is null;
  if v_reasignado + p_cantidad > v_r.cantidad then
    raise exception 'Del folio % solo quedan % pieza(s) por reasignar.', v_r.folio, v_r.cantidad - v_reasignado;
  end if;

  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado,
    paso_id, revision_final_rechazo_id
  ) values (
    v_r.item_id, v_r.pedido_id, v_r.numero_pedido, v_r.item_code, v_r.modelo, v_r.descripcion,
    v_r.unidad, p_equipo_id, v_r.proceso, p_cantidad, p_fecha_asignacion,
    nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_r.paso_retrabajo_id, p_revision_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_retrabajo_revision_final(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.crear_retrabajo_revision_final(uuid, uuid, numeric, date, text, text) to authenticated;

-- 7. El retrabajo de la revisión final no cuenta contra el tope del paso ------------------
-- Igual que en ruta_produccion; tope y "adelantada" también dejan fuera
-- revision_final_rechazo_id.
create or replace function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null,
  p_paso_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_equipo record;
  v_paso record;
  v_anterior uuid;
  v_asignado numeric;
  v_listo numeric;
  v_adelantada boolean := false;
  v_encargado text := nullif(btrim(coalesce(p_encargado, '')), '');
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede asignar.';
  end if;
  if p_proceso is null
     or p_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida') then
    raise exception 'Proceso no válido.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_asignacion is null then
    raise exception 'Falta la fecha de asignación.';
  end if;
  if v_encargado is not null and char_length(v_encargado) > 80 then
    raise exception 'El nombre del encargado es demasiado largo.';
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
  -- Solo se electrifica lo que la lleva (en el mueble o en sus componentes).
  if p_proceso = 'electrificacion'
     and not public.admite_electrificacion(v_item.id) then
    raise exception 'El ítem % no lleva electrificación ni iluminación; no se asigna a Electrificación.', v_item.item_code;
  end if;
  -- Superficie Sólida, igual: solo si el mueble o sus componentes la llevan.
  if p_proceso = 'superficie_solida'
     and not public.admite_superficie_solida(v_item.id) then
    raise exception 'El ítem % no lleva superficie sólida; no se asigna a Superficie Sólida.', v_item.item_code;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (p_proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, p_proceso;
  end if;

  -- El paso de la ruta (la sugerida si el mueble aún no tiene).
  perform public.asegurar_ruta_produccion(v_item.id);
  if p_paso_id is not null then
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.id = p_paso_id and s.planeacion_item_id = v_item.id and s.retirado_en is null;
    if not found then
      raise exception 'Ese paso ya no está en la ruta del ítem %; recarga la página.', v_item.item_code;
    end if;
    if v_paso.proceso <> p_proceso then
      raise exception 'El paso % de la ruta es de %, no de %.', v_paso.orden, v_paso.proceso, p_proceso;
    end if;
  else
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and coalesce((
          select sum(a.cantidad) from public.asignaciones_produccion a
          where a.paso_id = s.id and a.cancelada_en is null and a.informe_rechazo_id is null
            and a.revision_final_rechazo_id is null
        ), 0) < v_item.cantidad_total
      order by s.orden
      limit 1;
    if not found then
      if exists (
        select 1 from public.pasos_ruta_produccion s
        where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
      ) then
        raise exception 'Ya está asignado todo el ítem % en %.', v_item.item_code, p_proceso;
      end if;
      raise exception 'La ruta del ítem % no lleva %; agrégalo a la ruta primero.', v_item.item_code, p_proceso;
    end if;
  end if;

  -- Tope por paso. Los retrabajos no cuentan (de un lote o de la revisión final).
  select coalesce(sum(cantidad), 0) into v_asignado
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
      and revision_final_rechazo_id is null;

  if v_asignado + p_cantidad > v_item.cantidad_total then
    raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
      v_paso.orden, p_proceso, v_item.cantidad_total - v_asignado, v_item.cantidad_total, v_asignado;
  end if;

  -- ¿Se adelanta al paso anterior? Listo = lo que el paso anterior entregó y
  -- Producción verificó. No se bloquea: queda marcado.
  select s.id into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
    order by s.orden desc
    limit 1;
  if v_anterior is not null then
    select coalesce(sum(x.cantidad), 0) into v_listo
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior and a.cancelada_en is null and a.informe_rechazo_id is null
        and a.revision_final_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
    v_adelantada := v_asignado + p_cantidad > v_listo;
  end if;

  -- El nombre queda guardado en el equipo para elegirlo la próxima vez.
  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado,
    paso_id, adelantada
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- 8. Resumen de asignaciones: de qué revisión final viene un retrabajo ------------------
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
  ir.folio as folio_rechazo,
  fc.folios_cal,
  a.encargado,
  a.paso_id,
  a.adelantada,
  a.revision_final_rechazo_id,
  rf.folio as folio_revision_final
from public.asignaciones_produccion a
join public.equipos_produccion e on e.id = a.equipo_id
left join public.informes_calidad ir on ir.id = a.informe_rechazo_id
left join public.revisiones_finales_calidad rf on rf.id = a.revision_final_rechazo_id
left join lateral (
  select sum(x.cantidad) as entregado,
         max(x.fecha_entrega) as ultima_entrega,
         string_agg(x.folios_calidad, ', ' order by x.fecha_entrega, x.registrado_en) as folios_calidad,
         count(*) as num_entregas,
         sum(x.cantidad) filter (where x.verificada_en is not null) as verificado,
         max((x.verificada_en at time zone 'America/Mexico_City')::date) as ultima_verificacion
  from public.entregas_produccion x
  where x.asignacion_id = a.id and x.anulada_en is null and x.rechazada_en is null
) en on true
left join lateral (
  select string_agg(i.folio, ', ' order by i.elaborado_en) as folios_cal
  from public.entregas_produccion x2
  join public.informes_calidad i on i.entrega_id = x2.id
  where x2.asignacion_id = a.id
) fc on true;
