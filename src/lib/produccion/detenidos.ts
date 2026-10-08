// Cosas detenidas entre Producción y Calidad: lo que lleva días esperando a
// alguien. Se cuentan en el inicio de cada área y se marcan en sus listas.
//   * Entrega sin verificar: el equipo entregó y el trabajador no la revisa.
//   * Lote sin evaluar: Producción verificó y Calidad no lo evalúa.
//   * Rechazo sin reasignar: Calidad rechazó y Producción no lo reasigna.
// Los días son naturales y en hora de México, desde que empezó a esperar.

import { DIAS_ANTIGUEDAD_ALERTA } from "@/lib/calidad/estado-item";
import { diasEntre, hoyMexico } from "./asignaciones";

export const DIAS_SIN_VERIFICAR = 2;
export const DIAS_SIN_EVALUAR_LOTE = DIAS_ANTIGUEDAD_ALERTA;
export const DIAS_SIN_REASIGNAR = 2;

// Días completos que lleva esperando algo que empezó en `desdeIso` (instante).
export function diasEsperando(desdeIso: string, hoy: string): number {
  return Math.max(0, diasEntre(hoyMexico(new Date(desdeIso)), hoy));
}

export interface Pendientes {
  total: number;
  // Los que ya llevan `umbral` días o más.
  detenidos: number;
  // Días del que más lleva esperando (null si no hay ninguno).
  masAntiguoDias: number | null;
}

export function contarPendientes(desde: string[], umbral: number, hoy: string): Pendientes {
  let detenidos = 0;
  let masAntiguoDias: number | null = null;
  for (const d of desde) {
    const dias = diasEsperando(d, hoy);
    if (dias >= umbral) detenidos += 1;
    if (masAntiguoDias === null || dias > masAntiguoDias) masAntiguoDias = dias;
  }
  return { total: desde.length, detenidos, masAntiguoDias };
}

// Texto del aviso de una tarjeta; null si no hay nada detenido.
export function avisoDetenidos(p: Pendientes, umbral: number): string | null {
  if (p.detenidos === 0) return null;
  const lleva = p.masAntiguoDias !== null && p.masAntiguoDias > umbral ? ` (el más antiguo, ${p.masAntiguoDias} días)` : "";
  return `${p.detenidos} con ${umbral} días o más${lleva}`;
}

export interface Detenidos {
  sinVerificar: Pendientes;
  sinEvaluar: Pendientes;
  sinReasignar: Pendientes;
}
