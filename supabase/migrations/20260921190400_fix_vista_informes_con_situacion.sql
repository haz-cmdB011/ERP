-- informes_calidad_estado.con_situacion devolvía NULL (en vez de false) cuando
-- el ítem no tenía estado_revision, porque `estado_revision = 'cancelado'` es
-- NULL y contagia todo el OR. Con coalesce queda siempre true/false.
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
  ) as con_situacion
from public.informes_calidad ic
left join public.planeacion_items pi on pi.id = ic.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id;
