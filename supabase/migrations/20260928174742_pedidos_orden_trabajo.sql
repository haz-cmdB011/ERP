-- ============================================================================
-- Planeación — Orden de Trabajo.
--
-- Varios PM pueden pertenecer a una misma Orden de Trabajo. Se distinguen
-- con un número al inicio: "<N>PM<ORDEN DE TRABAJO>-<AÑO>" (ej. "1PM134-26",
-- "2PM134-26"). Cada uno es un pedido distinto (numero_pedido distinto, así
-- que la ingestión ya no los trata como versiones del mismo PM) y la OT
-- "134-26" los agrupa. Un PM sin número al inicio ("PM134-26") también
-- pertenece a la OT 134-26.
--
-- Columna generada: se calcula sola al ingerir, sin tocar
-- ingest_planeacion_version. Espejo de ordenDeTrabajo() en
-- src/lib/planeacion/numero-pm.ts.
-- ============================================================================

alter table public.pedidos
  add column orden_trabajo text
  generated always as (substring(numero_pedido from '(?i)PM\s*([0-9]+-[0-9]{2})')) stored;

create index idx_pedidos_orden_trabajo on public.pedidos (orden_trabajo);
