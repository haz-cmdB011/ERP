-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.partes_despiece
-- @verifica policy public.partes_despiece.select_partes_despiece
-- @verifica column public.asignaciones_produccion.parte_id
-- @verifica column public.asignaciones_produccion_resumen.parte_descripcion
-- @verifica column public.lotes_calidad.parte_descripcion
-- @verifica column public.rechazos_calidad.parte_descripcion
-- @verifica function public.cobertura_por_partes
-- @verifica function public.crear_asignaciones_por_partes
-- @verifica function-contiene public.crear_asignacion_produccion p_parte_id
-- @verifica function-contiene public.guardar_despiece_produccion ya está asignada
-- @verifica function-contiene public.paso_de_retrabajo parte_id
-- @verifica function-contiene public.piezas_listas_revision_final cobertura_por_partes
-- @verifica function-contiene public.verificado_produccion_variante cobertura_por_partes
-- @verifica function-contiene public.aprobado_calidad_variante cobertura_por_partes

-- ============================================================================
-- Producción — despiece por partes (fase 1).
--
-- Un mueble se puede asignar por PARTES de su despiece: cada línea del despiece
-- es una parte con id fijo (partes_despiece) y una asignación puede ser de una
-- parte (parte_id) o del mueble completo (parte_id null, como hasta ahora).
--
--   * La cantidad de una asignación sigue siendo en MUEBLES: "la base de metal
--     para 7 muebles" = 7 × piezas por mueble de esa parte. Así el tope por paso
--     sigue siendo la cantidad del mueble, ahora por parte: lo del mueble completo
--     cuenta para todas sus partes, y cada parte no pasa de la cantidad del mueble.
--   * Las partes siguen la ruta del mueble (la ruta propia por parte es la fase 2).
--   * Un paso avanza lo de la parte más atrasada: cobertura = lo del mueble
--     completo + el mínimo, entre las partes vigentes, de lo de cada parte
--     (cobertura_por_partes). Con eso cuentan la revisión final (listas en el
--     último paso) y el cobro (verificado y aprobado por variante): un mueble
--     cuenta como hecho cuando todas sus partes lo están. El cobro por parte es la
--     fase 3, cuando cambie el pago del maquilador.
--   * Bloqueo del despiece: una parte con asignaciones vigentes no se quita y su
--     cantidad por mueble no baja. Agregar partes o subir cantidades sí se puede.
--     Las partes que salen sin asignaciones quedan retiradas (no se borran).
--   * El retrabajo de un lote rechazado hereda la parte (trg_paso_de_retrabajo).
-- ============================================================================

-- 1. Partes -------------------------------------------------------------------------
create table public.partes_despiece (
  id uuid primary key default gen_random_uuid(),
  despiece_id uuid not null references public.despieces_produccion(id) on delete cascade,
  -- El mueble (ítem padre), para leer sus partes sin pasar por el despiece.
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  orden integer not null,
  descripcion text not null,
  material text,
  unidad text,
  piezas_por_mueble numeric not null,
  -- Componente del PM de donde salió la parte (null si la agregó el trabajador).
  hijo_id uuid references public.planeacion_items(id) on delete set null,
  creado_en timestamptz not null default now(),
  -- La línea salió del despiece (sin asignaciones vigentes): se conserva por las
  -- asignaciones canceladas que la nombran.
  retirada_en timestamptz,
  constraint partes_despiece_piezas_check check (piezas_por_mueble > 0)
);
create index idx_partes_despiece_item on public.partes_despiece (planeacion_item_id) where retirada_en is null;
create index idx_partes_despiece_despiece on public.partes_despiece (despiece_id);
create index idx_partes_despiece_hijo on public.partes_despiece (hijo_id);

alter table public.partes_despiece enable row level security;
-- Lo ve el personal interno, igual que el despiece. Sin políticas de escritura:
-- solo entra por guardar_despiece_produccion.
create policy "select_partes_despiece" on public.partes_despiece
  for select to authenticated using ((select public.is_staff()));

-- Las líneas de los despieces ya guardados pasan a ser partes, y cada línea lleva
-- el id de su parte.
with lineas as (
  select d.id as despiece_id, d.planeacion_item_id, x.linea, x.n
  from public.despieces_produccion d
  cross join lateral jsonb_array_elements(d.lineas) with ordinality as x(linea, n)
), nuevas as (
  insert into public.partes_despiece (
    despiece_id, planeacion_item_id, orden, descripcion, material, unidad, piezas_por_mueble, hijo_id
  )
  select l.despiece_id, l.planeacion_item_id, l.n, l.linea->>'descripcion',
    nullif(l.linea->>'material', ''), nullif(l.linea->>'unidad', ''),
    (l.linea->>'piezas_por_mueble')::numeric,
    (select h.id from public.planeacion_items h where h.id::text = nullif(l.linea->>'hijo_id', ''))
  from lineas l
  returning id, despiece_id, orden
)
update public.despieces_produccion d
  set lineas = (
    select jsonb_agg(x.linea || jsonb_build_object('id', p.id) order by x.n)
    from jsonb_array_elements(d.lineas) with ordinality as x(linea, n)
    join nuevas p on p.despiece_id = d.id and p.orden = x.n
  )
  where exists (select 1 from nuevas p where p.despiece_id = d.id);

-- 2. Asignación de una parte -------------------------------------------------------
alter table public.asignaciones_produccion
  add column parte_id uuid references public.partes_despiece(id) on delete set null;
create index idx_asignaciones_produccion_parte on public.asignaciones_produccion (parte_id);

-- 3. Cobertura: lo del mueble completo + la parte más atrasada ---------------------------
-- p_mueble: lo del mueble completo (cuenta para todas sus partes); p_por_parte:
-- {"<parte_id>": cantidad}. Sin partes vigentes, solo cuenta lo del mueble.
create or replace function public.cobertura_por_partes(p_item_id uuid, p_mueble numeric, p_por_parte jsonb)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_mueble, 0) + coalesce((
    select min(coalesce((p_por_parte ->> pd.id::text)::numeric, 0))
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
  ), 0);
$$;

revoke execute on function public.cobertura_por_partes(uuid, numeric, jsonb) from public, anon;
grant execute on function public.cobertura_por_partes(uuid, numeric, jsonb) to authenticated;

-- 4. Asignar (un paso; el mueble completo o una parte) -----------------------------------
-- La firma cambia (p_parte_id): se quita la anterior para que no queden dos.
drop function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text, uuid);

create function public.crear_asignacion_produccion(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text default null,
  p_paso_id uuid default null,
  p_parte_id uuid default null
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
  v_parte record;
  v_anterior uuid;
  v_asignado numeric;
  v_asignado_parte numeric := 0;
  v_max_parte numeric;
  v_listo_mueble numeric;
  v_listo_partes jsonb;
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

  -- La parte, si se asigna una: vigente y de este mueble.
  if p_parte_id is not null then
    select pd.id, pd.descripcion into v_parte
      from public.partes_despiece pd
      where pd.id = p_parte_id and pd.planeacion_item_id = v_item.id and pd.retirada_en is null;
    if not found then
      raise exception 'Esa parte ya no está en el despiece del ítem %; recarga la página.', v_item.item_code;
    end if;
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
    -- El primer paso de ese proceso donde todavía cabe: lo del mueble completo más,
    -- para esta parte, lo suyo (o, el mueble completo, la parte que más lleva).
    select s.id, s.orden, s.proceso into v_paso
      from public.pasos_ruta_produccion s
      where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.proceso = p_proceso
        and coalesce((
          select sum(a.cantidad) from public.asignaciones_produccion a
          where a.paso_id = s.id and a.cancelada_en is null and a.informe_rechazo_id is null
            and a.revision_final_rechazo_id is null
            and (a.parte_id is null or a.parte_id = p_parte_id)
        ), 0) + case when p_parte_id is null then coalesce((
          select max(t.n) from (
            select sum(a.cantidad) as n from public.asignaciones_produccion a
            where a.paso_id = s.id and a.cancelada_en is null and a.informe_rechazo_id is null
              and a.revision_final_rechazo_id is null and a.parte_id is not null
            group by a.parte_id
          ) t
        ), 0) else 0 end < v_item.cantidad_total
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

  -- Tope por paso, en muebles. Los retrabajos no cuentan (de un lote o de la
  -- revisión final). Lo del mueble completo cuenta para todas sus partes.
  select coalesce(sum(cantidad) filter (where parte_id is null), 0),
         coalesce(sum(cantidad) filter (where parte_id = p_parte_id), 0)
    into v_asignado, v_asignado_parte
    from public.asignaciones_produccion
    where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
      and revision_final_rechazo_id is null;

  if p_parte_id is null then
    select coalesce(max(t.n), 0) into v_max_parte
      from (
        select sum(cantidad) as n from public.asignaciones_produccion
        where paso_id = v_paso.id and cancelada_en is null and informe_rechazo_id is null
          and revision_final_rechazo_id is null and parte_id is not null
        group by parte_id
      ) t;
    if v_asignado + v_max_parte + p_cantidad > v_item.cantidad_total then
      raise exception 'En el paso % (%) solo quedan % por asignar de % (ya asignadas: %).',
        v_paso.orden, p_proceso, v_item.cantidad_total - v_asignado - v_max_parte, v_item.cantidad_total,
        v_asignado + v_max_parte;
    end if;
  elsif v_asignado + v_asignado_parte + p_cantidad > v_item.cantidad_total then
    raise exception 'En el paso % (%), "%" solo tiene % mueble(s) por asignar de % (ya asignados: %).',
      v_paso.orden, p_proceso, v_parte.descripcion, v_item.cantidad_total - v_asignado - v_asignado_parte,
      v_item.cantidad_total, v_asignado + v_asignado_parte;
  end if;

  -- ¿Se adelanta al paso anterior? Listo = lo que el paso anterior entregó y
  -- Producción verificó: para una parte, lo del mueble completo más lo suyo; para
  -- el mueble completo, lo de su parte más atrasada. No se bloquea: queda marcado.
  select s.id into v_anterior
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = v_item.id and s.retirado_en is null and s.orden < v_paso.orden
    order by s.orden desc
    limit 1;
  if v_anterior is not null then
    select coalesce(sum(x.cantidad) filter (where a.parte_id is null), 0)
      into v_listo_mueble
      from public.entregas_produccion x
      join public.asignaciones_produccion a on a.id = x.asignacion_id
      where a.paso_id = v_anterior and a.cancelada_en is null and a.informe_rechazo_id is null
        and a.revision_final_rechazo_id is null
        and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null;
    select coalesce(jsonb_object_agg(t.parte_id, t.n), '{}'::jsonb)
      into v_listo_partes
      from (
        select a.parte_id, sum(x.cantidad) as n
        from public.entregas_produccion x
        join public.asignaciones_produccion a on a.id = x.asignacion_id
        where a.paso_id = v_anterior and a.cancelada_en is null and a.informe_rechazo_id is null
          and a.revision_final_rechazo_id is null and a.parte_id is not null
          and x.anulada_en is null and x.rechazada_en is null and x.verificada_en is not null
        group by a.parte_id
      ) t;
    if p_parte_id is null then
      v_listo := public.cobertura_por_partes(v_item.id, v_listo_mueble, v_listo_partes);
    else
      v_listo := v_listo_mueble + coalesce((v_listo_partes ->> p_parte_id::text)::numeric, 0);
    end if;
    v_adelantada := v_asignado + v_asignado_parte + p_cantidad > v_listo;
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
    paso_id, adelantada, parte_id
  ) values (
    v_item.id, v_item.pedido_id, v_item.numero_pedido, v_item.item_code, v_item.modelo,
    v_item.descripcion, v_item.unidad, p_equipo_id, p_proceso, p_cantidad,
    p_fecha_asignacion, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_paso.id, v_adelantada, p_parte_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text, uuid, uuid)
  from public, anon;
grant execute on function public.crear_asignacion_produccion(uuid, uuid, text, numeric, date, text, text, uuid, uuid)
  to authenticated;

-- Varias partes al mismo equipo y paso, todo o nada (una asignación por parte).
create or replace function public.crear_asignaciones_por_partes(
  p_item_id uuid,
  p_equipo_id uuid,
  p_proceso text,
  p_cantidad numeric,
  p_fecha_asignacion date,
  p_notas text,
  p_encargado text,
  p_paso_id uuid,
  p_partes uuid[]
)
returns uuid[]
language plpgsql
set search_path = ''
as $$
declare
  v_parte uuid;
  v_ids uuid[] := '{}';
begin
  if p_partes is null or cardinality(p_partes) = 0 then
    raise exception 'Elige al menos una parte del despiece.';
  end if;
  if cardinality(p_partes) > 200 then
    raise exception 'Son demasiadas partes en una sola asignación.';
  end if;
  if (select count(distinct x) from unnest(p_partes) as x) <> cardinality(p_partes) then
    raise exception 'Una parte se repite en la misma asignación.';
  end if;
  foreach v_parte in array p_partes loop
    v_ids := v_ids || public.crear_asignacion_produccion(
      p_item_id, p_equipo_id, p_proceso, p_cantidad, p_fecha_asignacion, p_notas,
      p_encargado, p_paso_id, v_parte
    );
  end loop;
  return v_ids;
end;
$$;

revoke execute on function public.crear_asignaciones_por_partes(uuid, uuid, text, numeric, date, text, text, uuid, uuid[])
  from public, anon;
grant execute on function public.crear_asignaciones_por_partes(uuid, uuid, text, numeric, date, text, text, uuid, uuid[])
  to authenticated;

-- 5. El retrabajo de un lote hereda su parte ---------------------------------------------
create or replace function public.paso_de_retrabajo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paso uuid;
  v_revision uuid;
  v_parte uuid;
begin
  if new.informe_rechazo_id is not null
     and (new.paso_id is null or new.revision_final_rechazo_id is null or new.parte_id is null) then
    select a.paso_id, a.revision_final_rechazo_id, a.parte_id into v_paso, v_revision, v_parte
      from public.informes_calidad i
      join public.entregas_produccion e on e.id = i.entrega_id
      join public.asignaciones_produccion a on a.id = e.asignacion_id
      where i.id = new.informe_rechazo_id;
    new.paso_id := coalesce(new.paso_id, v_paso);
    new.revision_final_rechazo_id := coalesce(new.revision_final_rechazo_id, v_revision);
    new.parte_id := coalesce(new.parte_id, v_parte);
  end if;
  return new;
end;
$$;

-- 6. Revisión final: listas = lo de la parte más atrasada en el último paso -------------
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
  ),
  -- Todo lo que verificó Producción en el último paso, venga de donde venga,
  -- menos lo que Calidad rechazó en esos lotes (va a retrabajo y vuelve a
  -- contar cuando se entregue otra vez). Por partes, cuenta la más atrasada.
  l as (
    select a.parte_id, l.cantidad - l.rechazadas as n
    from public.lotes_calidad l
    join public.asignaciones_produccion a on a.id = l.asignacion_id
    where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente
      and a.paso_id = (select id from ultimo)
  )
  select public.cobertura_por_partes(
    p_item_id,
    (select coalesce(sum(n), 0) from l where parte_id is null),
    (select coalesce(jsonb_object_agg(t.parte_id, t.n), '{}'::jsonb)
     from (select parte_id, sum(n) as n from l where parte_id is not null group by parte_id) t)
  );
$$;

-- 7. Cobro: lo verificado y lo aprobado cuentan por paso, con la parte más atrasada -----
create or replace function public.verificado_produccion_variante(p_ot text default null)
returns table (ot text, clave text, vclave text, componente boolean, verificado_acabados numeric, verificado_armado numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with padres as (
    select pi.id, pi.cantidad_total,
      public.ot_clave(p.numero_pedido) as ot,
      public.norm_modelo(pi.modelo) as clave,
      public.norm_descripcion(pi.descripcion) as vclave,
      (pi.estado_revision is not distinct from 'cancelado' or pi.eliminacion_solicitada_en is not null) as fuera,
      l.acabados,
      l.armado
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    -- Entregas verificadas (lotes_calidad = verificadas, sin anular ni rechazar)
    -- de equipos que no son de planta. Sin retrabajos. Por paso: lo del mueble
    -- completo más su parte más atrasada (un mueble cuenta cuando todas sus partes).
    cross join lateral (
      select coalesce(sum(pp.n) filter (where pp.proceso = 'barniz'), 0) as acabados,
             coalesce(sum(pp.n) filter (where pp.proceso = 'armado'), 0) as armado
      from (
        select x.proceso,
          public.cobertura_por_partes(pi.id,
            coalesce(sum(x.n) filter (where x.parte_id is null), 0),
            coalesce(jsonb_object_agg(x.parte_id, x.n) filter (where x.parte_id is not null), '{}'::jsonb)) as n
        from (
          select la.paso_id, lc.proceso, la.parte_id, sum(lc.cantidad) as n
          from public.lotes_calidad lc
          join public.equipos_produccion q on q.id = lc.equipo_id
          join public.asignaciones_produccion la on la.id = lc.asignacion_id
          where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
            and la.informe_rechazo_id is null and la.revision_final_rechazo_id is null
          group by la.paso_id, lc.proceso, la.parte_id
        ) x
        group by x.paso_id, x.proceso
      ) pp
    ) l
    where pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.planeacion_item_id = pi.id and a.cancelada_en is null
      )
      and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  )
  select x.ot, x.clave, x.vclave, false, sum(x.acabados), sum(x.armado)
  from padres x
  group by 1, 2, 3
  union all
  -- Componentes: la proporción de su mueble que Producción ya verificó (una vez).
  select x.ot, public.norm_modelo(h.modelo), public.norm_descripcion(h.descripcion), true,
    sum(floor(h.cantidad_total * least(x.acabados, x.cantidad_total) / x.cantidad_total)),
    sum(floor(h.cantidad_total * least(x.armado, x.cantidad_total) / x.cantidad_total))
  from public.planeacion_items h
  join padres x on x.id = h.parent_item_id and not x.fuera and x.cantidad_total > 0
  where h.tipo_registro = 'FU'
    and (h.estado_revision is null or h.estado_revision <> 'cancelado')
    and h.eliminacion_solicitada_en is null
  group by 1, 2, 3;
$$;

create or replace function public.aprobado_calidad_variante(p_ot text default null)
returns table (ot text, clave text, vclave text, componente boolean, aprobado_acabados numeric, aprobado_armado numeric)
language sql
stable
security definer
set search_path = ''
as $$
  -- Muebles padre asignados a algún equipo: piezas aprobadas por Calidad en lotes
  -- de equipos que no son de planta (la planta no cobra recibo). El barniz se
  -- cobra como Acabados. Lo que regresó la revisión final ya se aprobó una vez:
  -- sus lotes no cuentan. Por paso: lo del mueble completo más su parte más
  -- atrasada.
  select public.ot_clave(p.numero_pedido), public.norm_modelo(pi.modelo),
    public.norm_descripcion(pi.descripcion), false,
    coalesce(sum(l.acabados), 0),
    coalesce(sum(l.armado), 0)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  cross join lateral (
    select coalesce(sum(pp.n) filter (where pp.proceso = 'barniz'), 0) as acabados,
           coalesce(sum(pp.n) filter (where pp.proceso = 'armado'), 0) as armado
    from (
      select x.proceso,
        public.cobertura_por_partes(pi.id,
          coalesce(sum(x.n) filter (where x.parte_id is null), 0),
          coalesce(jsonb_object_agg(x.parte_id, x.n) filter (where x.parte_id is not null), '{}'::jsonb)) as n
      from (
        select la.paso_id, lc.proceso, la.parte_id, sum(lc.aprobadas) as n
        from public.lotes_calidad lc
        join public.equipos_produccion q on q.id = lc.equipo_id
        join public.asignaciones_produccion la on la.id = lc.asignacion_id
        where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
          and la.revision_final_rechazo_id is null
        group by la.paso_id, lc.proceso, la.parte_id
      ) x
      group by x.paso_id, x.proceso
    ) pp
  ) l
  where pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and exists (
      select 1 from public.asignaciones_produccion a
      where a.planeacion_item_id = pi.id and a.cancelada_en is null
    )
    and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  group by 1, 2, 3
  union all
  -- Componentes (hijos) de un mueble asignado: Calidad los aprueba enteros; vale
  -- su último informe.
  select public.ot_clave(p.numero_pedido), public.norm_modelo(pi.modelo),
    public.norm_descripcion(pi.descripcion), true,
    coalesce(sum(pi.cantidad_total) filter (where u.aprobado), 0),
    coalesce(sum(pi.cantidad_total) filter (where u.aprobado), 0)
  from public.planeacion_items pi
  join public.planeacion_items pa on pa.id = pi.parent_item_id
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  left join lateral (
    select ic.aprobado
    from public.informes_calidad ic
    where ic.planeacion_item_id = pi.id
    order by ic.elaborado_en desc, ic.id desc
    limit 1
  ) u on true
  where pi.tipo_registro = 'FU' and pi.parent_item_id is not null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and (pa.estado_revision is null or pa.estado_revision <> 'cancelado')
    and pa.eliminacion_solicitada_en is null
    and exists (
      select 1 from public.asignaciones_produccion a
      where a.planeacion_item_id = pa.id and a.cancelada_en is null
    )
    and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  group by 1, 2, 3;
$$;

-- 8. Las vistas dicen de qué parte es cada asignación, lote y rechazo ------------------
-- (Mismas definiciones, con las columnas de la parte al final.)
create or replace view public.asignaciones_produccion_resumen
with (security_invoker = true) as
 SELECT a.id,
    a.planeacion_item_id,
    a.pedido_id,
    a.numero_pedido,
    a.item_code,
    a.modelo,
    a.descripcion,
    a.unidad,
    a.equipo_id,
    e.nombre AS equipo,
    e.encargado AS equipo_encargado,
    e.es_planta,
    a.proceso,
    a.cantidad,
    a.fecha_asignacion,
    a.notas,
    a.creado_en,
    a.cancelada_en,
    a.motivo_cancelacion,
    COALESCE(en.entregado, 0::numeric) AS entregado,
    en.ultima_entrega,
    en.folios_calidad,
    COALESCE(en.num_entregas, 0::bigint) AS num_entregas,
        CASE
            WHEN a.cancelada_en IS NOT NULL THEN 'cancelada'::text
            WHEN COALESCE(en.entregado, 0::numeric) >= a.cantidad THEN 'entregada'::text
            WHEN COALESCE(en.entregado, 0::numeric) > 0::numeric THEN 'parcial'::text
            ELSE 'en_proceso'::text
        END AS estado,
    COALESCE(en.verificado, 0::numeric) AS verificado,
    COALESCE(en.entregado, 0::numeric) - COALESCE(en.verificado, 0::numeric) AS por_verificar,
    en.ultima_verificacion,
    a.informe_rechazo_id,
    ir.folio AS folio_rechazo,
    fc.folios_cal,
    a.encargado,
    a.paso_id,
    a.adelantada,
    a.revision_final_rechazo_id,
    rf.folio AS folio_revision_final,
    COALESCE(rz.por_reasignar, 0::numeric) AS rechazado_por_reasignar,
    vp.vez AS vez_paso,
    vp.veces AS veces_proceso,
    a.parte_id,
    pd.descripcion AS parte_descripcion,
    pd.piezas_por_mueble AS parte_piezas_por_mueble,
    pd.unidad AS parte_unidad
   FROM asignaciones_produccion a
     JOIN equipos_produccion e ON e.id = a.equipo_id
     LEFT JOIN informes_calidad ir ON ir.id = a.informe_rechazo_id
     LEFT JOIN revisiones_finales_calidad rf ON rf.id = a.revision_final_rechazo_id
     LEFT JOIN partes_despiece pd ON pd.id = a.parte_id
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS entregado,
            max(x.fecha_entrega) AS ultima_entrega,
            string_agg(x.folios_calidad, ', '::text ORDER BY x.fecha_entrega, x.registrado_en) AS folios_calidad,
            count(*) AS num_entregas,
            sum(x.cantidad) FILTER (WHERE x.verificada_en IS NOT NULL) AS verificado,
            max((x.verificada_en AT TIME ZONE 'America/Mexico_City'::text)::date) AS ultima_verificacion
           FROM entregas_produccion x
          WHERE x.asignacion_id = a.id AND x.anulada_en IS NULL AND x.rechazada_en IS NULL) en ON true
     LEFT JOIN LATERAL ( SELECT string_agg(i.folio, ', '::text ORDER BY i.elaborado_en) AS folios_cal
           FROM entregas_produccion x2
             JOIN informes_calidad i ON i.entrega_id = x2.id
          WHERE x2.asignacion_id = a.id) fc ON true
     LEFT JOIN LATERAL ( SELECT sum(GREATEST(0::numeric, i.cantidad - COALESCE(( SELECT sum(t.cantidad) AS sum
                   FROM asignaciones_produccion t
                  WHERE t.informe_rechazo_id = i.id AND t.cancelada_en IS NULL), 0::numeric))) AS por_reasignar
           FROM entregas_produccion x3
             JOIN informes_calidad i ON i.entrega_id = x3.id AND NOT i.aprobado
          WHERE x3.asignacion_id = a.id) rz ON true
     LEFT JOIN LATERAL ( SELECT NULLIF(count(*) FILTER (WHERE s2.orden <= s.orden), 0)::integer AS vez,
            NULLIF(count(*), 0)::integer AS veces
           FROM pasos_ruta_produccion s
             JOIN pasos_ruta_produccion s2 ON s2.planeacion_item_id = s.planeacion_item_id AND s2.proceso = s.proceso AND s2.retirado_en IS NULL
          WHERE s.id = a.paso_id) vp ON true;

create or replace view public.lotes_calidad
with (security_invoker = true) as
 SELECT e.id AS entrega_id,
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
    q.nombre AS equipo,
    a.informe_rechazo_id,
    ir.folio AS folio_rechazo,
    e.fecha_entrega,
    e.verificada_en,
    e.cantidad,
    COALESCE(ev.aprobadas, 0::numeric) AS aprobadas,
    COALESCE(ev.rechazadas, 0::numeric) AS rechazadas,
    e.cantidad - COALESCE(ev.aprobadas, 0::numeric) - COALESCE(ev.rechazadas, 0::numeric) AS pendiente,
    COALESCE(pi.id IS NOT NULL AND pi.estado_revision IS DISTINCT FROM 'cancelado'::text AND pi.eliminacion_solicitada_en IS NULL AND p.eliminado_en IS NULL AND p.eliminado_definitivo_en IS NULL AND p.cancelado_en IS NULL, false) AS vigente,
    e.folios_calidad AS folio_hoja,
    vp.vez AS vez_paso,
    vp.veces AS veces_proceso,
    a.parte_id,
    pd.descripcion AS parte_descripcion,
    pd.piezas_por_mueble AS parte_piezas_por_mueble
   FROM entregas_produccion e
     JOIN asignaciones_produccion a ON a.id = e.asignacion_id
     JOIN equipos_produccion q ON q.id = a.equipo_id
     LEFT JOIN informes_calidad ir ON ir.id = a.informe_rechazo_id
     LEFT JOIN planeacion_items pi ON pi.id = a.planeacion_item_id
     LEFT JOIN pedido_versiones pv ON pv.id = pi.pedido_version_id
     LEFT JOIN pedidos p ON p.id = pv.pedido_id
     LEFT JOIN partes_despiece pd ON pd.id = a.parte_id
     LEFT JOIN LATERAL ( SELECT sum(i.cantidad) FILTER (WHERE i.aprobado) AS aprobadas,
            sum(i.cantidad) FILTER (WHERE NOT i.aprobado) AS rechazadas
           FROM informes_calidad i
          WHERE i.entrega_id = e.id) ev ON true
     LEFT JOIN LATERAL ( SELECT NULLIF(count(*) FILTER (WHERE s2.orden <= s.orden), 0)::integer AS vez,
            NULLIF(count(*), 0)::integer AS veces
           FROM pasos_ruta_produccion s
             JOIN pasos_ruta_produccion s2 ON s2.planeacion_item_id = s.planeacion_item_id AND s2.proceso = s.proceso AND s2.retirado_en IS NULL
          WHERE s.id = a.paso_id) vp ON true
  WHERE e.verificada_en IS NOT NULL AND e.anulada_en IS NULL AND e.rechazada_en IS NULL AND a.cancelada_en IS NULL;

create or replace view public.rechazos_calidad
with (security_invoker = true) as
 SELECT i.id AS informe_id,
    i.folio,
    i.elaborado_en,
    i.descripcion AS motivo,
    i.categoria,
    i.cantidad,
    i.entrega_id,
    e.fecha_entrega,
    a.id AS asignacion_id,
    a.planeacion_item_id,
    a.pedido_id,
    a.numero_pedido,
    a.item_code,
    a.modelo,
    a.descripcion,
    a.unidad,
    a.proceso,
    a.equipo_id,
    q.nombre AS equipo,
    COALESCE(r.reasignado, 0::numeric) AS reasignado,
    i.cantidad - COALESCE(r.reasignado, 0::numeric) AS por_reasignar,
    COALESCE(pi.id IS NOT NULL AND pi.estado_revision IS DISTINCT FROM 'cancelado'::text AND pi.eliminacion_solicitada_en IS NULL AND p.eliminado_en IS NULL AND p.eliminado_definitivo_en IS NULL AND p.cancelado_en IS NULL, false) AS vigente,
    a.parte_id,
    pd.descripcion AS parte_descripcion
   FROM informes_calidad i
     JOIN entregas_produccion e ON e.id = i.entrega_id
     JOIN asignaciones_produccion a ON a.id = e.asignacion_id
     JOIN equipos_produccion q ON q.id = a.equipo_id
     LEFT JOIN planeacion_items pi ON pi.id = a.planeacion_item_id
     LEFT JOIN pedido_versiones pv ON pv.id = pi.pedido_version_id
     LEFT JOIN pedidos p ON p.id = pv.pedido_id
     LEFT JOIN partes_despiece pd ON pd.id = a.parte_id
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS reasignado
           FROM asignaciones_produccion x
          WHERE x.informe_rechazo_id = i.id AND x.cancelada_en IS NULL) r ON true
  WHERE NOT i.aprobado;

-- 9. Guardar el despiece: cada línea es una parte con id fijo, con bloqueo ----------------
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
  v_parte_id uuid;
  v_parte record;
  v_ids uuid[] := '{}';
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

    -- La parte de la línea: la que trae (si es una parte vigente de este mueble); si
    -- no trae, la vigente que salió del mismo componente del PM (al volver a la
    -- sugerencia se conserva); si no, una parte nueva.
    v_parte_id := null;
    if nullif(v_linea->>'id', '') is not null
       and (v_linea->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select pd.id into v_parte_id
        from public.partes_despiece pd
        where pd.id = (v_linea->>'id')::uuid and pd.planeacion_item_id = p_item_id and pd.retirada_en is null;
    end if;
    if v_parte_id is null and v_hijo is not null then
      select pd.id into v_parte_id
        from public.partes_despiece pd
        where pd.planeacion_item_id = p_item_id and pd.retirada_en is null and pd.hijo_id = v_hijo
          and not (pd.id = any (v_ids))
          -- No la que otra línea trae por su id (se desvinculó de este componente).
          and not exists (
            select 1 from jsonb_array_elements(p_lineas) as o(linea)
            where o.linea->>'id' = pd.id::text
          )
        order by pd.orden
        limit 1;
    end if;
    if v_parte_id is not null and v_parte_id = any (v_ids) then
      raise exception 'Línea %: esa parte se repite en otra línea.', v_n;
    end if;
    -- Bloqueo: una parte ya asignada no baja su cantidad por mueble.
    if v_parte_id is not null then
      select pd.descripcion, pd.piezas_por_mueble into v_parte
        from public.partes_despiece pd where pd.id = v_parte_id;
      if v_piezas < v_parte.piezas_por_mueble and exists (
        select 1 from public.asignaciones_produccion a
        where a.parte_id = v_parte_id and a.cancelada_en is null
      ) then
        raise exception 'Línea %: "%" ya está asignada a un equipo; su cantidad por mueble no puede bajar de %.',
          v_n, v_parte.descripcion, v_parte.piezas_por_mueble;
      end if;
    end if;
    v_parte_id := coalesce(v_parte_id, gen_random_uuid());
    v_ids := v_ids || v_parte_id;

    v_limpias := v_limpias || jsonb_build_array(jsonb_build_object(
      'id', v_parte_id,
      'descripcion', v_descripcion,
      'material', v_material,
      'unidad', v_unidad,
      'piezas_por_mueble', v_piezas,
      'hijo_id', v_hijo
    ));
  end loop;

  -- Bloqueo: una parte ya asignada no sale del despiece.
  select pd.descripcion into v_parte
    from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null and not (pd.id = any (v_ids))
      and exists (
        select 1 from public.asignaciones_produccion a
        where a.parte_id = pd.id and a.cancelada_en is null
      )
    order by pd.orden
    limit 1;
  if found then
    raise exception '"%" ya está asignada a un equipo: no se puede quitar del despiece (cancela antes sus asignaciones).',
      v_parte.descripcion;
  end if;

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

  -- Las partes: las de las líneas se crean o se actualizan; las que salieron (sin
  -- asignaciones vigentes, ya revisado arriba) quedan retiradas.
  insert into public.partes_despiece (
    id, despiece_id, planeacion_item_id, orden, descripcion, material, unidad, piezas_por_mueble, hijo_id
  )
  select (x->>'id')::uuid, v_id, p_item_id, t.n::integer, x->>'descripcion', x->>'material', x->>'unidad',
    (x->>'piezas_por_mueble')::numeric, nullif(x->>'hijo_id', '')::uuid
  from jsonb_array_elements(v_limpias) with ordinality as t(x, n)
  on conflict (id) do update
    set orden = excluded.orden,
        descripcion = excluded.descripcion,
        material = excluded.material,
        unidad = excluded.unidad,
        piezas_por_mueble = excluded.piezas_por_mueble,
        hijo_id = excluded.hijo_id;
  update public.partes_despiece
    set retirada_en = now()
    where planeacion_item_id = p_item_id and retirada_en is null and not (id = any (v_ids));

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
