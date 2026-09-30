// Conciliación de la cantidad capturada en Electrificación contra lo que
// Planeación declaró en el PM. Misma regla que aplica la base al guardar
// (guardar_recibo_electrificacion): por OT + modelo, lo ya registrado en otros
// recibos más lo que se captura ahora se compara contra la suma de
// cantidad_total de los padres con ese modelo en esa OT.
//
//   * igual o menor que lo declarado -> no hay descuadre (menor = recibo
//     parcial: falta cobrar el resto en otros recibos);
//   * mayor que lo declarado, o el modelo no existe en la OT -> descuadre: se
//     avisa y se exige motivo.
//
// Esto solo adelanta el aviso en pantalla; la base sigue siendo quien exige el
// motivo.

import { normalizar } from "./motor-precio";

export type EstadoConciliacion =
  | { estado: "sin_modelo_en_pm" }
  | { estado: "cuadra"; cantidadPm: number; total: number }
  | { estado: "parcial"; cantidadPm: number; total: number; faltan: number }
  | { estado: "no_cuadra"; cantidadPm: number; total: number; diferencia: number };

// cantidadPm null: el modelo no existe en el PM de esa OT.
export function evaluarConciliacion(
  cantidadPm: number | null,
  cantidadRegistrada: number,
  cantidadEnFormulario: number
): EstadoConciliacion {
  if (cantidadPm == null) return { estado: "sin_modelo_en_pm" };
  const total = cantidadRegistrada + cantidadEnFormulario;
  if (total === cantidadPm) return { estado: "cuadra", cantidadPm, total };
  if (total < cantidadPm) {
    return { estado: "parcial", cantidadPm, total, faltan: cantidadPm - total };
  }
  return { estado: "no_cuadra", cantidadPm, total, diferencia: total - cantidadPm };
}

// ¿Este resultado exige explicar un motivo? Solo cuando se pasa de lo
// declarado o el modelo no existe en la OT.
export function exigeMotivo(c: EstadoConciliacion | null): boolean {
  return c !== null && (c.estado === "no_cuadra" || c.estado === "sin_modelo_en_pm");
}

// Suma lo capturado en el formulario por modelo (un mismo modelo puede
// aparecer en varios renglones). La clave es el modelo normalizado.
export function cantidadPorModelo(
  renglones: { modelo: string; cantidad: number | "" }[]
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of renglones) {
    const clave = normalizar(r.modelo);
    if (!clave) continue;
    mapa.set(clave, (mapa.get(clave) ?? 0) + (Number(r.cantidad) || 0));
  }
  return mapa;
}
