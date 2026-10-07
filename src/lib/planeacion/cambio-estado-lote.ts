// Cambio de estado de revisión de varios ítems a la vez (PATCH
// /api/planeacion/items/estado). Mismas reglas que el cambio de un solo ítem:
// el motivo es obligatorio al cancelar y se limpia al salir de "cancelado".

import type { EstadoRevision } from "./estado-revision";

export const MAX_ITEMS_LOTE = 500;
const MAX_MOTIVO = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS: (EstadoRevision)[] = ["en_revision", "cancelado", null];

export interface CambioLote {
  itemIds: string[];
  estado: EstadoRevision;
  // Solo al cancelar; null en los demás estados.
  motivo: string | null;
}

export type LecturaCambioLote = { ok: true; cambio: CambioLote } | { ok: false; error: string };

export function leerCambioLote(body: unknown): LecturaCambioLote {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Cuerpo de la solicitud inválido." };
  }
  const { itemIds, estado_revision: estado, motivo_cancelacion: motivoCrudo } = body as Record<string, unknown>;

  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return { ok: false, error: "Se requiere itemIds: un arreglo de IDs de ítems." };
  }
  const ids = [...new Set(itemIds as string[])];
  if (ids.length > MAX_ITEMS_LOTE) {
    return { ok: false, error: `Máximo ${MAX_ITEMS_LOTE} ítems por cambio.` };
  }

  const estadoRevision = (estado ?? null) as EstadoRevision;
  if (!ESTADOS.includes(estadoRevision)) {
    return { ok: false, error: "Estado inválido." };
  }

  let motivo: string | null = null;
  if (estadoRevision === "cancelado") {
    motivo = typeof motivoCrudo === "string" ? motivoCrudo.trim() : "";
    if (!motivo) return { ok: false, error: "Debes indicar el motivo de la cancelación." };
    if (motivo.length > MAX_MOTIVO) {
      return { ok: false, error: `El motivo no puede pasar de ${MAX_MOTIVO} caracteres.` };
    }
  }
  return { ok: true, cambio: { itemIds: ids, estado: estadoRevision, motivo } };
}

export interface EstadoPrevio {
  id: string;
  estado: EstadoRevision;
  motivo: string | null;
}

export interface GrupoDeshacer {
  estado: EstadoRevision;
  motivo: string | null;
  itemIds: string[];
}

// Para deshacer un cambio en lote: agrupa los ítems por el estado (y motivo) que
// tenían, de modo que cada grupo se restaura con una sola llamada. Un ítem que
// estaba cancelado sin motivo registrado no se puede restaurar (el motivo es
// obligatorio al cancelar): se devuelve aparte.
export function agruparParaDeshacer(previos: EstadoPrevio[]): {
  grupos: GrupoDeshacer[];
  sinMotivo: string[];
} {
  const grupos = new Map<string, GrupoDeshacer>();
  const sinMotivo: string[] = [];
  for (const p of previos) {
    const motivo = p.estado === "cancelado" ? (p.motivo?.trim() || null) : null;
    if (p.estado === "cancelado" && !motivo) {
      sinMotivo.push(p.id);
      continue;
    }
    const clave = `${p.estado ?? ""}|${motivo ?? ""}`;
    const grupo = grupos.get(clave) ?? { estado: p.estado, motivo, itemIds: [] };
    grupo.itemIds.push(p.id);
    grupos.set(clave, grupo);
  }
  return { grupos: [...grupos.values()], sinMotivo };
}
