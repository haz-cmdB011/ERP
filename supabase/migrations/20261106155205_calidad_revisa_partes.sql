-- Calidad revisa las piezas entregadas por partes (6 nov 2026).
-- @verifica column public.informes_calidad.entrega_parte_id
-- @verifica column public.entregas_produccion.desde_partes
-- @verifica constraint public.informes_calidad.informes_calidad_una_entrega_check
-- @verifica table public.lotes_partes_calidad
-- @verifica function public.evaluar_entrega_parte_calidad
-- @verifica function public.aprobar_mueble_desde_partes
-- @verifica function-contiene public.evaluar_entrega_calidad desde_partes
-- @verifica function-contiene public.registrar_entrega_partes desde_partes
--
-- Un mueble asignado completo puede entregarse "por partes" (migración entrega_por_partes):
-- las piezas de cada parte quedan en entregas_partes_produccion y, cuando la parte más
-- atrasada alcanza para más muebles, se registra sola la entrega del mueble. Hasta hoy
-- Calidad solo veía esa entrega del mueble. Ahora:
--
-- - Cada renglón de piezas por parte es una entrega que Calidad aprueba o no
--   (vista lotes_partes_calidad, evaluar_entrega_parte_calidad; el informe lleva
--   entrega_parte_id en vez de entrega_id).
-- - La entrega del mueble que nace de las partes (entregas_produccion.desde_partes) ya no
--   se evalúa directo: su aprobación la pone la base cuando las piezas aprobadas de la
--   parte más atrasada alcanzan para muebles completos (aprobar_mueble_desde_partes). Así
--   el cobro, la revisión final y los resúmenes, que cuentan muebles, siguen igual.
-- - Las piezas que Calidad no aprueba se pueden volver a entregar en la misma asignación
--   (no gastan lo que falta por entregar) y no cuentan para formar muebles.

alter table public.informes_calidad
  add column entrega_parte_id uuid references public.entregas_partes_produccion(id);
create index idx_informes_calidad_entrega_parte on public.informes_calidad (entrega_parte_id);
alter table public.informes_calidad
  add constraint informes_calidad_una_entrega_check check (entrega_id is null or entrega_parte_id is null);

alter table public.entregas_produccion
  add column desde_partes boolean not null default false;

-- Las que ya registró registrar_entrega_partes llevan su clave con ":mueble".
update public.entregas_produccion e
  set desde_partes = true
  where e.clave_envio like '%:mueble'
    and exists (select 1 from public.entregas_partes_produccion ep where ep.asignacion_id = e.asignacion_id);

-- Las piezas por parte que Calidad puede revisar (mismo criterio de vigencia que lotes_calidad).
create view public.lotes_partes_calidad with (security_invoker = true) as
select
  ep.id as entrega_parte_id,
  ep.asignacion_id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.proceso,
  a.equipo_id,
  q.nombre as equipo,
  ep.parte_id,
  pd.descripcion as parte_descripcion,
  coalesce(pd.unidad, 'PZA') as unidad,
  pd.piezas_por_mueble,
  ep.fecha_entrega,
  ep.registrado_en,
  ep.piezas as cantidad,
  coalesce(ev.aprobadas, 0::numeric) as aprobadas,
  coalesce(ev.rechazadas, 0::numeric) as rechazadas,
  ep.piezas - coalesce(ev.aprobadas, 0::numeric) - coalesce(ev.rechazadas, 0::numeric) as pendiente,
  coalesce(pi.id is not null and pi.estado_revision is distinct from 'cancelado' and pi.eliminacion_solicitada_en is null
    and p.eliminado_en is null and p.eliminado_definitivo_en is null and p.cancelado_en is null, false) as vigente,
  ep.folios_calidad as folio_hoja
from public.entregas_partes_produccion ep
join public.asignaciones_produccion a on a.id = ep.asignacion_id
join public.equipos_produccion q on q.id = a.equipo_id
join public.partes_despiece pd on pd.id = ep.parte_id
left join public.planeacion_items pi on pi.id = a.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id
left join lateral (
  select sum(i.cantidad) filter (where i.aprobado) as aprobadas,
         sum(i.cantidad) filter (where not i.aprobado) as rechazadas
  from public.informes_calidad i
  where i.entrega_parte_id = ep.id
) ev on true
where a.cancelada_en is null;

grant select on public.lotes_partes_calidad to authenticated;

-- Aprueba en las entregas del mueble nacidas de partes lo que ya alcanzan las piezas
-- aprobadas: la parte más atrasada (entre las que llevan el proceso) en muebles completos.
-- Solo agrega aprobaciones; nunca rechaza el mueble (lo rechazado se vuelve a entregar).
create or replace function public.aprobar_mueble_desde_partes(p_asignacion_id uuid)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_a record;
  v_completos numeric;
  v_ya numeric;
  v_falta numeric;
  v_e record;
  v_n numeric;
  v_total numeric := 0;
begin
  select id, planeacion_item_id, cantidad, proceso into v_a
    from public.asignaciones_produccion where id = p_asignacion_id;
  if not found then
    return 0;
  end if;

  select min(floor(coalesce(x.aprobadas, 0) / pd.piezas_por_mueble)) into v_completos
    from public.partes_despiece pd
    left join (
      select ep.parte_id, sum(i.cantidad) as aprobadas
      from public.entregas_partes_produccion ep
      join public.informes_calidad i on i.entrega_parte_id = ep.id and i.aprobado
      where ep.asignacion_id = p_asignacion_id
      group by ep.parte_id
    ) x on x.parte_id = pd.id
    where pd.planeacion_item_id = v_a.planeacion_item_id and pd.retirada_en is null
      and not (v_a.proceso = any (pd.procesos_omitidos));
  v_completos := least(coalesce(v_completos, 0), v_a.cantidad);

  select coalesce(sum(i.cantidad), 0) into v_ya
    from public.informes_calidad i
    join public.entregas_produccion e on e.id = i.entrega_id
    where e.asignacion_id = p_asignacion_id and e.desde_partes and i.aprobado;
  v_falta := v_completos - v_ya;

  for v_e in
    select e.id, e.cantidad - coalesce((select sum(i.cantidad) from public.informes_calidad i where i.entrega_id = e.id), 0) as pendiente
    from public.entregas_produccion e
    where e.asignacion_id = p_asignacion_id and e.desde_partes
      and e.verificada_en is not null and e.anulada_en is null and e.rechazada_en is null
    order by e.fecha_entrega, e.id
  loop
    exit when v_falta <= 0;
    continue when v_e.pendiente <= 0;
    v_n := least(v_e.pendiente, v_falta);
    insert into public.informes_calidad (
      planeacion_item_id, folio, aprobado, descripcion, elaborado_por, piezas_verificadas, entrega_id, cantidad
    ) values (
      v_a.planeacion_item_id,
      'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0'),
      true, 'Aprobado por partes', auth.uid(),
      public.piezas_verificadas_mueble(v_a.planeacion_item_id), v_e.id, v_n
    );
    v_falta := v_falta - v_n;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$function$;

revoke all on function public.aprobar_mueble_desde_partes(uuid) from public, anon, authenticated;

-- Calidad aprueba o no las piezas de una entrega por partes (como evaluar_entrega_calidad).
create or replace function public.evaluar_entrega_parte_calidad(
  p_entrega_parte_id uuid,
  p_aprobadas numeric,
  p_rechazadas numeric,
  p_motivo text default null,
  p_categoria text default null
)
returns table(informe_id uuid, folio text, aprobado boolean)
language plpgsql
security definer
set search_path to ''
as $function$
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

  select ep.piezas, ep.asignacion_id, a.cancelada_en, a.planeacion_item_id,
         pi.estado_revision, pi.eliminacion_solicitada_en,
         p.eliminado_en, p.cancelado_en
    into v_e
    from public.entregas_partes_produccion ep
    join public.asignaciones_produccion a on a.id = ep.asignacion_id
    left join public.planeacion_items pi on pi.id = a.planeacion_item_id
    left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    left join public.pedidos p on p.id = pv.pedido_id
    where ep.id = p_entrega_parte_id
    for update of ep;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_e.cancelada_en is not null then
    raise exception 'La asignación de esta entrega está cancelada.';
  end if;
  if v_e.planeacion_item_id is null
     or v_e.estado_revision = 'cancelado'
     or v_e.eliminacion_solicitada_en is not null
     or v_e.eliminado_en is not null
     or v_e.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado o eliminado; ya no se evalúa.';
  end if;

  select coalesce(sum(i.cantidad), 0) into v_evaluado
    from public.informes_calidad i where i.entrega_parte_id = p_entrega_parte_id;
  v_pendiente := v_e.piezas - v_evaluado;
  if v_aprob + v_rech > v_pendiente then
    raise exception 'Esta entrega solo tiene % pieza(s) por evaluar.', v_pendiente;
  end if;

  v_piezas := public.piezas_verificadas_mueble(v_e.planeacion_item_id);

  if v_aprob > 0 then
    insert into public.informes_calidad (
      planeacion_item_id, folio, aprobado, elaborado_por, piezas_verificadas, entrega_parte_id, cantidad
    ) values (
      v_e.planeacion_item_id,
      'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0'),
      true, auth.uid(), v_piezas, p_entrega_parte_id, v_aprob
    )
    returning id, folio, aprobado into informe_id, folio, aprobado;
    return next;
  end if;

  if v_rech > 0 then
    insert into public.informes_calidad (
      planeacion_item_id, folio, aprobado, descripcion, categoria, elaborado_por,
      piezas_verificadas, entrega_parte_id, cantidad
    ) values (
      v_e.planeacion_item_id,
      'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0'),
      false, btrim(p_motivo), v_categoria, auth.uid(), v_piezas, p_entrega_parte_id, v_rech
    )
    returning id, folio, aprobado into informe_id, folio, aprobado;
    return next;
  end if;

  perform public.aprobar_mueble_desde_partes(v_e.asignacion_id);
end;
$function$;

revoke all on function public.evaluar_entrega_parte_calidad(uuid, numeric, numeric, text, text) from public, anon;
grant execute on function public.evaluar_entrega_parte_calidad(uuid, numeric, numeric, text, text) to authenticated;

-- La versión vigente (5 nov 2026) con un solo cambio: la entrega del mueble nacida de
-- partes no se evalúa directo.
create or replace function public.evaluar_entrega_calidad(p_entrega_id uuid, p_aprobadas numeric, p_rechazadas numeric, p_motivo text default null::text, p_categoria text default null::text)
 returns table(informe_id uuid, folio text, aprobado boolean)
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  select e.cantidad, e.verificada_en, e.anulada_en, e.rechazada_en, e.desde_partes,
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
  if v_e.desde_partes then
    raise exception 'Esta entrega se juntó con piezas por parte: se revisan las partes.';
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
$function$;

-- La versión vigente (procesos_por_parte) con tres cambios: lo que Calidad no aprobó de una
-- parte no gasta lo que falta por entregar ni cuenta para formar muebles; la entrega del
-- mueble que nace aquí queda marcada desde_partes; y se le pasa lo ya aprobado.
create or replace function public.registrar_entrega_partes(p_asignacion_id uuid, p_fecha_entrega date, p_partes jsonb, p_folios_calidad text, p_clave_envio text default null::text)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_asignacion record;
  v_clave text := nullif(btrim(coalesce(p_clave_envio, '')), '');
  v_folio text := nullif(btrim(coalesce(p_folios_calidad, '')), '');
  v_linea jsonb;
  v_parte record;
  v_parte_id uuid;
  v_piezas numeric;
  v_ya numeric;
  v_vistas uuid[] := '{}';
  v_completos numeric;
  v_entregado numeric;
  v_nuevos numeric;
  v_entrega uuid;
begin
  -- procesos_por_parte: las partes y los muebles completos se miden con las que llevan el
  -- proceso de la asignación.
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if v_clave is not null and length(v_clave) > 100 then
    raise exception 'La clave de envío no es válida.';
  end if;

  if v_clave is not null and exists (
    select 1 from public.entregas_partes_produccion
    where clave_envio = v_clave and asignacion_id = p_asignacion_id
  ) then
    return 0;
  end if;

  if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0 then
    raise exception 'Escribe cuántas piezas se entregaron de al menos una parte.';
  end if;
  if jsonb_array_length(p_partes) > 50 then
    raise exception 'Son demasiadas partes en una sola entrega.';
  end if;
  if p_fecha_entrega is null then
    raise exception 'Falta la fecha de entrega.';
  end if;
  if v_folio is null then
    raise exception 'Escribe el folio de la hoja de entrega.';
  end if;

  select id, planeacion_item_id, cantidad, fecha_asignacion, cancelada_en, parte_id, proceso into v_asignacion
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_asignacion.cancelada_en is not null then
    raise exception 'La asignación está cancelada.';
  end if;
  if v_asignacion.parte_id is not null then
    raise exception 'Esta asignación es de una parte: su entrega se registra completa.';
  end if;
  if p_fecha_entrega < v_asignacion.fecha_asignacion then
    raise exception 'La fecha de entrega no puede ser anterior a la de asignación (%).',
      to_char(v_asignacion.fecha_asignacion, 'DD/MM/YYYY');
  end if;
  if p_fecha_entrega > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de entrega no puede ser futura.';
  end if;

  for v_linea in select * from jsonb_array_elements(p_partes) loop
    begin
      v_parte_id := (v_linea ->> 'parteId')::uuid;
      v_piezas := (v_linea ->> 'piezas')::numeric;
    exception when others then
      raise exception 'Una de las partes no es válida.';
    end;
    if v_piezas is null or v_piezas <= 0 then
      raise exception 'Las piezas de cada parte deben ser mayores que cero.';
    end if;
    if v_parte_id = any (v_vistas) then
      raise exception 'Una parte está repetida en la entrega.';
    end if;
    v_vistas := v_vistas || v_parte_id;

    select pd.id, pd.descripcion, pd.piezas_por_mueble into v_parte
      from public.partes_despiece pd
      where pd.id = v_parte_id
        and pd.planeacion_item_id = v_asignacion.planeacion_item_id
        and pd.retirada_en is null
        and not (v_asignacion.proceso = any (pd.procesos_omitidos));
    if not found then
      raise exception 'Una de las partes ya no es del despiece de este mueble o no lleva este proceso.';
    end if;

    -- Lo entregado menos lo que Calidad no aprobó (eso se vuelve a entregar).
    select coalesce(sum(ep.piezas), 0)
           - coalesce((select sum(i.cantidad) from public.informes_calidad i
                       join public.entregas_partes_produccion e2 on e2.id = i.entrega_parte_id
                       where e2.asignacion_id = p_asignacion_id and e2.parte_id = v_parte_id and not i.aprobado), 0)
      into v_ya
      from public.entregas_partes_produccion ep
      where ep.asignacion_id = p_asignacion_id and ep.parte_id = v_parte_id;
    if v_ya + v_piezas > v_parte.piezas_por_mueble * v_asignacion.cantidad then
      raise exception 'De "%" solo faltan % por entregar de %.',
        v_parte.descripcion,
        v_parte.piezas_por_mueble * v_asignacion.cantidad - v_ya,
        v_parte.piezas_por_mueble * v_asignacion.cantidad;
    end if;

    insert into public.entregas_partes_produccion (
      asignacion_id, parte_id, piezas, fecha_entrega, folios_calidad, clave_envio
    ) values (
      p_asignacion_id, v_parte_id, v_piezas, p_fecha_entrega, v_folio, v_clave
    );
  end loop;

  select min(floor(coalesce(e.total, 0) / pd.piezas_por_mueble)) into v_completos
    from public.partes_despiece pd
    left join (
      select ep.parte_id,
             sum(ep.piezas) - coalesce(sum(r.rechazadas), 0) as total
      from public.entregas_partes_produccion ep
      left join lateral (
        select sum(i.cantidad) as rechazadas from public.informes_calidad i
        where i.entrega_parte_id = ep.id and not i.aprobado
      ) r on true
      where ep.asignacion_id = p_asignacion_id
      group by ep.parte_id
    ) e on e.parte_id = pd.id
    where pd.planeacion_item_id = v_asignacion.planeacion_item_id and pd.retirada_en is null
      and not (v_asignacion.proceso = any (pd.procesos_omitidos));
  v_completos := least(coalesce(v_completos, 0), v_asignacion.cantidad);

  select coalesce(sum(cantidad), 0) into v_entregado
    from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null;

  v_nuevos := v_completos - v_entregado;
  if v_nuevos > 0 then
    v_entrega := public.registrar_entrega_produccion(
      p_asignacion_id, p_fecha_entrega, v_nuevos, v_folio,
      case when v_clave is not null then v_clave || ':mueble' end
    );
    update public.entregas_produccion set desde_partes = true where id = v_entrega;
    perform public.aprobar_mueble_desde_partes(p_asignacion_id);
    return v_nuevos::integer;
  end if;
  return 0;
end;
$function$;
