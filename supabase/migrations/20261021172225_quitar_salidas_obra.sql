-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica sin-function public.registrar_salida_obra
-- @verifica sin-function public.anular_salida_obra
-- @verifica sin-function public.auditar_salidas_obra

-- ============================================================================
-- Quita la salida a obra (migración salidas_obra): se probó y no se va a usar; el
-- flujo del mueble termina en el pago al maquilador. La tabla nunca tuvo registros
-- (ni en la auditoría). El trigger y la política se van con la tabla.
-- ============================================================================

drop table if exists public.salidas_obra;
drop function if exists public.registrar_salida_obra(uuid, numeric, date, text);
drop function if exists public.anular_salida_obra(uuid, text);
drop function if exists public.auditar_salidas_obra();
