-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.incidencias_calidad.fecha

-- ============================================================================
-- Fecha de la incidencia. Primero se decidió llevarlas sin fecha, pero el
-- equipo necesita verlas por semana (como la hoja ESTATUS del Excel), así que
-- se agrega. Es la fecha del reporte en el Excel; nula si el Excel no la trae
-- o la trae mal escrita. Las semanas se calculan en la app (ISO: de lunes a
-- domingo; la semana 1 es la que contiene el primer jueves del año).
-- ============================================================================

alter table public.incidencias_calidad add column fecha date;

create index idx_incidencias_calidad_fecha on public.incidencias_calidad (fecha);
