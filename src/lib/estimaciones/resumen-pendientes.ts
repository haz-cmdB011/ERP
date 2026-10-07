// Qué tan atrasada va la bandeja "Por revisar": cuántos recibos esperan, cuántos
// son urgentes y cuánto lleva esperando el más antiguo. Puro: la lectura de la
// base está en por-revisar.ts.

export interface PendienteAntiguedad {
  prioridad: string;
  creadoEn: string;
}

export interface ResumenPendientes {
  total: number;
  urgentes: number;
  // Días completos que lleva esperando el más antiguo (null sin pendientes).
  masAntiguoDias: number | null;
  // Los que ya esperan más que el plazo razonable.
  vencidos: number;
}

// Pasados estos días sin revisar, un recibo se considera retrasado.
export const DIAS_PLAZO_REVISION = 3;
const DIA_MS = 24 * 60 * 60 * 1000;

export function resumirPendientes(filas: PendienteAntiguedad[], ahora: Date): ResumenPendientes {
  const dias = filas.map((f) =>
    Math.max(0, Math.floor((ahora.getTime() - new Date(f.creadoEn).getTime()) / DIA_MS))
  );
  return {
    total: filas.length,
    urgentes: filas.filter((f) => f.prioridad === "urgente").length,
    masAntiguoDias: dias.length ? Math.max(...dias) : null,
    vencidos: dias.filter((d) => d > DIAS_PLAZO_REVISION).length,
  };
}

// Texto corto para la tarjeta del panel.
export function detallePendientes(r: ResumenPendientes): string {
  if (r.total === 0) return "nada por revisar";
  const partes: string[] = [];
  if (r.urgentes > 0) partes.push(`${r.urgentes} urgente${r.urgentes === 1 ? "" : "s"}`);
  if (r.vencidos > 0) partes.push(`${r.vencidos} con más de ${DIAS_PLAZO_REVISION} días`);
  if (r.masAntiguoDias !== null && r.masAntiguoDias >= 1) {
    partes.push(`el más antiguo espera ${r.masAntiguoDias} día${r.masAntiguoDias === 1 ? "" : "s"}`);
  }
  return partes.length ? partes.join(" · ") : "esperan que aceptes o modifiques el precio";
}
