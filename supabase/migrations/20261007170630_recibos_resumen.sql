-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.recibos_resumen
-- @verifica column public.recibos_resumen.total_aceptado
-- @verifica column public.recibos_resumen.num_pendientes

-- ============================================================================
-- Resumen de recibos para los listados (Registro, Mis recibos, Por revisar).
--
-- Antes cada listado bajaba todos los recibos con TODOS sus renglones anidados
-- solo para sumar totales en el navegador. Esta vista devuelve una fila por
-- recibo (Acabados, Armado y Electrificación juntos) con el número de renglones,
-- cuántos siguen sin decidir y los totales propuesto y aceptado ya calculados.
--
-- security_invoker: respeta el RLS de recibos y renglones. El personal de
-- Estimaciones ve todos; el maquilador, solo los suyos. La app usa la vista si
-- existe y, si no, cae a la lectura anterior.
-- ============================================================================

create or replace view public.recibos_resumen
with (security_invoker = true) as
select
  r.id,
  r.tipo::text as tipo,
  r.estado::text as estado,
  r.folio,
  r.fecha_recibo,
  r.contratista,
  r.obra,
  r.ot,
  r.prioridad::text as prioridad,
  r.creado_en,
  count(x.id)::integer as num_renglones,
  (count(x.id) filter (where x.decision is null))::integer as num_pendientes,
  coalesce(sum(x.cantidad * x.pu_propuesto), 0)::numeric as total_propuesto,
  coalesce(sum(x.cantidad * x.pu_aceptado), 0)::numeric as total_aceptado
from public.recibos r
left join public.renglones x on x.recibo_id = r.id
group by r.id
union all
select
  r.id,
  'electrificacion'::text as tipo,
  r.estado::text as estado,
  r.folio,
  r.fecha_recibo,
  r.contratista,
  r.obra,
  r.ot,
  r.prioridad::text as prioridad,
  r.creado_en,
  count(x.id)::integer as num_renglones,
  (count(x.id) filter (where x.decision is null))::integer as num_pendientes,
  coalesce(sum(x.cantidad * x.pu_propuesto), 0)::numeric as total_propuesto,
  coalesce(sum(x.cantidad * x.pu_aceptado), 0)::numeric as total_aceptado
from public.recibos_electrificacion r
left join public.renglones_electrificacion x on x.recibo_id = r.id
group by r.id;

-- Solo personal con sesión: sin acceso anónimo.
revoke all on public.recibos_resumen from anon;
grant select on public.recibos_resumen to authenticated;
