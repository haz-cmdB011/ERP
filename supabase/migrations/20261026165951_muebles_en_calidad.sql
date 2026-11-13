-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.muebles_en_calidad
-- @verifica sin-function public.partes_por_cobrar

-- ============================================================================
-- Estimaciones — recibos por llegar: todo lo entregado a Calidad, no solo lo aprobado.
--
-- La vista previa muestra cada mueble que un equipo externo ya entregó a Calidad
-- (Producción verificó la entrega), aunque Calidad todavía no lo apruebe, con lo
-- entregado y lo aprobado por parte del despiece. muebles_en_calidad reemplaza a
-- partes_por_cobrar (de recibos_por_llegar, solo daba lo aprobado por parte y nadie
-- más la usa).
-- ============================================================================

drop function if exists public.partes_por_cobrar();

-- Por mueble padre, proceso que se cobra (barniz = Acabados, armado) y parte vigente
-- que lleva el proceso (parte_id null = lo asignado como mueble completo, en muebles):
-- piezas entregadas a Calidad (lotes verificados de equipos que no son de planta, sin
-- retrabajos) y aprobadas por Calidad (con los retrabajos que se aprobaron). Sin los
-- retrabajos de la revisión final, que ya se aprobó una vez. Solo muebles con algo
-- entregado en ese proceso. veces: cuántas veces la ruta lleva el proceso;
-- final_aprobadas: lo aprobado del mueble en la revisión final.
-- Con permisos de quien consulta (RLS).
create or replace function public.muebles_en_calidad()
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
  entregadas numeric,
  aprobadas numeric,
  veces integer,
  final_aprobadas numeric
)
language sql
stable
set search_path = ''
as $$
  with lotes as (
    select lc.planeacion_item_id as item_id, lc.proceso, la.parte_id,
      coalesce(sum(lc.cantidad) filter (where la.informe_rechazo_id is null), 0) as entregadas,
      sum(lc.aprobadas) as aprobadas
    from public.lotes_calidad lc
    join public.equipos_produccion q on q.id = lc.equipo_id
    join public.asignaciones_produccion la on la.id = lc.asignacion_id
    where lc.vigente and not q.es_planta and la.revision_final_rechazo_id is null
      and lc.proceso in ('barniz', 'armado')
    group by 1, 2, 3
  ),
  muebles as (
    select distinct item_id, proceso from lotes where entregadas > 0
  )
  select public.ot_clave(p.numero_pedido), pi.id, pi.item_code, pi.modelo, pi.descripcion,
    pi.cantidad_total, m.proceso, x.parte_id, x.parte, x.piezas_por_mueble,
    coalesce(l.entregadas, 0), coalesce(l.aprobadas, 0),
    greatest(1, (
      select count(*) from public.pasos_ruta_produccion s
      where s.planeacion_item_id = pi.id and s.proceso = m.proceso and s.retirado_en is null
    ))::integer,
    coalesce(rf.aprobadas, 0)
  from muebles m
  join public.planeacion_items pi on pi.id = m.item_id
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  join public.pedidos p on p.id = pv.pedido_id
    and p.eliminado_en is null and p.eliminado_definitivo_en is null
  -- Sus partes que llevan el proceso y, si tiene lotes del mueble completo o no tiene
  -- despiece, una fila del mueble completo.
  cross join lateral (
    select pd.id as parte_id, pd.descripcion as parte, pd.piezas_por_mueble, pd.orden
    from public.partes_despiece pd
    where pd.planeacion_item_id = pi.id and pd.retirada_en is null
      and not (m.proceso = any (pd.procesos_omitidos))
    union all
    select null::uuid, null::text, 1::numeric, -1
    where exists (
        select 1 from lotes l2
        where l2.item_id = m.item_id and l2.proceso = m.proceso and l2.parte_id is null
      )
      or not exists (
        select 1 from public.partes_despiece pd
        where pd.planeacion_item_id = pi.id and pd.retirada_en is null
      )
  ) x
  left join lotes l on l.item_id = m.item_id and l.proceso = m.proceso
    and l.parte_id is not distinct from x.parte_id
  left join lateral (
    select sum(r.cantidad) filter (where r.aprobado) as aprobadas
    from public.revisiones_finales_calidad r
    where r.planeacion_item_id = pi.id
  ) rf on true
  where pi.tipo_registro = 'MO' and pi.parent_item_id is null
  order by 1, pi.item_code, m.proceso, x.orden;
$$;

revoke execute on function public.muebles_en_calidad() from public, anon;
grant execute on function public.muebles_en_calidad() to authenticated;

notify pgrst, 'reload schema';
