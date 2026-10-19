// Ruta de un mueble en Producción: la lista ordenada de procesos por los que
// pasa (Armado → Superficie Sólida → Barniz → Electrificación...). Los pasos se
// pueden repetir (Armado → Barniz → Armado). Las reglas reales viven en la
// migración ruta_produccion (guardar_ruta_produccion, crear_asignacion_produccion);
// aquí solo lo que comparte la interfaz.

import { PROCESO_LABELS, type Proceso } from "./asignaciones";

// Orden ideal de los procesos. Espejo de ruta_sugerida_produccion en la base.
export const ORDEN_SUGERIDO: readonly Proceso[] = [
  "armado",
  "superficie_solida",
  "barniz",
  "electrificacion",
];

// Mismo límite que valida la base.
export const MAX_PASOS = 12;

// Un paso de la ruta. id es null mientras la ruta no se ha guardado (es la
// sugerida): la base la crea con la primera asignación o al guardarla.
export interface PasoRuta {
  id: string | null;
  proceso: Proceso;
}

// La sugerida: Armado y Barniz siempre; S.S. y Electrificación solo si el
// mueble las lleva (por su descripción o la de sus componentes).
export function rutaSugerida(aplica: Record<Proceso, boolean>): PasoRuta[] {
  return ORDEN_SUGERIDO.filter(
    (p) => p === "armado" || p === "barniz" || aplica[p]
  ).map((proceso) => ({ id: null, proceso }));
}

// "Armado" si el proceso va una sola vez en la ruta; "Armado 1", "Armado 2"
// si se repite.
export function etiquetaPaso(ruta: PasoRuta[], indice: number): string {
  const proceso = ruta[indice].proceso;
  const veces = ruta.filter((p) => p.proceso === proceso).length;
  if (veces <= 1) return PROCESO_LABELS[proceso];
  const n = ruta.slice(0, indice + 1).filter((p) => p.proceso === proceso).length;
  return `${PROCESO_LABELS[proceso]} ${n}`;
}

// "Armado → Barniz → Armado".
export function textoRuta(ruta: PasoRuta[]): string {
  return ruta.map((p) => PROCESO_LABELS[p.proceso]).join(" → ");
}

// Lo que se manda a guardar_ruta_produccion.
export function pasosParaGuardar(ruta: PasoRuta[]): { id: string | null; proceso: Proceso }[] {
  return ruta.map((p) => ({ id: p.id, proceso: p.proceso }));
}

// Mueve un paso una posición (-1 arriba, +1 abajo). Fuera de rango no cambia.
export function moverPaso<T>(ruta: T[], indice: number, direccion: -1 | 1): T[] {
  const destino = indice + direccion;
  if (indice < 0 || indice >= ruta.length || destino < 0 || destino >= ruta.length) return ruta;
  const nueva = [...ruta];
  [nueva[indice], nueva[destino]] = [nueva[destino], nueva[indice]];
  return nueva;
}
