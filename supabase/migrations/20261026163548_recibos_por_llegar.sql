-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.aprobado_calidad_variante revisiones_finales_calidad
-- @verifica function public.partes_por_cobrar

-- ============================================================================
-- Estimaciones — recibos por llegar (vista previa en el panel de Estimaciones).
--
-- El maquilador solo cobra lo que Calidad aprobó. Calidad aprueba de dos formas:
-- por entrega (lote de un proceso, del mueble completo o de una parte) o en la
-- revisión final del mueble completo. Hasta hoy "Calidad aprobó" (aprobado_calidad_variante)
-- solo contaba los lotes, así que un mueble aprobado en la revisión final no
-- aparecía como aprobado en ningún área.
--
--   * aprobado_calidad_variante: por mueble padre y área, lo mayor entre lo aprobado
--     en lotes (como antes) y lo aprobado en la revisión final, esto último sin
--     pasar de lo que Producción verificó de equipos que no son de planta en ese
--     proceso (la revisión final aprueba el mueble entero, también lo que hizo la
--     planta, que no cobra recibo). Un componente toma, además de su último
--     informe, la proporción de su mueble aprobada así.
--   * partes_por_cobrar: piezas que Calidad aprobó por parte del despiece en
--     muebles que todavía no se completan (solo informativo: el cobro sigue
--     contando un mueble cuando todas sus partes; el cobro por partes es la fase 3).
--     Con permisos de quien consulta (RLS).
-- ============================================================================

-- 1. Calidad aprobó: lotes o revisión final ---------------------------------------------------
create or replace function public.aprobado_calidad_variante(p_ot text default null)
returns table (ot text, clave text, vclave text, componente boolean, aprobado_acabados numeric, aprobado_armado numeric)
language sql
stable
security definer
set search_path = ''
as $$
  -- Muebles padre asignados a algún equipo. Lotes: piezas aprobadas por Calidad en
  -- lotes de equipos que no son de planta (la planta no cobra recibo); el barniz se
  -- cobra como Acabados; lo que regresó la revisión final ya se aprobó una vez y sus
  -- lotes no cuentan; por paso, lo del mueble completo más su parte más atrasada.
  -- Revisión final: lo aprobado ahí, sin pasar de lo que Producción verificó de esos
  -- equipos en el proceso (mismas reglas que verificado_produccion_variante).
  with padres as (
    select pi.id, pi.cantidad_total,
      public.ot_clave(p.numero_pedido) as ot,
      public.norm_modelo(pi.modelo) as clave,
      public.norm_descripcion(pi.descripcion) as vclave,
      (pi.estado_revision is not distinct from 'cancelado' or pi.eliminacion_solicitada_en is not null) as fuera,
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
          public.cobertura_por_partes(pi.id,
            coalesce(sum(x.aprob) filter (where x.parte_id is null), 0),
            coalesce(jsonb_object_agg(x.parte_id, x.aprob) filter (where x.parte_id is not null), '{}'::jsonb), x.proceso) as aprob,
          public.cobertura_por_partes(pi.id,
            coalesce(sum(x.verif) filter (where x.parte_id is null), 0),
            coalesce(jsonb_object_agg(x.parte_id, x.verif) filter (where x.parte_id is not null), '{}'::jsonb), x.proceso) as verif
        from (
          select la.paso_id, lc.proceso, la.parte_id,
            sum(lc.aprobadas) as aprob,
            coalesce(sum(lc.cantidad) filter (where la.informe_rechazo_id is null), 0) as verif
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
  -- Componentes (hijos) de un mueble asignado: Calidad los aprueba enteros (vale su
  -- último informe) o con su mueble en la revisión final (la proporción de su mueble).
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
  join padres x on x.id = h.parent_item_id and not x.fuera
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
  group by 1, 2, 3;
$$;

-- 2. Partes aprobadas de muebles que no se completan ------------------------------------------
-- Por mueble padre, proceso que se cobra (barniz = Acabados, armado) y parte vigente
-- que lleva el proceso: las piezas que Calidad aprobó en lotes de equipos que no son
-- de planta (sin los retrabajos de la revisión final). Solo muebles con alguna pieza
-- aprobada por parte en ese proceso. veces: cuántas veces la ruta lleva el proceso.
create or replace function public.partes_por_cobrar()
returns table (
  ot text,
  planeacion_item_id uuid,
  item_code text,
  modelo text,
  descripcion text,
  cantidad numeric,
  proceso text,
  parte_id uuid,
  parte text,
  piezas_por_mueble numeric,
  aprobadas numeric,
  veces integer
)
language sql
stable
set search_path = ''
as $$
  with aprob as (
    select lc.planeacion_item_id as item_id, lc.proceso, la.parte_id, sum(lc.aprobadas) as n
    from public.lotes_calidad lc
    join public.equipos_produccion q on q.id = lc.equipo_id
    join public.asignaciones_produccion la on la.id = lc.asignacion_id
    where lc.vigente and not q.es_planta and la.parte_id is not null
      and la.revision_final_rechazo_id is null and lc.proceso in ('barniz', 'armado')
    group by 1, 2, 3
  ),
  muebles as (
    select distinct item_id, proceso from aprob where n > 0
  )
  select public.ot_clave(p.numero_pedido), pi.id, pi.item_code, pi.modelo, pi.descripcion,
    pi.cantidad_total, m.proceso, pd.id, pd.descripcion, pd.piezas_por_mueble,
    coalesce(a.n, 0),
    greatest(1, (
      select count(*) from public.pasos_ruta_produccion s
      where s.planeacion_item_id = pi.id and s.proceso = m.proceso and s.retirado_en is null
    ))::integer
  from muebles m
  join public.planeacion_items pi on pi.id = m.item_id
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  join public.partes_despiece pd on pd.planeacion_item_id = pi.id and pd.retirada_en is null
    and not (m.proceso = any (pd.procesos_omitidos))
  left join aprob a on a.item_id = m.item_id and a.proceso = m.proceso and a.parte_id = pd.id
  order by 1, pi.item_code, m.proceso, pd.orden;
$$;

revoke execute on function public.partes_por_cobrar() from public, anon;
grant execute on function public.partes_por_cobrar() to authenticated;
