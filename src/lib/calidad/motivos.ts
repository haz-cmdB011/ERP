// Ayudas para elegir un motivo del catálogo desde el celular: búsqueda sin
// acentos ni mayúsculas, los motivos que más se usan y las acciones correctivas
// que ya se escribieron para un mismo motivo.

import type { MotivoCalidad } from "./no-conformidad";

export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Motivos que contienen TODAS las palabras escritas (en el código o el nombre).
// Sin texto devuelve todos. `limite` acota lo que se pinta en pantalla.
export function filtrarMotivos(motivos: MotivoCalidad[], texto: string, limite = 60): { lista: MotivoCalidad[]; hayMas: boolean } {
  const palabras = normalizarBusqueda(texto).split(/\s+/).filter(Boolean);
  const coinciden =
    palabras.length === 0
      ? motivos
      : motivos.filter((m) => {
          const pajar = normalizarBusqueda(`${m.codigo} ${m.nombre}`);
          return palabras.every((p) => pajar.includes(p));
        });
  return { lista: coinciden.slice(0, limite), hayMas: coinciden.length > limite };
}

// Los `n` códigos que más aparecen (empate: el más reciente, que viene primero).
export function motivosMasUsados(codigosRecientesPrimero: (string | null)[], n = 6): string[] {
  const cuenta = new Map<string, number>();
  const primero = new Map<string, number>();
  codigosRecientesPrimero.forEach((c, i) => {
    if (!c) return;
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    if (!primero.has(c)) primero.set(c, i);
  });
  return [...cuenta.keys()]
    .sort((a, b) => (cuenta.get(b) ?? 0) - (cuenta.get(a) ?? 0) || (primero.get(a) ?? 0) - (primero.get(b) ?? 0))
    .slice(0, n);
}

// Acciones ya usadas para un motivo, sin repetir (ignora mayúsculas), las más
// recientes primero.
export function accionesSugeridas(accionesRecientesPrimero: (string | null)[], n = 4): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const a of accionesRecientesPrimero) {
    const t = a?.trim();
    if (!t) continue;
    const clave = normalizarBusqueda(t);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(t);
    if (salida.length >= n) break;
  }
  return salida;
}
