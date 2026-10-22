// Etiquetas QR para pegar en el mueble: la hoja de viajero se ensucia o se pierde y la
// etiqueta va con la pieza. Llevan el mismo QR corto (/q/<ítem>) que abre la ficha del
// mueble. Sin base de datos, para poder probarlo.

// Tope de etiquetas por impresión (una por pieza en un PM grande serían miles).
export const MAX_ETIQUETAS = 600;

export interface MuebleEtiqueta {
  id: string;
  cantidad: number;
}

export interface Etiqueta {
  key: string;
  itemId: string;
  // "Pieza 3 de 7" al imprimir una por pieza; null con una por mueble.
  pieza: { n: number; de: number } | null;
}

// Una por mueble, o una por pieza (la cantidad del mueble, redondeada hacia arriba si
// es fraccionaria). `recortadas` dice cuántas no caben en el tope.
export function etiquetasDeMuebles(
  muebles: MuebleEtiqueta[],
  porPieza: boolean,
  max = MAX_ETIQUETAS
): { etiquetas: Etiqueta[]; recortadas: number } {
  const todas: Etiqueta[] = [];
  for (const m of muebles) {
    if (!porPieza) {
      todas.push({ key: m.id, itemId: m.id, pieza: null });
      continue;
    }
    const de = Math.max(1, Math.ceil(Number(m.cantidad) || 0));
    for (let n = 1; n <= de; n++) todas.push({ key: `${m.id}-${n}`, itemId: m.id, pieza: { n, de } });
  }
  return { etiquetas: todas.slice(0, max), recortadas: Math.max(0, todas.length - max) };
}
