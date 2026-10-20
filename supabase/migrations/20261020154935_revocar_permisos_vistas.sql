-- Las vistas de public solo se leen. El rol authenticated tenía INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES y TRIGGER sobre ocho de ellas, y anon tenía todos los permisos
-- sobre seis. Se quitan: authenticated se queda con SELECT y anon sin nada.
-- Las vistas usan security_invoker y ninguna es actualizable, así que esas escrituras
-- nunca habrían funcionado: los permisos sobraban. (informes_calidad_estado ya quedó
-- así en 20261020154348.)

revoke insert, update, delete, truncate, references, trigger on
  public.folios_produccion_estado,
  public.recibos_resumen,
  public.asignaciones_produccion_resumen,
  public.entregas_por_verificar,
  public.lotes_calidad,
  public.rechazos_calidad,
  public.rechazos_revision_final,
  public.revision_final_muebles
from authenticated;

revoke all on
  public.asignaciones_produccion_resumen,
  public.entregas_por_verificar,
  public.lotes_calidad,
  public.rechazos_calidad,
  public.rechazos_revision_final,
  public.revision_final_muebles
from anon;
