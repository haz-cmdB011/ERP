-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica index public.idx_entregas_produccion_foto_path_unica

-- Una entrega por foto. La ruta de la foto sale de la "clave de envío" que manda el celular
-- (src/app/api/produccion/entregas/route.ts): cuando una captura hecha sin red se reenvía
-- al volver la conexión, o la red se corta justo después de que el servidor la guardó y la
-- respuesta no llega, el reintento usa la misma ruta. Este índice garantiza que ese
-- reintento no pueda registrar la entrega dos veces, ni siquiera si llegan dos a la vez.
--
-- Hoy no hay duplicados (cada ruta lleva un UUID propio), así que el índice se crea sin
-- tocar datos.

create unique index if not exists idx_entregas_produccion_foto_path_unica
  on public.entregas_produccion (foto_path);
