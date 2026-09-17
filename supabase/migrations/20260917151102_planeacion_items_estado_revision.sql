-- ============================================================================
-- Estado de revisión por ítem: 'en_revision' o 'cancelado' (null = normal).
-- Lo puede colocar cualquiera con is_planeacion() (trabajador, administrador
-- o desarrollador de Planeación) — ya es exactamente el permiso que exige
-- planeacion_update_planeacion_items, así que no hace falta ninguna
-- política ni función nueva.
--
-- Producción ya tiene su propio trigger (protect_planeacion_items_columns_
-- produccion) que solo deja tocar eliminacion_solicitada_en/por cuando
-- quien edita es de Producción y no de Planeación: al ser una columna
-- nueva, automáticamente queda protegida igual — Producción la ve pero no
-- puede cambiarla.
-- ============================================================================
alter table public.planeacion_items
  add column estado_revision text
  check (estado_revision in ('en_revision', 'cancelado'));
