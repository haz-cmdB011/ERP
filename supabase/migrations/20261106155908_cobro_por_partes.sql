-- Cobro por partes y Electrificación según Calidad (6 nov 2026; "fase 3").
-- @verifica function-contiene public.aprobado_calidad_variante lotes_partes_calidad
-- @verifica function public.aprobado_calidad_electrificacion
-- @verifica function-contiene public.est_conciliar_renglon_pm aprobado_calidad_electrificacion
--
-- Calidad aprueba cada entrega de un proceso, del mueble completo o de una parte del
-- despiece (migración calidad_revisa_partes). Lo que se le paga a cada maquilador es lo
-- que Calidad aprobó de su proceso:
--
-- - aprobado_calidad_variante: un mueble con despiece propio (no el sugerido) da una fila
--   por parte, con las mismas claves que componentes_recibo_ot (lo que ofrece el campo
--   Modelo del recibo). Lo aprobado de una parte = lo que Calidad aprobó de sus piezas
--   (entregas por partes y asignaciones de la parte) o, si es más, lo aprobado del mueble
--   completo × sus piezas por mueble. Sus hijos del PM ya no dan fila aparte (eran las
--   mismas piezas). Sin despiece propio, los hijos siguen como antes.
-- - est_conciliar_renglon_pm: ya no exime a las partes del tope de Calidad (antes, como
--   Calidad no las evaluaba, solo regía el PM). Y Electrificación también se topa con lo
--   que Calidad aprobó (aprobado_calidad_electrificacion): un mueble que no pasó por
--   Producción y Calidad en Electrificación no se cobra, igual que Armado y Acabados.
-- - S.S. no tiene recibo de maquila: no hay tope que poner.
--
-- Cuidado al reescribir estas funciones: se tomaron de la base el 6 nov 2026.

create or replace function public.aprobado_calidad_variante(p_ot text default null::text)
 returns table(ot text, clave text, vclave text, componente boolean, aprobado_acabados numeric, aprobado_armado numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Muebles padre asignados a algún equipo. Lotes: piezas aprobadas por Calidad en
  -- lotes de equipos que no son de planta (la planta no cobra recibo); el barniz se
  -- cobra como Acabados; lo que regresó la revisión final ya se aprobó una vez y sus
  -- lotes no cuentan; un paso del mueble completo cuenta lo suyo y los de las partes,
  -- por proceso y vez, lo de la parte más atrasada.
  -- Revisión final: lo aprobado ahí, sin pasar de lo que Producción verificó de esos
  -- equipos en el proceso (mismas reglas que verificado_produccion_variante).
  with padres as (
    select pi.id, pi.cantidad_total, pi.modelo, pi.descripcion,
      public.ot_clave(p.numero_pedido) as ot,
      public.norm_modelo(pi.modelo) as clave,
      public.norm_descripcion(pi.descripcion) as vclave,
      (pi.estado_revision is not distinct from 'cancelado' or pi.eliminacion_solicitada_en is not null) as fuera,
      exists (
        select 1
        from public.despieces_produccion d
        join public.partes_despiece pd on pd.despiece_id = d.id and pd.retirada_en is null
        where d.planeacion_item_id = pi.id and not d.igual_a_sugerencia
      ) as con_despiece,
      greatest(l.acabados_lotes, least(l.acabados_verif, coalesce(rf.aprobadas, 0))) as acabados,
      greatest(l.armado_lotes, least(l.armado_verif, coalesce(rf.aprobadas, 0))) as armado
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    cross join lateral (
      select coalesce(sum(pp.aprob) filter (where pp.proceso = 'barniz'), 0) as acabados_lotes,
             coalesce(sum(pp.aprob) filter (where pp.proceso = 'armado'), 0) as armado_lotes,
             coalesce(sum(pp.verif) filter (where pp.proceso = 'barniz'), 0) as acabados_verif,
             coalesce(sum(pp.verif) filter (where pp.proceso = 'armado'), 0) as armado_verif
      from (
        select x.proceso,
          case when x.vez is null then sum(x.aprob)
               else public.cobertura_partes_vez(pi.id, jsonb_object_agg(x.parte_id, x.aprob) filter (where x.parte_id is not null), x.proceso, x.vez)
          end as aprob,
          case when x.vez is null then sum(x.verif)
               else public.cobertura_partes_vez(pi.id, jsonb_object_agg(x.parte_id, x.verif) filter (where x.parte_id is not null), x.proceso, x.vez)
          end as verif
        from (
          select lc.proceso, la.parte_id,
            case when la.parte_id is null then la.paso_id end as paso_mueble,
            case when la.parte_id is not null then public.vez_paso_ruta(la.paso_id) end as vez,
            sum(lc.aprobadas) as aprob,
            coalesce(sum(lc.cantidad) filter (where la.informe_rechazo_id is null), 0) as verif
          from public.lotes_calidad lc
          join public.equipos_produccion q on q.id = lc.equipo_id
          join public.asignaciones_produccion la on la.id = lc.asignacion_id
          where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
            and la.revision_final_rechazo_id is null
          group by 1, 2, 3, 4
        ) x
        -- Un grupo por paso del mueble o, en las partes, por (x.vez, x.proceso).
        group by x.proceso, x.paso_mueble, x.vez
      ) pp
    ) l
    left join lateral (
      select sum(r.cantidad) filter (where r.aprobado) as aprobadas
      from public.revisiones_finales_calidad r
      where r.planeacion_item_id = pi.id
    ) rf on true
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
  -- Componentes (hijos) de un mueble asignado sin despiece propio: Calidad los aprueba
  -- enteros (vale su último informe) o con su mueble (la proporción de su mueble).
  select x.ot, public.norm_modelo(h.modelo), public.norm_descripcion(h.descripcion), true,
    sum(greatest(
      case when u.aprobado then h.cantidad_total else 0 end,
      case when x.cantidad_total > 0
        then floor(h.cantidad_total * least(x.acabados, x.cantidad_total) / x.cantidad_total) else 0 end)),
    sum(greatest(
      case when u.aprobado then h.cantidad_total else 0 end,
      case when x.cantidad_total > 0
        then floor(h.cantidad_total * least(x.armado, x.cantidad_total) / x.cantidad_total) else 0 end))
  from public.planeacion_items h
  join padres x on x.id = h.parent_item_id and not x.fuera and not x.con_despiece
  left join lateral (
    select ic.aprobado
    from public.informes_calidad ic
    where ic.planeacion_item_id = h.id
    order by ic.elaborado_en desc, ic.id desc
    limit 1
  ) u on true
  where h.tipo_registro = 'FU'
    and (h.estado_revision is null or h.estado_revision <> 'cancelado')
    and h.eliminacion_solicitada_en is null
  group by 1, 2, 3
  union all
  -- Partes del despiece propio (claves de componentes_recibo_ot): lo aprobado de sus
  -- piezas o lo del mueble completo × piezas por mueble, lo que sea más.
  select x.ot,
    public.norm_modelo(coalesce(h.modelo, x.modelo)),
    public.norm_descripcion(coalesce(h.descripcion, pd.descripcion)),
    true,
    sum(least(pd.piezas_por_mueble * x.cantidad_total,
      greatest(coalesce(pa.acabados, 0), pd.piezas_por_mueble * least(x.acabados, x.cantidad_total)))),
    sum(least(pd.piezas_por_mueble * x.cantidad_total,
      greatest(coalesce(pa.armado, 0), pd.piezas_por_mueble * least(x.armado, x.cantidad_total))))
  from padres x
  join public.partes_despiece pd on pd.planeacion_item_id = x.id and pd.retirada_en is null
  left join public.planeacion_items h on h.id = pd.hijo_id
  left join lateral (
    select coalesce(sum(z.aprob) filter (where z.proceso = 'barniz'), 0) as acabados,
           coalesce(sum(z.aprob) filter (where z.proceso = 'armado'), 0) as armado
    from (
      -- Entregas por partes de un mueble asignado completo.
      select lp.proceso, lp.aprobadas as aprob
      from public.lotes_partes_calidad lp
      join public.equipos_produccion q on q.id = lp.equipo_id
      where lp.parte_id = pd.id and lp.vigente and not q.es_planta
      union all
      -- Asignaciones de la parte (mueble "por partes").
      select lc.proceso, lc.aprobadas
      from public.lotes_calidad lc
      join public.equipos_produccion q on q.id = lc.equipo_id
      join public.asignaciones_produccion la on la.id = lc.asignacion_id
      where la.parte_id = pd.id and lc.vigente and not q.es_planta
        and la.revision_final_rechazo_id is null
    ) z
  ) pa on true
  where x.con_despiece and not x.fuera
    -- La parte que es el mueble mismo ya se cobra como mueble padre.
    and not (
      public.norm_modelo(coalesce(h.modelo, x.modelo)) = public.norm_modelo(x.modelo)
      and public.norm_descripcion(coalesce(h.descripcion, pd.descripcion)) = public.norm_descripcion(x.descripcion)
    )
  group by 1, 2, 3;
$function$;

-- Lo que Calidad aprobó de Electrificación por O.T. y variante del mueble padre: lotes de
-- equipos que no son de planta o, si es más, la revisión final (sin pasar de lo que
-- Producción verificó de esos equipos en Electrificación). Solo muebles con alguna
-- asignación de Electrificación.
create or replace function public.aprobado_calidad_electrificacion(p_ot text default null::text)
 returns table(ot text, clave text, vclave text, aprobado numeric)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select public.ot_clave(p.numero_pedido), public.norm_modelo(pi.modelo), public.norm_descripcion(pi.descripcion),
    sum(greatest(coalesce(l.aprob, 0), least(coalesce(l.verif, 0), coalesce(rf.aprobadas, 0))))
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  left join lateral (
    select sum(lc.aprobadas) as aprob,
           sum(lc.cantidad) filter (where la.informe_rechazo_id is null) as verif
    from public.lotes_calidad lc
    join public.equipos_produccion q on q.id = lc.equipo_id
    join public.asignaciones_produccion la on la.id = lc.asignacion_id
    where lc.planeacion_item_id = pi.id and lc.vigente and not q.es_planta
      and lc.proceso = 'electrificacion' and la.revision_final_rechazo_id is null
  ) l on true
  left join lateral (
    select sum(r.cantidad) filter (where r.aprobado) as aprobadas
    from public.revisiones_finales_calidad r
    where r.planeacion_item_id = pi.id
  ) rf on true
  where pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null
    and exists (
      select 1 from public.asignaciones_produccion a
      where a.planeacion_item_id = pi.id and a.cancelada_en is null and a.proceso = 'electrificacion'
    )
    and (p_ot is null or public.ot_clave(p.numero_pedido) = public.ot_clave(p_ot))
  group by 1, 2, 3;
$function$;

revoke all on function public.aprobado_calidad_electrificacion(text) from public, anon, authenticated;

-- La versión vigente (tope_cobro_sobre_reprocesos) con dos cambios: sin la excepción de
-- las partes (ahora Calidad las aprueba) y con el tope de Calidad en Electrificación.
create or replace function public.est_conciliar_renglon_pm()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_fila jsonb := to_jsonb(new);
  v_area text;
  v_estado text;
  v_ot text;
  v_pm numeric;
  v_acumulada numeric;
  v_motivo text;
  v_reproceso boolean := false;
  v_en_variante boolean := false;
  v_aprobado numeric;
begin
  if tg_table_name = 'renglones_electrificacion' then
    v_area := 'electrificacion';
    select estado, public.ot_clave(ot) into v_estado, v_ot
      from public.recibos_electrificacion where id = new.recibo_id;
    if tg_op = 'UPDATE' then
      delete from public.discrepancias_pm where renglon_electrificacion_id = new.id;
    end if;
  else
    select tipo, estado, public.ot_clave(ot) into v_area, v_estado, v_ot
      from public.recibos where id = new.recibo_id;
    if tg_op = 'UPDATE' then
      delete from public.discrepancias_pm where renglon_id = new.id;
    end if;
    v_reproceso := v_fila->>'tipo_trabajo' = 'reproceso';
  end if;

  if v_estado = 'cancelado' then
    return new;
  end if;

  -- Uno tras otro por OT + código + área (todas sus variantes): el segundo
  -- espera a que el primero termine y ya cuenta sus piezas.
  perform pg_advisory_xact_lock(hashtextextended(
    'conciliacion_ot:' || v_area || ':' || coalesce(v_ot, '-') || ':'
      || public.norm_modelo(new.modelo), 0));

  if v_reproceso then
    -- Un reproceso se mide contra el retrabajo que Producción reasignó (no gasta saldo del PM).
    v_pm := public.cantidad_reproceso_asignada(v_ot, new.modelo, new.descripcion_pm, v_area);
    v_acumulada := public.cantidad_reproceso_registrada(v_ot, new.modelo, new.descripcion_pm, v_area);

    if v_pm is not null and v_acumulada <= v_pm then
      return new;
    end if;

    v_motivo := nullif(btrim(coalesce(new.motivo_descuadre, '')), '');
    if v_motivo is null then
      raise exception
        'Renglón %: el reproceso supera lo que Producción reasignó como retrabajo (o no reasignó ese modelo); captura el motivo.',
        new.numero;
    end if;

    insert into public.discrepancias_pm (
      area, recibo_id, renglon_id, orden_trabajo, modelo, descripcion_pm,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por, es_reproceso
    ) values (
      v_area, new.recibo_id, new.id, v_ot, new.modelo, new.descripcion_pm,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid(), true
    );
    return new;
  end if;

  v_en_variante := new.descripcion_pm is not null
    and public.cantidad_pm_variante(v_ot, new.modelo, new.descripcion_pm, false) is not null;

  if v_en_variante then
    -- La variante está en la OT. En Electrificación, una variante sin
    -- iluminación da null: no está en el PM de Electrificación. Un mueble cuya
    -- ruta repite el proceso del área se espera tantas veces como lo repita.
    v_pm := public.cantidad_pm_variante_area(v_ot, new.modelo, new.descripcion_pm, v_area);
    v_acumulada := public.cantidad_registrada_variante(v_ot, new.modelo, new.descripcion_pm, v_area);
  else
    v_pm := public.cantidad_pm_ot_area(v_ot, new.modelo, v_area);
    v_acumulada := public.cantidad_registrada_ot(v_ot, new.modelo, v_area);
  end if;

  -- 1. Tope del PM.
  if v_pm is null or v_acumulada > v_pm then
    raise exception 'Renglón %: no se puede, supera el límite del PM (% pz).', new.numero, coalesce(v_pm, 0);
  end if;

  -- 2. Tope de lo que Calidad aprobó del proceso del área: del mueble, de un componente o
  -- de una parte del despiece.
  if v_area in ('acabados', 'armado') then
    select case v_area when 'acabados' then sum(a.aprobado_acabados) else sum(a.aprobado_armado) end
      into v_aprobado
      from public.aprobado_calidad_variante(v_ot) a
      where a.clave = public.norm_modelo(new.modelo)
        and (
          (v_en_variante and a.vclave = public.norm_descripcion(new.descripcion_pm))
          or (not v_en_variante and not a.componente)
        );
  else
    select sum(a.aprobado) into v_aprobado
      from public.aprobado_calidad_electrificacion(v_ot) a
      where a.clave = public.norm_modelo(new.modelo)
        and (not v_en_variante or a.vclave = public.norm_descripcion(new.descripcion_pm));
  end if;

  if coalesce(v_aprobado, 0) < v_acumulada then
    raise exception 'Renglón %: no se puede, Calidad solo tiene % pz aprobadas.', new.numero, coalesce(v_aprobado, 0);
  end if;

  return new;
end;
$function$;
