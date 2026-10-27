// Ruta de Producción: la lista ordenada de procesos por los que pasa algo (Armado →
// Superficie Sólida → Barniz → Electrificación...). Los pasos se pueden repetir (Armado →
// Barniz → Armado). Hay una ruta del mueble completo y una por cada parte de su despiece
// (migración rutas_por_parte): son independientes, primero van las partes y después el
// mueble. Las reglas reales viven en la base (guardar_ruta_produccion,
// crear_asignacion_produccion); aquí solo lo que comparte la interfaz.

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
// mueble las lleva (por su descripción o la de sus componentes). La toman el mueble
// sin despiece y cada parte que todavía no guarda la suya.
export function rutaSugerida(aplica: Record<Proceso, boolean>): PasoRuta[] {
  return ORDEN_SUGERIDO.filter(
    (p) => p === "armado" || p === "barniz" || aplica[p]
  ).map((proceso) => ({ id: null, proceso }));
}

// La ruta del mueble completo: la guardada o, si aún no tiene, la sugerida. Un mueble con
// partes nace vacío: lo que se le hace ya armado (ensamblarlo es un Armado) lo agrega
// Producción. Espejo de asegurar_ruta_produccion.
export function rutaDelMueble(
  guardada: PasoRuta[] | undefined,
  aplica: Record<Proceso, boolean>,
  tienePartes: boolean
): PasoRuta[] {
  if (guardada && (guardada.length > 0 || tienePartes)) return guardada;
  return tienePartes ? [] : rutaSugerida(aplica);
}

// La ruta de una parte: la guardada o, si nunca la guardó, la sugerida.
export function rutaDeParte(
  guardada: PasoRuta[] | undefined,
  rutaGuardada: boolean,
  aplica: Record<Proceso, boolean>
): PasoRuta[] {
  return rutaGuardada ? (guardada ?? []) : rutaSugerida(aplica);
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

// ¿Se puede mover el paso? Dos pasos con asignaciones no cambian de orden entre sí (lo
// listo y lo adelantado de cada uno dependen de su paso anterior); la base también lo
// rechaza (guardar_ruta_produccion).
export function puedeMover(pasos: readonly { bloqueado: boolean }[], indice: number, direccion: -1 | 1): boolean {
  const destino = indice + direccion;
  if (indice < 0 || indice >= pasos.length || destino < 0 || destino >= pasos.length) return false;
  return !(pasos[indice].bloqueado && pasos[destino].bloqueado);
}

// Todos los pasos guardados de un mueble para elegir uno (a dónde regresa lo rechazado en
// la revisión final, o dónde nació la falla): primero los de cada parte y después los del
// mueble completo. Los de la sugerida (sin id) no salen.
export function pasosDeTodasLasRutas(
  ruta: PasoRuta[],
  partes: readonly { descripcion: string; ruta: PasoRuta[] }[]
): { id: string; etiqueta: string }[] {
  const de = (pasos: PasoRuta[], prefijo: string) =>
    pasos.flatMap((p, n) => (p.id ? [{ id: p.id, etiqueta: `${prefijo}${n + 1}. ${etiquetaPaso(pasos, n)}` }] : []));
  if (partes.length === 0) return de(ruta, "");
  return [...partes.flatMap((p) => de(p.ruta, `${p.descripcion} · `)), ...de(ruta, "Mueble completo · ")];
}
