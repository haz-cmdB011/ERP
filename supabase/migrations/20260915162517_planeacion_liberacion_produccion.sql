-- ============================================================================
-- Banderas de validación de Planeación, fases de taller y estado de
-- liberación a Producción por ítem (Filtros Rápidos de Liberación + Hoja
-- de Viajero). Todas las columnas nuevas son nullable / con default seguro:
-- las versiones ya ingeridas quedan como "sin evaluar" (null) / "pendiente".
-- ============================================================================

alter table public.planeacion_items
  add column ingenieria boolean,
  add column lista_insumos text,
  add column suministro_mats boolean,
  add column fases_taller jsonb not null default '{}'::jsonb,
  add column estado_liberacion text not null default 'pendiente',
  add column liberado_en timestamptz,
  add column liberado_por uuid references auth.users(id);

alter table public.planeacion_items
  add constraint planeacion_items_estado_liberacion_check
  check (estado_liberacion in ('pendiente', 'enviado_a_produccion'));

create index idx_planeacion_items_estado_liberacion
  on public.planeacion_items (pedido_version_id, estado_liberacion);
