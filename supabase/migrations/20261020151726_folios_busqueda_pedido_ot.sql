-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.informes_calidad_estado.numero_pedido
-- @verifica column public.informes_calidad_estado.orden_trabajo

-- ============================================================================
-- Folios de calidad por PM u OT: la vista trae el número de PM y la O.T. del
-- pedido de cada informe, así el buscador filtra en la base (folio, PM u OT)
-- sin listar antes los informes de cada pedido.
--
-- Las columnas nuevas van al final, para no mover las existentes. El resto de la
-- definición es la de 20261007173153, con security_invoker y los permisos que ya
-- tenía la vista.
-- ============================================================================

create or replace view public.informes_calidad_estado
with (security_invoker = true) as
select
  ic.id,
  ic.folio,
  ic.aprobado,
  ic.elaborado_en,
  coalesce(
    pi.id is null
    or p.eliminado_en is not null
    or pi.eliminacion_solicitada_en is not null
    or pi.estado_revision = 'cancelado'
    or p.cancelado_en is not null,
    false
  ) as con_situacion,
  ic.categoria,
  p.numero_pedido,
  p.orden_trabajo
from public.informes_calidad ic
left join public.planeacion_items pi on pi.id = ic.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id;
