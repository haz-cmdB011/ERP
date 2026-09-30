-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica index public.idx_renglones_electrificacion_pedido_modelo_norm
-- @verifica index public.idx_pedidos_proyecto

-- ============================================================================
-- Índices de rendimiento para el generador de recibos.
--
-- Origen: avisos de rendimiento de Supabase (llaves foráneas sin índice) y las
-- consultas reales del generador. Hoy las tablas son chicas y todo responde en
-- menos de 1 ms; esto es para que siga así cuando crezcan los recibos.
--
--  * renglones_electrificacion (pedido_id, modelo normalizado): es exactamente el
--    filtro de cantidad_registrada_modelo, que se llama una vez por modelo al
--    listar los modelos de una OT y en el trigger de conciliación con el PM. El
--    índice parcial anterior solo cubría pedido_id.
--  * pedidos.proyecto_id: llave foránea sin índice.
--
-- Las discrepancias (discrepancias_pm) ya traen sus propios índices desde
-- 20260930191049_control_pm_recibos.
--
-- No se tocan a propósito: las llaves "por" (creado_por, revisado_por,
-- pagado_por...) hacia usuarios (nunca se consultan ni se borran usuarios por
-- ahí) ni los índices "sin uso" (con tan poco tráfico todos salen sin uso; no
-- es señal de que sobren).
-- ============================================================================

-- Índice sobre una expresión con norm_modelo: si esa función cambia (como en
-- 20260930194232_reglas_modelo_iluminacion), hay que reconstruirlo con
-- `reindex index public.idx_renglones_electrificacion_pedido_modelo_norm;`
-- o dejaría de encontrar los renglones.
create index if not exists idx_renglones_electrificacion_pedido_modelo_norm
  on public.renglones_electrificacion (pedido_id, (public.norm_modelo(modelo)))
  where pedido_id is not null;

create index if not exists idx_pedidos_proyecto
  on public.pedidos (proyecto_id);
