-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.incidencias_calidad.cerrado_en
-- @verifica function public.incidencias_calidad_fija_cierre
-- @verifica trigger public.incidencias_calidad.incidencias_calidad_fija_cierre
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_motivo_largo_check
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_proyecto_largo_check
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_auditor_largo_check
-- @verifica constraint public.incidencias_calidad.incidencias_calidad_listas_check

-- ============================================================================
-- Captura de no conformidades desde la app (ya no solo desde el Excel).
--
-- 1. cerrado_en: cuándo se cerró. Lo fija la base sola, así que nadie lo teclea
--    ni lo olvida: al pasar de abierto a cerrado se llena con la hora actual, y
--    al reabrir se borra. Lo importado del Excel que ya venía cerrado queda en
--    nulo (el Excel no dice cuándo se cerró). Una captura manual que nace
--    cerrada sí lo lleva.
--
-- 2. Topes de tamaño: la pantalla de captura los valida, pero la base es la
--    que no debe aceptar un texto de miles de caracteres ni listas enormes,
--    venga la escritura de donde venga. Todo lo ya cargado cabe de sobra.
-- ============================================================================

alter table public.incidencias_calidad add column cerrado_en timestamptz;

alter table public.incidencias_calidad
  add constraint incidencias_calidad_motivo_largo_check check (char_length(motivo) <= 300),
  add constraint incidencias_calidad_proyecto_largo_check check (char_length(proyecto) <= 200),
  add constraint incidencias_calidad_auditor_largo_check check (char_length(auditor) <= 100),
  add constraint incidencias_calidad_listas_check check (
    cardinality(muebles) <= 30 and cardinality(areas) <= 20 and cardinality(areas_reporta) <= 20
  );

create function public.incidencias_calidad_fija_cierre()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'abierto' then
    new.cerrado_en := null;
  elsif new.cerrado_en is null then
    if tg_op = 'UPDATE' then
      if old.estado = 'abierto' then
        new.cerrado_en := now();
      end if;
    elsif new.origen_importacion is null then
      new.cerrado_en := now();
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.incidencias_calidad_fija_cierre() from public, anon, authenticated;

create trigger incidencias_calidad_fija_cierre
  before insert or update on public.incidencias_calidad
  for each row execute function public.incidencias_calidad_fija_cierre();
