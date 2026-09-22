-- Vistas ligeras para paginar y contar folios en la base, en vez de traer
-- cientos de filas y clasificarlas en la aplicación. Reproducen exactamente
-- la clasificación que hacían las páginas (estadoDe / situacionDe).
-- security_invoker: se respetan las políticas RLS de las tablas de origen.

-- Folios de producción → grupo: activos | eliminados | cancelados.
create or replace view public.folios_produccion_estado
with (security_invoker = true) as
select
  f.id,
  f.folio,
  f.generado_en,
  case
    when pi.id is null then 'eliminados'                          -- borrado definitivo
    when p.eliminado_en is not null then 'eliminados'             -- pedido eliminado
    when pi.eliminacion_solicitada_en is not null then 'eliminados' -- ítem en papelera
    when pi.estado_revision = 'cancelado' or p.cancelado_en is not null then 'cancelados'
    else 'activos'
  end as grupo
from public.folios_produccion f
left join public.planeacion_items pi on pi.id = f.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id;

-- Informes de calidad → con_situacion: el ítem o su pedido están
-- cancelados/eliminados (o el ítem ya no está disponible).
create or replace view public.informes_calidad_estado
with (security_invoker = true) as
select
  ic.id,
  ic.folio,
  ic.aprobado,
  ic.elaborado_en,
  (
    pi.id is null
    or p.eliminado_en is not null
    or pi.eliminacion_solicitada_en is not null
    or pi.estado_revision = 'cancelado'
    or p.cancelado_en is not null
  ) as con_situacion
from public.informes_calidad ic
left join public.planeacion_items pi on pi.id = ic.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id;

revoke all on public.folios_produccion_estado from public, anon;
revoke all on public.informes_calidad_estado from public, anon;
grant select on public.folios_produccion_estado to authenticated;
grant select on public.informes_calidad_estado to authenticated;
