-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica constraint public.renglones_electrificacion.renglones_electrificacion_pedido_id_fkey

-- Recuperada del historial de Supabase (se aplicó directamente en la base sin
-- archivo en el repo). Al borrar un pedido, los renglones de Electrificación que
-- lo referencian (renglones_electrificacion.pedido_id) quedan con pedido_id nulo
-- en vez de impedir el borrado.
alter table public.renglones_electrificacion
  drop constraint renglones_electrificacion_pedido_id_fkey,
  add constraint renglones_electrificacion_pedido_id_fkey
    foreign key (pedido_id) references public.pedidos(id) on delete set null;
