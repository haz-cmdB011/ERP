// Qué le falta a un recibo en captura antes de poder guardarse sin rebotes:
// renglones sin precio y (solo para quien ve el precio sugerido) renglones cuyo
// precio cae en la banda "justificar" y todavía no llevan justificación.

import type { Banda } from "./motor-precio";

export interface RenglonEnCaptura {
  propuesto: number | "";
  // null cuando la persona no ve el precio sugerido (el maquilador): no se le
  // revela qué tan lejos queda su precio.
  banda: Banda | null;
  justificacion: string;
}

export interface PendientesCaptura {
  sinPrecio: number;
  porJustificar: number;
}

export function pendientesDeCaptura(renglones: RenglonEnCaptura[]): PendientesCaptura {
  return {
    sinPrecio: renglones.filter((r) => !(Number(r.propuesto) > 0)).length,
    porJustificar: renglones.filter((r) => r.banda === "justificar" && !r.justificacion.trim()).length,
  };
}

export function hayPendientes(p: PendientesCaptura, descuadres: number): boolean {
  return p.sinPrecio > 0 || p.porJustificar > 0 || descuadres > 0;
}
