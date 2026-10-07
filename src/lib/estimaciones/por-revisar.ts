// Contadores ligeros de recibos por estado (solo el número, sin traer filas)
// para los avisos del menú y las tarjetas del panel de Estimaciones. La RLS
// decide qué cuenta cada quien: el personal de Estimaciones ve todos; el
// maquilador, solo los suyos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorLectura, paginarTodo } from "@/lib/supabase/paginar";
import type { RefRecibo } from "./aceptacion-masiva";
import type { EstadoRecibo } from "./recibos-db";
import type { TipoCualquierRecibo } from "./revision-db";

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
  // Un conteo fallido no es "cero recibos": quien lo pinta lo atrapa con `.catch`.
  const fallo = acabadosArmado.error ?? electrificacion.error;
  if (fallo) throw new ErrorLectura(`No se pudo contar los recibos: ${fallo.message}`);
  return (acabadosArmado.count ?? 0) + (electrificacion.count ?? 0);
}

// Todos los recibos pendientes de revisión (solo tipo y folio), de todas las
// áreas de recibos. Lanza si falla la lectura.
export async function listarPendientesDeRevision(supabase: SupabaseClient): Promise<RefRecibo[]> {
  const [aa, el] = await Promise.all([
    paginarTodo<{ tipo: TipoCualquierRecibo; folio: string }>(
      (desde, hasta) =>
        supabase
          .from("recibos")
          .select("tipo, folio")
          .eq("estado", "pendiente")
          .order("id")
          .range(desde, hasta)
          .returns<{ tipo: TipoCualquierRecibo; folio: string }[]>(),
      { contexto: "los recibos por revisar" }
    ),
    paginarTodo<{ folio: string }>(
      (desde, hasta) =>
        supabase
          .from("recibos_electrificacion")
          .select("folio")
          .eq("estado", "pendiente")
          .order("id")
          .range(desde, hasta)
          .returns<{ folio: string }[]>(),
      { contexto: "los recibos de Electrificación por revisar" }
    ),
  ]);
  return [
    ...aa.map((r) => ({ tipo: r.tipo, folio: r.folio })),
    ...el.map((r) => ({ tipo: "electrificacion" as const, folio: r.folio })),
  ];
}

// Recibos de maquiladores esperando que Estimaciones acepte o modifique su precio.
export function contarPorRevisar(supabase: SupabaseClient): Promise<number> {
  return contarRecibosPorEstado(supabase, "pendiente");
}
