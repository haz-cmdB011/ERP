// Ajuste `verificacion_produccion` (tabla ajustes_flujo): si el trabajador de
// Producción tiene que verificar ("mandar a Calidad") las entregas antes de que
// Calidad las evalúe (la preaprobación se hace al registrar la entrega). Hoy
// está ENCENDIDO (migración entrega_con_preaprobacion); apagado, Calidad evalúa
// todo ítem liberado. Cómo cambiarlo: docs/operacion.md.

import type { SupabaseClient } from "@supabase/supabase-js";

// Si no se puede leer el ajuste (la migración aún no está en la base, o falla la
// consulta) se asume el flujo anterior, con verificación: es el que la base
// sigue exigiendo en ese caso.
export async function verificacionProduccionActiva(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("ajustes_flujo")
    .select("activo")
    .eq("clave", "verificacion_produccion")
    .maybeSingle<{ activo: boolean }>();
  if (error || !data) return true;
  return data.activo;
}

// Ajuste `revision_final`: la revisión del mueble completo antes de mandarlo a
// obra (migración revision_final_calidad). Se creó APAGADO hasta que Calidad
// confirme que así trabaja. Si no se puede leer, se asume apagado: la base
// tampoco deja registrarla.
export async function revisionFinalActiva(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase
    .from("ajustes_flujo")
    .select("activo")
    .eq("clave", "revision_final")
    .maybeSingle<{ activo: boolean }>();
  if (error || !data) return false;
  return data.activo;
}
