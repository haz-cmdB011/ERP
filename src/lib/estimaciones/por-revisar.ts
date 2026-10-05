// Contadores ligeros de recibos por estado (solo el número, sin traer filas)
// para los avisos del menú y las tarjetas del panel de Estimaciones. La RLS
// decide qué cuenta cada quien: el personal de Estimaciones ve todos; el
// maquilador, solo los suyos.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoRecibo } from "./recibos-db";

export async function contarRecibosPorEstado(
  supabase: SupabaseClient,
  estado: EstadoRecibo
): Promise<number> {
  const [acabadosArmado, electrificacion] = await Promise.all([
    supabase.from("recibos").select("id", { count: "exact", head: true }).eq("estado", estado),
    supabase
      .from("recibos_electrificacion")
      .select("id", { count: "exact", head: true })
      .eq("estado", estado),
  ]);
  return (acabadosArmado.count ?? 0) + (electrificacion.count ?? 0);
}

// Recibos de maquiladores esperando que Estimaciones acepte o modifique su precio.
export function contarPorRevisar(supabase: SupabaseClient): Promise<number> {
  return contarRecibosPorEstado(supabase, "pendiente");
}
