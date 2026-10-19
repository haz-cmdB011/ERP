-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.incidencias_calidad.auditor

-- ============================================================================
-- Quién auditó. La hoja ESTATUS del Excel reparte los reportes por semana y por
-- auditor (la persona de Calidad que levantó el reporte); el tablero de
-- incidencias por día, semana, mes y año necesita ese dato. Texto libre
-- (nombre de la persona); nulo si no consta.
-- ============================================================================

alter table public.incidencias_calidad add column auditor text;
