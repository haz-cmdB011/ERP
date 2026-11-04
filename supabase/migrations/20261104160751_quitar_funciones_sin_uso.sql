-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica sin-function public.guardar_procesos_parte
-- @verifica sin-function public.crear_asignaciones_por_partes

-- Funciones que ya nadie llama:
--   * guardar_procesos_parte: solo lanzaba "ya no se usa" desde rutas_por_parte (cada parte
--     tiene su propia ruta).
--   * crear_asignaciones_por_partes: la reemplazó crear_asignacion_produccion con p_parte_id.
-- La columna partes_despiece.procesos_omitidos se queda: piezas_listas_revision_final aún la lee.
drop function if exists public.guardar_procesos_parte(uuid, text[]);
drop function if exists public.crear_asignaciones_por_partes(uuid, uuid, text, numeric, date, text, text, uuid, uuid[]);
