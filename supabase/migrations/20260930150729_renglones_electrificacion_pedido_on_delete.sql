-- ============================================================================
-- Electrificación — borrar un pedido con recibos.
--
-- renglones_electrificacion.pedido_id (20260929120000) se creó sin ON DELETE,
-- así que Postgres no dejaba borrar un pedido que tuviera renglones de
-- recibos de Electrificación ("still referenced from table
-- renglones_electrificacion").
--
-- SET NULL y no CASCADE: los recibos son registros de pago a maquiladores y
-- deben conservarse. El renglón mantiene modelo, cantidades e importes, y el
-- recibo su OT como texto; solo se pierde el enlace al PM borrado (igual que
-- cargas_archivo.pedido_id).
-- ============================================================================

alter table public.renglones_electrificacion
  drop constraint renglones_electrificacion_pedido_id_fkey,
  add constraint renglones_electrificacion_pedido_id_fkey
    foreign key (pedido_id) references public.pedidos(id) on delete set null;
