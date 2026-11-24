-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.limpiar_avisos
-- @verifica index public.idx_avisos_creado_en
--
-- Limpieza de avisos viejos. La campanita solo muestra los últimos 30 días y el celular, los últimos 15
-- minutos, así que un aviso de más de 60 días ya no lo ve nadie: se borra (sus marcas de "leído" se van
-- con él por la llave foránea). Las claves de los recordatorios llevan el día (`recibos_sin_revisar:2026-11-24`),
-- así que borrar uno viejo nunca lo vuelve a generar.
--
-- No usa pg_cron: la llama el servidor junto con los recordatorios (`despacharRecordatorios`, a lo más cada
-- 10 minutos por instancia). El índice por fecha hace que, cuando no hay nada viejo, cueste una búsqueda y no
-- recorrer la tabla.

create index if not exists idx_avisos_creado_en on public.avisos (creado_en);

-- Borra los avisos de más de `p_dias` días (mínimo 31, para no quitar nada que la campanita aún muestre).
-- Devuelve cuántos borró.
create or replace function public.limpiar_avisos(p_dias integer default 60)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borrados integer;
begin
  delete from public.avisos
   where creado_en < now() - make_interval(days => greatest(coalesce(p_dias, 60), 31));
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;
revoke execute on function public.limpiar_avisos(integer) from public, anon, authenticated;

-- Para deshacer:
--   drop function public.limpiar_avisos(integer); drop index public.idx_avisos_creado_en;
