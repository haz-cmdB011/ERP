import type { SupabaseClient } from "@supabase/supabase-js";
import type { AsignacionTiempo } from "./linea-tiempo";

// Ids por consulta .in(): más largos pasarían el límite de tamaño de la URL.
const LOTE = 100;

// Ítems (de los dados) que ya tienen al menos un informe de Calidad.
export async function idsConInformeDeCalidad(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<Set<string>> {
  const lotes: string[][] = [];
  for (let i = 0; i < itemIds.length; i += LOTE) lotes.push(itemIds.slice(i, i + LOTE));
  const respuestas = await Promise.all(
    lotes.map((ids) =>
      supabase
        .from("informes_calidad")
        .select("planeacion_item_id")
        .in("planeacion_item_id", ids)
        .returns<{ planeacion_item_id: string }[]>()
    )
  );
  const conInforme = new Set<string>();
  for (const { data } of respuestas) for (const f of data ?? []) conInforme.add(f.planeacion_item_id);
  return conInforme;
}

// Asignaciones de un PM (todas las versiones; el cálculo solo usa las de los
// ítems que se le pasan).
export async function asignacionesDePedido(
  supabase: SupabaseClient,
  pedidoId: string
): Promise<AsignacionTiempo[]> {
  const { data } = await supabase
    .from("asignaciones_produccion_resumen")
    .select("planeacion_item_id, proceso, cantidad, entregado, cancelada_en")
    .eq("pedido_id", pedidoId)
    .returns<AsignacionTiempo[]>();
  return data ?? [];
}
