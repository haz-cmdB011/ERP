-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.ingest_planeacion_version p_archivo_origen
-- @verifica function-contiene public.ingest_planeacion_version pg_advisory_xact_lock
--
-- Quita la versión vieja de ingest_planeacion_version (7 argumentos, sin p_archivo_origen).
--
-- Al agregar p_archivo_origen (migración pm_por_archivo) se creó una función nueva en vez de reemplazar la
-- anterior, y las dos quedaron en la base. La app solo llama a la de 8 argumentos, que toma un candado por archivo
-- (pg_advisory_xact_lock) para que dos cargas simultáneas del mismo PM no creen versiones duplicadas. La vieja no
-- lo tiene y cualquier persona de Planeación podría llamarla por la API: cargar muchos PM seguidos, o dos personas
-- a la vez, no debe poder pasar por ahí. Sin uso en el código, las pruebas ni los scripts.
-- Idempotente: si ya no existe, no hace nada.

drop function if exists public.ingest_planeacion_version(text, text, text, date, date, uuid, jsonb);
