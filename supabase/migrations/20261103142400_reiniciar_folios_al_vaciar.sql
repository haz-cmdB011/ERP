-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.reiniciar_folio_si_vacio
-- @verifica trigger public.informes_calidad.trg_reiniciar_folio_borrado
-- @verifica trigger public.informes_calidad.trg_reiniciar_folio_truncate
-- @verifica trigger public.folios_produccion.trg_reiniciar_folio_borrado
-- @verifica trigger public.folios_produccion.trg_reiniciar_folio_truncate
-- @verifica trigger public.revisiones_finales_calidad.trg_reiniciar_folio_borrado
-- @verifica trigger public.revisiones_finales_calidad.trg_reiniciar_folio_truncate
--
-- Los folios CAL- (informes_calidad), PRD- (folios_produccion) y FIN-
-- (revisiones_finales_calidad) salen de secuencias que NO se reinician solas:
-- al vaciar los datos la tabla quedaba en cero pero el siguiente folio seguía
-- donde se quedó (CAL-000029, PRD-000263...). Ahora, cuando una de esas tablas
-- se queda sin ninguna fila (DELETE) o se vacía con TRUNCATE, su secuencia
-- vuelve a empezar y el siguiente folio es el 000001.
--
-- Un folio conservado (pedido eliminado con folios de Calidad, folios PRD que
-- sobreviven a su ítem) mantiene la tabla con filas, así que en la operación
-- normal nunca se reinicia: solo cuando de verdad no queda ningún folio.
-- Los recibos de Estimaciones no usan secuencia (el folio lo escribe el
-- maquilador), no hay nada que reiniciar ahí.

create or replace function public.reiniciar_folio_si_vacio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vacia boolean;
begin
  -- security definer: el chequeo no depende de lo que el usuario alcance a ver con RLS.
  execute format('select not exists (select 1 from %s)', tg_relid::regclass) into v_vacia;
  if v_vacia then
    perform setval(tg_argv[0]::regclass, 1, false);
  end if;
  return null;
end;
$$;

revoke execute on function public.reiniciar_folio_si_vacio() from public, anon, authenticated;

create trigger trg_reiniciar_folio_borrado
  after delete on public.informes_calidad
  for each statement execute function public.reiniciar_folio_si_vacio('public.informes_calidad_folio_seq');
create trigger trg_reiniciar_folio_truncate
  after truncate on public.informes_calidad
  for each statement execute function public.reiniciar_folio_si_vacio('public.informes_calidad_folio_seq');

create trigger trg_reiniciar_folio_borrado
  after delete on public.folios_produccion
  for each statement execute function public.reiniciar_folio_si_vacio('public.folios_produccion_folio_seq');
create trigger trg_reiniciar_folio_truncate
  after truncate on public.folios_produccion
  for each statement execute function public.reiniciar_folio_si_vacio('public.folios_produccion_folio_seq');

create trigger trg_reiniciar_folio_borrado
  after delete on public.revisiones_finales_calidad
  for each statement execute function public.reiniciar_folio_si_vacio('public.revisiones_finales_folio_seq');
create trigger trg_reiniciar_folio_truncate
  after truncate on public.revisiones_finales_calidad
  for each statement execute function public.reiniciar_folio_si_vacio('public.revisiones_finales_folio_seq');

-- Reinicio de lo que ya quedó vacío antes de esta migración.
do $$
begin
  if not exists (select 1 from public.informes_calidad) then
    perform setval('public.informes_calidad_folio_seq', 1, false);
  end if;
  if not exists (select 1 from public.folios_produccion) then
    perform setval('public.folios_produccion_folio_seq', 1, false);
  end if;
  if not exists (select 1 from public.revisiones_finales_calidad) then
    perform setval('public.revisiones_finales_folio_seq', 1, false);
  end if;
end;
$$;
