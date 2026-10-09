// Estado de evaluación de un ítem en Calidad y lo que se puede hacer con varios
// a la vez. Solo funciones puras (la pantalla y las pruebas comparten la misma
// lógica).

import { estadoMueble, type ResumenLotes } from "./lotes";

// Umbral de días sin evaluar para marcar un ítem como "antiguo".
export const DIAS_ANTIGUEDAD_ALERTA = 3;

export type EstadoCalidad = "aprobado" | "no_aprobado" | "sin_evaluar" | "cancelado";

export interface ItemEvaluable {
  id: string;
  tipo_registro: "MO" | "FU";
  parent_item_id: string | null;
  estadoRevision: string | null;
  liberadoEn: string | null;
  // La base deja evaluarlo: Producción ya preaprobó piezas de este mueble (o
  // del mueble padre, si es componente), o la verificación de Producción está
  // apagada (ajustes_flujo.verificacion_produccion).
  evaluable: boolean;
  // Historial de informes del ítem: [0] es el más reciente.
  informes: { aprobado: boolean }[];
  // Solo muebles (MO): sus lotes resumidos. Un mueble se evalúa por lote, así
  // que su estado sale de las piezas, no del último informe.
  lotes?: ResumenLotes | null;
}

// ¿El mueble se evalúa por lote? Sí en cuanto tiene piezas preaprobadas por
// Producción. Sin lotes solo se evalúa completo (un informe general) cuando la
// verificación de Producción está apagada.
export function porLotes(item: Pick<ItemEvaluable, "lotes">): boolean {
  return (item.lotes?.verificadas ?? 0) > 0;
}

// Un ítem cancelado se muestra así aunque ya tenga informes: su historial de
// folios no se pierde, solo deja de tener sentido evaluarlo.
// Mueble con lotes: "sin evaluar" mientras tenga piezas por evaluar, "no
// aprobado" si quedan piezas en retrabajo, "aprobado" si todo lo verificado
// pasó. Componente (o mueble sin lotes): manda su último informe.
export function estadoDe(item: Pick<ItemEvaluable, "estadoRevision" | "informes" | "lotes">): EstadoCalidad {
  if (item.estadoRevision === "cancelado") return "cancelado";
  if (item.lotes && porLotes(item)) {
    const e = estadoMueble(item.lotes);
    return e === "aprobado" ? "aprobado" : e === "en_retrabajo" ? "no_aprobado" : "sin_evaluar";
  }
  const ultimo = item.informes[0];
  if (!ultimo) return "sin_evaluar";
  return ultimo.aprobado ? "aprobado" : "no_aprobado";
}

// Días completos sin evaluar desde que se liberó a producción; null si ya
// tiene informe o no hay fecha de liberación.
export function diasSinEvaluar(
  item: Pick<ItemEvaluable, "informes" | "liberadoEn">,
  ahora: Date
): number | null {
  if (item.informes.length > 0 || !item.liberadoEn) return null;
  return Math.max(0, Math.floor((ahora.getTime() - new Date(item.liberadoEn).getTime()) / 86_400_000));
}

// Ítems que se pueden aprobar de una vez: muebles con piezas por evaluar (se
// aprueba todo lo pendiente de sus lotes) y los demás ítems evaluables nunca
// evaluados (componentes, o muebles sin lotes con la verificación apagada).
// Los rechazados no entran (volver a aprobarlos es una decisión individual) ni
// los cancelados.
export function idsPorAprobar(
  items: Pick<ItemEvaluable, "id" | "estadoRevision" | "informes" | "evaluable" | "lotes">[]
): string[] {
  return items
    .filter((i) =>
      i.lotes && porLotes(i)
        ? i.estadoRevision !== "cancelado" && i.lotes.porEvaluar > 0
        : i.evaluable && estadoDe(i) === "sin_evaluar"
    )
    .map((i) => i.id);
}

// Muebles (MO) con piezas verificadas por Producción → qué ítems de la lista
// se pueden evaluar: el mueble y sus componentes. Espejo de la función
// item_verificado_por_produccion de la base.
export function verificadosPorProduccion(
  items: Pick<ItemEvaluable, "id" | "tipo_registro" | "parent_item_id">[],
  mueblesVerificados: ReadonlySet<string>
): Set<string> {
  const salida = new Set<string>();
  for (const i of items) {
    const raiz = i.tipo_registro === "FU" && i.parent_item_id ? i.parent_item_id : i.id;
    if (mueblesVerificados.has(raiz)) salida.add(i.id);
  }
  return salida;
}

// El mueble (MO) de un ítem escaneado junto con sus componentes (FU). Si el
// QR es de un componente, se toma su mueble. Lista vacía si el ítem no está.
export function grupoDelItem<T extends Pick<ItemEvaluable, "id" | "tipo_registro" | "parent_item_id">>(
  items: T[],
  itemId: string
): T[] {
  const item = items.find((i) => i.id === itemId);
  if (!item) return [];
  const raizId = item.tipo_registro === "FU" && item.parent_item_id ? item.parent_item_id : item.id;
  return items.filter((i) => i.id === raizId || i.parent_item_id === raizId);
}

// ¿El error es "esa función no existe en la base"? (migración sin aplicar)
export function funcionNoExiste(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(error.message ?? "")
  );
}
