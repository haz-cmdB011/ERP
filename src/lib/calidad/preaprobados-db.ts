// Qué muebles tienen piezas que Producción ya preaprobó (entregas verificadas y
// vigentes del equipo), para que Calidad vea solo esos. Lanza ErrorLectura si
// falla la lectura: una lista incompleta escondería muebles reales.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";

// `pedidoIds` acota la lectura a unos pedidos (la O.T., el pedido abierto); sin él
// se leen todos (el panel de Calidad). Son pocos ids: van en la URL.
export async function cargarMueblesPreaprobados(
  supabase: SupabaseClient,
  pedidoIds?: string[]
): Promise<Set<string>> {
  if (pedidoIds && pedidoIds.length === 0) return new Set();
  const filas = await paginarTodo<{ planeacion_item_id: string | null }>(
    (desde, hasta) => {
      let consulta = supabase.from("lotes_calidad").select("planeacion_item_id, entrega_id").gt("cantidad", 0);
      if (pedidoIds) consulta = consulta.in("pedido_id", pedidoIds);
      return consulta.order("entrega_id").range(desde, hasta).returns<{ planeacion_item_id: string | null }[]>();
    },
    { contexto: "las entregas preaprobadas por Producción" }
  );
  const muebles = new Set<string>();
  for (const f of filas) if (f.planeacion_item_id) muebles.add(f.planeacion_item_id);
  return muebles;
}
