// Avance de los ítems por pedido (cuántos se han liberado a producción y
// cuántos evaluó Calidad), para los números del inicio de cada área y las
// etiquetas de estado de las listas. Solo cuenta lo vigente: versión activa de
// pedidos no eliminados ni cancelados, sin ítems cancelados ni con eliminación
// solicitada.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface AvancePedido {
  total: number;
  liberados: number;
  porLiberar: number;
  // Liberados con al menos un informe de Calidad / sin ninguno.
  evaluados: number;
  porEvaluar: number;
}

export interface ItemAvance {
  id: string;
  pedidoId: string;
  liberado: boolean;
}

export function avanceVacio(): AvancePedido {
  return { total: 0, liberados: 0, porLiberar: 0, evaluados: 0, porEvaluar: 0 };
}

export function agruparAvance(
  items: ItemAvance[],
  idsConInforme: ReadonlySet<string>
): Map<string, AvancePedido> {
  const mapa = new Map<string, AvancePedido>();
  for (const item of items) {
    const a = mapa.get(item.pedidoId) ?? avanceVacio();
    a.total += 1;
    if (item.liberado) {
      a.liberados += 1;
      if (idsConInforme.has(item.id)) a.evaluados += 1;
      else a.porEvaluar += 1;
    } else {
      a.porLiberar += 1;
    }
    mapa.set(item.pedidoId, a);
  }
  return mapa;
}

export function sumarAvance(mapa: Map<string, AvancePedido>): AvancePedido {
  const suma = avanceVacio();
  for (const a of mapa.values()) {
    suma.total += a.total;
    suma.liberados += a.liberados;
    suma.porLiberar += a.porLiberar;
    suma.evaluados += a.evaluados;
    suma.porEvaluar += a.porEvaluar;
  }
  return suma;
}

// Avance de una O.T.: suma el de todos sus PM.
export function sumarAvanceDe(mapa: Map<string, AvancePedido>, pedidoIds: string[]): AvancePedido {
  const parcial = new Map<string, AvancePedido>();
  for (const id of pedidoIds) {
    const a = mapa.get(id);
    if (a) parcial.set(id, a);
  }
  return sumarAvance(parcial);
}

// PostgREST devuelve máximo 1000 filas por consulta: se pide por páginas.
const PAGINA = 1000;

async function paginar<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await pedir(desde, desde + PAGINA - 1);
    if (!data) break;
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas;
}

interface FilaItem {
  id: string;
  estado_liberacion: string;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: {
      eliminado_en: string | null;
      eliminado_definitivo_en: string | null;
      cancelado_en: string | null;
    } | null;
  } | null;
}

// Si `conCalidad` es falso no se consultan los informes (Producción no los usa).
// Ante un error de consulta devuelve lo que alcanzó a leer: es un resumen, no
// debe tumbar la pantalla.
export async function avancePorPedido(
  supabase: SupabaseClient,
  { conCalidad }: { conCalidad: boolean }
): Promise<Map<string, AvancePedido>> {
  const filas = await paginar<FilaItem>((desde, hasta) =>
    supabase
      .from("planeacion_items")
      .select(
        "id, estado_liberacion, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( eliminado_en, eliminado_definitivo_en, cancelado_en ) )"
      )
      .eq("pedido_versiones.es_version_activa", true)
      .order("id")
      .range(desde, hasta)
      .returns<FilaItem[]>()
  );

  const items: ItemAvance[] = [];
  for (const f of filas) {
    const pedido = f.pedido_versiones?.pedidos;
    if (!f.pedido_versiones || !pedido) continue;
    if (pedido.eliminado_en || pedido.eliminado_definitivo_en || pedido.cancelado_en) continue;
    if (f.estado_revision === "cancelado" || f.eliminacion_solicitada_en) continue;
    items.push({
      id: f.id,
      pedidoId: f.pedido_versiones.pedido_id,
      liberado: f.estado_liberacion === "enviado_a_produccion",
    });
  }

  const conInforme = new Set<string>();
  if (conCalidad) {
    const informes = await paginar<{ planeacion_item_id: string }>((desde, hasta) =>
      supabase
        .from("informes_calidad")
        .select("planeacion_item_id")
        .order("id")
        .range(desde, hasta)
        .returns<{ planeacion_item_id: string }[]>()
    );
    for (const i of informes) conInforme.add(i.planeacion_item_id);
  }

  return agruparAvance(items, conInforme);
}

// Etiqueta de estado de un pedido según su avance.
export type EstadoAvance = "sin-items" | "sin-liberar" | "en-proceso" | "liberado";

export function estadoLiberacion(a: AvancePedido | undefined): EstadoAvance {
  if (!a || a.total === 0) return "sin-items";
  if (a.liberados === 0) return "sin-liberar";
  if (a.porLiberar === 0) return "liberado";
  return "en-proceso";
}

export type EstadoCalidad = "sin-liberados" | "sin-evaluar" | "en-proceso" | "evaluado";

export function estadoCalidad(a: AvancePedido | undefined): EstadoCalidad {
  if (!a || a.liberados === 0) return "sin-liberados";
  if (a.evaluados === 0) return "sin-evaluar";
  if (a.porEvaluar === 0) return "evaluado";
  return "en-proceso";
}
