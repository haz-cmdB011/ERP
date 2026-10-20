-- Recuperada de supabase_migrations.schema_migrations: la base la tenía aplicada sin
-- archivo en el repo. El texto es el que se aplicó.
-- @verifica column public.incidencias_calidad.descripcion
-- @verifica column public.incidencias_calidad.solucion
-- @verifica column public.incidencias_calidad.seguimiento
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_descripcion_largo_check
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_solucion_largo_check
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_seguimiento_largo_check

alter table public.incidencias_calidad
  add column descripcion text,
  add column solucion text,
  add column seguimiento text;

alter table public.incidencias_calidad
  add constraint incidencias_calidad_descripcion_largo_check check (char_length(descripcion) <= 4000),
  add constraint incidencias_calidad_solucion_largo_check check (char_length(solucion) <= 4000),
  add constraint incidencias_calidad_seguimiento_largo_check check (char_length(seguimiento) <= 4000);
