// Avance de cada PM visto desde Planeación: de sus ítems vigentes, cuántos ya se
// liberaron a Producción, cuántos están en revisión y cuántos se cancelaron.
// Cuenta la versión activa de los pedidos no eliminados; los ítems en la
// papelera de Producción no cuentan. (El avance que ve Producción, con la
// evaluación de Calidad, está en lib/resumen/avance-items.ts.)

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "@/lib/resumen/avance-items";

export interface ItemAvancePlan {
  pedidoId: string;
  liberado: boolean;
  revision: string | null;
}

export interface AvancePlan {
  // Ítems que siguen en pie (sin cancelar).
  vigentes: number;
  liberados: number;
  enRevision: number;
  cancelados: number;
}

export function avancePlanVacio(): AvancePlan {
  return { vigentes: 0, liberados: 0, enRevision: 0, cancelados: 0 };
}

export function agruparAvancePlaneacion(items: ItemAvancePlan[]): Map<string, AvancePlan> {
  const mapa = new Map<string, AvancePlan>();
  for (const item of items) {
    const a = mapa.get(item.pedidoId) ?? avancePlanVacio();
    if (item.revision === "cancelado") {
      a.cancelados += 1;
    } else {
      a.vigentes += 1;
      if (item.liberado) a.liberados += 1;
      if (item.revision === "en_revision") a.enRevision += 1;
    }
    mapa.set(item.pedidoId, a);
  }
  return mapa;
}

// Avance de una O.T.: suma el de todos sus PM.
export function sumarAvancePlan(mapa: ReadonlyMap<string, AvancePlan>, pedidoIds: string[]): AvancePlan {
  const suma = avancePlanVacio();
  for (const id of pedidoIds) {
    const a = mapa.get(id);
    if (!a) continue;
    suma.vigentes += a.vigentes;
    suma.liberados += a.liberados;
    suma.enRevision += a.enRevision;
    suma.cancelados += a.cancelados;
  }
  return suma;
}

interface FilaItem {
  estado_liberacion: string;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: { eliminado_en: string | null; eliminado_definitivo_en: string | null } | null;
  } | null;
}

// Ante un error de consulta devuelve lo que alcanzó a leer: es un resumen y no
// debe tumbar la pantalla donde se muestra.
export async function avancePlaneacionPorPedido(supabase: SupabaseClient): Promise<Map<string, AvancePlan>> {
  const filas = await paginar<FilaItem & { id: string }>((desde, hasta) =>
    supabase
      .from("planeacion_items")
      .select(
        "id, estado_liberacion, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( eliminado_en, eliminado_definitivo_en ) )"
      )
      .eq("pedido_versiones.es_version_activa", true)
      .order("id")
      .range(desde, hasta)
      .returns<(FilaItem & { id: string })[]>()
  );

  const items: ItemAvancePlan[] = [];
  for (const f of filas) {
    const pedido = f.pedido_versiones?.pedidos;
    if (!f.pedido_versiones || !pedido) continue;
    if (pedido.eliminado_en || pedido.eliminado_definitivo_en) continue;
    if (f.eliminacion_solicitada_en) continue;
    items.push({
      pedidoId: f.pedido_versiones.pedido_id,
      liberado: f.estado_liberacion === "enviado_a_produccion",
      revision: f.estado_revision,
    });
  }
  return agruparAvancePlaneacion(items);
}
