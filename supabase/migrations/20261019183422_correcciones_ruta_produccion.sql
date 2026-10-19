-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.asignaciones_produccion_resumen.rechazado_por_reasignar
-- @verifica column public.asignaciones_produccion_resumen.vez_paso
-- @verifica column public.lotes_calidad.vez_paso
-- @verifica column public.rechazos_revision_final.siguiente_paso_id
-- @verifica function public.siguiente_paso_revision_final
-- @verifica function-contiene public.paso_de_retrabajo revision_final_rechazo_id
-- @verifica function-contiene public.aprobado_calidad_variante revision_final_rechazo_id is null
-- @verifica function-contiene public.guardar_ruta_produccion revisiones_finales_calidad
-- @verifica function-contiene public.crear_retrabajo_revision_final siguiente_paso_revision_final
-- @verifica function-contiene public.piezas_listas_revision_final venga de donde venga

-- ============================================================================
-- Correcciones a la ruta de Producción y a la revisión final (19 oct 2026).
--
--   1. El resumen de asignaciones dice cuántas piezas rechazó Calidad en sus
--      lotes y siguen sin reasignar (rechazado_por_reasignar): con eso un paso
--      no se marca terminado mientras haya rechazos pendientes.
--   3. Cuando la ruta repite un proceso, el resumen de asignaciones y los lotes
--      de Calidad dicen qué vez es (vez_paso de veces_proceso: Armado 2 de 2).
--   4. "Calidad aprobó" de Estimaciones no cuenta lo retrabajado por la
--      revisión final: esas piezas ya se aprobaron (y cobraron) una vez.
--   5. Lo que la revisión final regresa a un paso sigue el RESTO de la ruta
--      desde ahí: Producción lo reasigna paso por paso (siguiente_paso_revision_final)
--      y solo vuelve a la revisión final cuando Calidad lo aprueba en el último.
--   6. No se puede quitar de la ruta un paso al que la revisión final regresó
--      piezas que faltan por reasignar.
--   7. El retrabajo de un lote que salió de un retrabajo de la revisión final
--      conserva su vínculo con la revisión final.
--
-- La revisión final sigue APAGADA (ajuste revision_final); hoy no hay
-- revisiones registradas, así que no hay datos que corregir.
-- ============================================================================

-- 7. El retrabajo de un lote hereda el paso y la revisión final -----------------
create or replace function public.paso_de_retrabajo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paso uuid;
  v_revision uuid;
begin
  if new.informe_rechazo_id is not null and (new.paso_id is null or new.revision_final_rechazo_id is null) then
    select a.paso_id, a.revision_final_rechazo_id into v_paso, v_revision
      from public.informes_calidad i
      join public.entregas_produccion e on e.id = i.entrega_id
      join public.asignaciones_produccion a on a.id = e.asignacion_id
      where i.id = new.informe_rechazo_id;
    new.paso_id := coalesce(new.paso_id, v_paso);
    new.revision_final_rechazo_id := coalesce(new.revision_final_rechazo_id, v_revision);
  end if;
  return new;
end;
$$;

revoke execute on function public.paso_de_retrabajo() from public, anon, authenticated;

-- 5. A qué paso va lo que regresó la revisión final ------------------------------
-- Desde el paso que eligió Calidad hasta el último de la ruta, el primero donde
-- todavía no se reasigna todo. listo = lo que ese mismo retrabajo ya entregó y
-- Producción verificó en el paso anterior (todo, en el paso que eligió Calidad).
-- Sin filas si ya se reasignó todo o el paso que eligió Calidad se quitó.
-- Los retrabajos de lotes (informe_rechazo_id) rehacen las mismas piezas: no cuentan.
create or replace function public.siguiente_paso_revision_final(p_revision_id uuid)
returns table (paso_id uuid, orden integer, proceso text, reasignado numeric, listo numeric)
language sql
stable
set search_path = ''
as $$
  with r as (
    select x.id, x.cantidad, x.planeacion_item_id, s.orden as desde
    from public.revisiones_finales_calidad x
    join public.pasos_ruta_produccion s on s.id = x.paso_retrabajo_id and s.retirado_en is null
    where x.id = p_revision_id and not x.aprobado
  ),
  pasos as (
    select s.id, s.orden, s.proceso,
           lag(s.id) over (order by s.orden) as anterior,
           coalesce((
             select sum(a.cantidad) from public.asignaciones_produccion a
             where a.revision_final_rechazo_id = r.id and a.paso_id = s.id
               and a.cancelada_en is null and a.informe_rechazo_id is null
           ), 0) as reasignado
    from r
    join public.pasos_ruta_produccion s
      on s.planeacion_item_id = r.planeacion_item_id and s.retirado_en is null and s.orden >= r.desde
  )
  select p.id, p.orden, p.proceso, p.reasignado,
         case when p.anterior is null then r.cantidad
              else coalesce((
                select sum(e.cantidad)
                from public.asignaciones_produccion a
                join public.entregas_produccion e on e.asignacion_id = a.id
                where a.revision_final_rechazo_id = r.id and a.paso_id = p.anterior
                  and a.cancelada_en is null and a.informe_rechazo_id is null
                  and e.anulada_en is null and e.rechazada_en is null and e.verificada_en is not null
              ), 0)
         end
  from pasos p cross join r
  where p.reasignado < r.cantidad
  order by p.orden
  limit 1;
$$;

revoke execute on function public.siguiente_paso_revision_final(uuid) from public, anon;
grant execute on function public.siguiente_paso_revision_final(uuid) to authenticated;

-- Listas para la revisión final = todo lo que Calidad aprobó en el ÚLTIMO paso
-- de la ruta (lotes normales, sus retrabajos y los retrabajos de la propia
-- revisión final que ya recorrieron la ruta hasta ahí).
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
  -- Todo lo aprobado en el último paso, venga de donde venga.
  select coalesce(sum(l.aprobadas), 0)
  from public.lotes_calidad l
  join public.asignaciones_produccion a on a.id = l.asignacion_id
  where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente
    and a.paso_id = (select id from ultimo);
$$;

revoke execute on function public.piezas_listas_revision_final(uuid) from public, anon;
grant execute on function public.piezas_listas_revision_final(uuid) to authenticated;

-- Lo rechazado en la revisión final: paso_* sigue siendo el paso al que lo
-- regresó Calidad; siguiente_* es al que toca reasignarlo ahora, y reasignado /
-- por_reasignar son de ese paso. Si el paso que eligió Calidad se quitó (ya no
-- se puede mientras falte reasignar), queda lo pendiente de ese paso.
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
  case when s.retirado_en is null then coalesce(sg.reasignado, r.cantidad) else coalesce(ro.reasignado, 0) end
    as reasignado,
  case when s.retirado_en is null then coalesce(r.cantidad - sg.reasignado, 0)
       else r.cantidad - coalesce(ro.reasignado, 0) end as por_reasignar,
  (pv.es_version_activa
    and pi.estado_revision is distinct from 'cancelado'
    and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null
    and p.eliminado_definitivo_en is null
    and p.cancelado_en is null) as vigente,
  sg.paso_id as siguiente_paso_id,
  sg.orden as siguiente_paso_orden,
  sg.proceso as siguiente_proceso,
  greatest(0, coalesce(sg.listo - sg.reasignado, 0)) as listo_siguiente
from public.revisiones_finales_calidad r
join public.planeacion_items pi on pi.id = r.planeacion_item_id
join public.pedido_versiones pv on pv.id = pi.pedido_version_id
join public.pedidos p on p.id = pv.pedido_id
join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
left join lateral public.siguiente_paso_revision_final(r.id) sg on true
left join lateral (
  select sum(a.cantidad) as reasignado
  from public.asignaciones_produccion a
  where a.revision_final_rechazo_id = r.id and a.paso_id = s.id
    and a.cancelada_en is null and a.informe_rechazo_id is null
) ro on true
where not r.aprobado;

-- Reasignar lo rechazado en la revisión final, paso por paso de la ruta.
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
  v_sig record;
  v_equipo record;
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
  select r.aprobado, r.cantidad, r.folio, s.retirado_en as paso_retirado_en,
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

  select * into v_sig from public.siguiente_paso_revision_final(p_revision_id);
  if not found then
    raise exception 'Del folio % ya se reasignó todo en todos los pasos de la ruta.', v_r.folio;
  end if;
  if v_sig.reasignado + p_cantidad > v_r.cantidad then
    raise exception 'Del folio % solo quedan % pieza(s) por reasignar en el paso % (%).',
      v_r.folio, v_r.cantidad - v_sig.reasignado, v_sig.orden, v_sig.proceso;
  end if;

  select id, nombre, activo, procesos into v_equipo
    from public.equipos_produccion where id = p_equipo_id;
  if not found or not v_equipo.activo then
    raise exception 'El equipo no existe o está inactivo.';
  end if;
  if not (v_sig.proceso = any(v_equipo.procesos)) then
    raise exception 'El equipo % no hace %.', v_equipo.nombre, v_sig.proceso;
  end if;

  if v_encargado is not null then
    insert into public.encargados_equipo_produccion (equipo_id, nombre)
    values (p_equipo_id, v_encargado)
    on conflict (equipo_id, lower(btrim(nombre))) do nothing;
  end if;

  -- Como en la ruta normal: adelantarse al paso anterior se avisa, no se bloquea.
  insert into public.asignaciones_produccion (
    planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad,
    equipo_id, proceso, cantidad, fecha_asignacion, notas, creado_por, encargado,
    paso_id, revision_final_rechazo_id, adelantada
  ) values (
    v_r.item_id, v_r.pedido_id, v_r.numero_pedido, v_r.item_code, v_r.modelo, v_r.descripcion,
    v_r.unidad, p_equipo_id, v_sig.proceso, p_cantidad, p_fecha_asignacion,
    nullif(btrim(coalesce(p_notas, '')), ''), auth.uid(), v_encargado,
    v_sig.paso_id, p_revision_id, v_sig.reasignado + p_cantidad > v_sig.listo
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_retrabajo_revision_final(uuid, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.crear_retrabajo_revision_final(uuid, uuid, numeric, date, text, text) to authenticated;

-- 6. Un paso con piezas de la revisión final por reasignar no se quita ------------
create or replace function public.guardar_ruta_produccion(
  p_item_id uuid,
  p_pasos jsonb,
  p_version_esperada integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_version integer;
  v_paso jsonb;
  v_n integer := 0;
  v_id uuid;
  v_proceso text;
  v_existente record;
  v_ids uuid[] := '{}';
  v_quitado record;
  v_folio text;
  v_procesos text[] := '{}';
  v_etiqueta text;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar la ruta.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión de la ruta que tenías abierta.';
  end if;

  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.estado_liberacion,
         pi.eliminacion_solicitada_en, pi.estado_revision, pv.es_version_activa,
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
    raise exception 'La ruta es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa then
    raise exception 'El ítem es de una versión anterior del PM; cambia la ruta desde la versión activa.';
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

  select version into v_version
    from public.rutas_produccion where planeacion_item_id = p_item_id
    for update;
  if coalesce(v_version, 0) <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble mientras la editabas. Recarga la página y vuelve a hacer tus cambios.';
  end if;

  if p_pasos is null or jsonb_typeof(p_pasos) <> 'array' or jsonb_array_length(p_pasos) = 0 then
    raise exception 'La ruta necesita al menos un paso.';
  end if;
  if jsonb_array_length(p_pasos) > 12 then
    raise exception 'La ruta no puede pasar de 12 pasos.';
  end if;

  if v_version is null then
    insert into public.rutas_produccion (planeacion_item_id, version)
    values (p_item_id, 0);
  end if;

  -- Validar todos los pasos antes de tocar nada.
  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_paso) <> 'object' then
      raise exception 'Paso %: formato no válido.', v_n;
    end if;
    v_proceso := v_paso->>'proceso';
    if v_proceso is null
       or v_proceso not in ('armado', 'barniz', 'electrificacion', 'superficie_solida') then
      raise exception 'Paso %: proceso no válido.', v_n;
    end if;
    if nullif(v_paso->>'id', '') is not null then
      if (v_paso->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Paso %: no es válido.', v_n;
      end if;
      v_id := (v_paso->>'id')::uuid;
      if v_id = any(v_ids) then
        raise exception 'Paso %: se repite en la ruta.', v_n;
      end if;
      select s.proceso into v_existente
        from public.pasos_ruta_produccion s
        where s.id = v_id and s.planeacion_item_id = p_item_id and s.retirado_en is null;
      if not found then
        raise exception 'Paso %: ya no está en la ruta. Recarga la página.', v_n;
      end if;
      if v_existente.proceso <> v_proceso then
        raise exception 'Paso %: un paso guardado no cambia de proceso; quítalo y agrega otro.', v_n;
      end if;
      v_ids := v_ids || v_id;
    else
      if v_proceso = 'electrificacion' and not public.admite_electrificacion(p_item_id) then
        raise exception 'El ítem % no lleva electrificación ni iluminación; no se agrega Electrificación.', v_item.item_code;
      end if;
      if v_proceso = 'superficie_solida' and not public.admite_superficie_solida(p_item_id) then
        raise exception 'El ítem % no lleva superficie sólida; no se agrega Superficie Sólida.', v_item.item_code;
      end if;
    end if;
  end loop;

  -- Los pasos que no vienen se quitan, si no tienen asignaciones vigentes ni
  -- piezas que la revisión final regresó ahí y faltan por reasignar.
  for v_quitado in
    select s.id, s.orden, s.proceso
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
      and not (s.id = any(v_ids))
    order by s.orden
  loop
    if exists (
      select 1 from public.asignaciones_produccion a
      where a.paso_id = v_quitado.id and a.cancelada_en is null
    ) then
      raise exception 'El paso % (%) tiene asignaciones; cancélalas antes de quitarlo de la ruta.',
        v_quitado.orden, v_quitado.proceso;
    end if;
    select r.folio into v_folio
      from public.revisiones_finales_calidad r
      where r.paso_retrabajo_id = v_quitado.id and not r.aprobado
      limit 1;
    if found then
      raise exception 'La revisión final (%) regresó piezas al paso % (%) que faltan por reasignar; reasígnalas antes de quitarlo de la ruta.',
        v_folio, v_quitado.orden, v_quitado.proceso;
    end if;
    update public.pasos_ruta_produccion
      set retirado_en = now(), retirado_por = auth.uid()
      where id = v_quitado.id;
  end loop;

  -- Reordenar: primero fuera del rango para no chocar con el índice único.
  update public.pasos_ruta_produccion
    set orden = orden + 1000
    where planeacion_item_id = p_item_id and retirado_en is null;

  v_n := 0;
  for v_paso in select value from jsonb_array_elements(p_pasos) loop
    v_n := v_n + 1;
    v_proceso := v_paso->>'proceso';
    v_procesos := v_procesos || v_proceso;
    if nullif(v_paso->>'id', '') is not null then
      update public.pasos_ruta_produccion set orden = v_n where id = (v_paso->>'id')::uuid;
    else
      insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
      values (p_item_id, v_n, v_proceso);
    end if;
  end loop;

  update public.rutas_produccion
    set version = version + 1, actualizado_por = auth.uid(), actualizado_en = now()
    where planeacion_item_id = p_item_id
    returning version into v_version;

  select string_agg(
           case x.proceso
             when 'armado' then 'Armado'
             when 'barniz' then 'Barniz'
             when 'electrificacion' then 'Electrificación'
             else 'Superficie Sólida'
           end, ' → ' order by x.n)
    into v_etiqueta
    from unnest(v_procesos) with ordinality as x(proceso, n);

  insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
  values (auth.uid(), 'rutas_produccion', p_item_id, 'ruta_guardada',
          jsonb_build_object(
            'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
            'modelo', v_item.modelo, 'ruta', v_etiqueta, 'version', v_version
          ));

  return v_version;
end;
$$;

revoke execute on function public.guardar_ruta_produccion(uuid, jsonb, integer) from public, anon;
grant execute on function public.guardar_ruta_produccion(uuid, jsonb, integer) to authenticated;

-- 4. "Calidad aprobó" sin lo retrabajado por la revisión final -------------------
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
  -- sus lotes no cuentan.
  select public.ot_clave(p.numero_pedido), public.norm_modelo(pi.modelo),
    public.norm_descripcion(pi.descripcion), false,
    coalesce(sum(l.aprobadas) filter (where l.proceso = 'barniz'), 0),
    coalesce(sum(l.aprobadas) filter (where l.proceso = 'armado'), 0)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  left join lateral (
    select lc.aprobadas, lc.proceso
    from public.lotes_calidad lc
    join public.equipos_produccion q on q.id = lc.equipo_id
    join public.asignaciones_produccion la on la.id = lc.asignacion_id
    where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
      and la.revision_final_rechazo_id is null
  ) l on true
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

-- 1 y 3. Resumen de asignaciones: rechazos por reasignar y qué vez del proceso es -----
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
  rf.folio as folio_revision_final,
  -- Piezas de sus lotes que Calidad rechazó y siguen sin reasignar (igual que
  -- por_reasignar de rechazos_calidad).
  coalesce(rz.por_reasignar, 0) as rechazado_por_reasignar,
  -- Qué vez del proceso es en la ruta (Armado 2 de 2); null sin paso.
  vp.vez as vez_paso,
  vp.veces as veces_proceso
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
) fc on true
left join lateral (
  select sum(greatest(0, i.cantidad - coalesce((
           select sum(t.cantidad) from public.asignaciones_produccion t
           where t.informe_rechazo_id = i.id and t.cancelada_en is null
         ), 0))) as por_reasignar
  from public.entregas_produccion x3
  join public.informes_calidad i on i.entrega_id = x3.id and not i.aprobado
  where x3.asignacion_id = a.id
) rz on true
left join lateral (
  select nullif(count(*) filter (where s2.orden <= s.orden), 0)::integer as vez,
         nullif(count(*), 0)::integer as veces
  from public.pasos_ruta_produccion s
  join public.pasos_ruta_produccion s2
    on s2.planeacion_item_id = s.planeacion_item_id and s2.proceso = s.proceso and s2.retirado_en is null
  where s.id = a.paso_id
) vp on true;

-- 3. Lotes de Calidad: qué vez del proceso es ------------------------------------------
create or replace view public.lotes_calidad
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
  coalesce(ev.aprobadas, 0::numeric) as aprobadas,
  coalesce(ev.rechazadas, 0::numeric) as rechazadas,
  e.cantidad - coalesce(ev.aprobadas, 0::numeric) - coalesce(ev.rechazadas, 0::numeric) as pendiente,
  coalesce(
    pi.id is not null
      and pi.estado_revision is distinct from 'cancelado'
      and pi.eliminacion_solicitada_en is null
      and p.eliminado_en is null
      and p.eliminado_definitivo_en is null
      and p.cancelado_en is null,
    false) as vigente,
  e.folios_calidad as folio_hoja,
  vp.vez as vez_paso,
  vp.veces as veces_proceso
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
left join lateral (
  select nullif(count(*) filter (where s2.orden <= s.orden), 0)::integer as vez,
         nullif(count(*), 0)::integer as veces
  from public.pasos_ruta_produccion s
  join public.pasos_ruta_produccion s2
    on s2.planeacion_item_id = s.planeacion_item_id and s2.proceso = s.proceso and s2.retirado_en is null
  where s.id = a.paso_id
) vp on true
where e.verificada_en is not null and e.anulada_en is null and e.rechazada_en is null
  and a.cancelada_en is null;
