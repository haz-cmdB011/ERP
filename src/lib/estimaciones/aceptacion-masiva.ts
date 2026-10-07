// Revisión ágil de recibos: aceptar de una vez los renglones cuyo precio
// propuesto cae en la banda automática (±10 % del sugerido) y saltar al
// siguiente recibo pendiente. La decisión sigue siendo de quien revisa: aquí
// solo se arma la lista y se calcula el resumen que se le muestra antes.

import { compararFolios, type DecisionRenglon } from "./recibos-db";
import type { Banda } from "./motor-precio";
import type { TipoCualquierRecibo } from "./revision-db";

export interface RenglonEvaluado {
  id: string;
  numero: number;
  cantidad: number;
  propuesto: number;
  decision: DecisionRenglon;
  // Banda del propuesto contra el sugerido calculado con el histórico actual.
  banda: Banda;
}

// Sin decidir, en banda automática y con un precio real.
export function elegiblesParaAceptarMasivo(renglones: RenglonEvaluado[]): RenglonEvaluado[] {
  return renglones.filter((r) => r.decision == null && r.banda === "auto" && r.propuesto > 0 && !!r.id);
}

export function resumenAceptacionMasiva(elegibles: RenglonEvaluado[]): {
  renglones: number;
  importe: number;
} {
  return {
    renglones: elegibles.length,
    importe: elegibles.reduce((s, r) => s + r.cantidad * r.propuesto, 0),
  };
}

export interface RefRecibo {
  tipo: TipoCualquierRecibo;
  folio: string;
}

const comparar = (a: RefRecibo, b: RefRecibo) =>
  compararFolios(a.folio, b.folio) || a.tipo.localeCompare(b.tipo);

// El siguiente recibo por revisar después del actual, en el orden del Registro
// (por folio); si el actual era el último, vuelve al primero. `restantes` cuenta
// los demás pendientes. null si no queda otro.
export function siguienteRecibo(
  pendientes: RefRecibo[],
  actual: RefRecibo
): (RefRecibo & { restantes: number }) | null {
  const otros = pendientes
    .filter((p) => !(p.tipo === actual.tipo && p.folio === actual.folio))
    .sort(comparar);
  if (otros.length === 0) return null;
  const despues = otros.find((p) => comparar(p, actual) > 0) ?? otros[0];
  return { ...despues, restantes: otros.length };
}
