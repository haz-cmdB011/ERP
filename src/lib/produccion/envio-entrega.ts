// Ayudas de /api/produccion/entregas para que un envío se pueda REPETIR sin duplicar la
// entrega. El celular guarda las capturas hechas sin red y las manda cuando vuelve la
// conexión (src/lib/offline); si la red se corta justo después de que el servidor guardó
// la entrega y la respuesta no llega, el celular la reenvía. La clave de envío identifica
// el intento y queda en la entrega (índice único en entregas_produccion.clave_envio).

import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La clave que manda el celular, o una nueva si no vino o no es válida (clientes viejos). */
export function leerClaveEnvio(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" && UUID.test(valor.trim()) ? valor.trim().toLowerCase() : randomUUID();
}

export interface PiezasDeParte {
  parteId: string;
  piezas: number;
}

/**
 * Las partes que trae una entrega parcial por partes (texto JSON: [{parteId, piezas}]), o null si
 * no vino, no es válida o no trae ninguna con piezas. Las partes en cero se descartan.
 */
export function leerPartesEntrega(valor: FormDataEntryValue | null): PiezasDeParte[] | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  let crudo: unknown;
  try {
    crudo = JSON.parse(valor);
  } catch {
    return null;
  }
  if (!Array.isArray(crudo) || crudo.length > 50) return null;
  const partes: PiezasDeParte[] = [];
  for (const x of crudo) {
    if (!x || typeof x !== "object") return null;
    const { parteId, piezas } = x as { parteId?: unknown; piezas?: unknown };
    if (typeof parteId !== "string" || !UUID.test(parteId)) return null;
    const n = typeof piezas === "number" ? piezas : Number(piezas);
    if (!Number.isFinite(n) || n < 0) return null;
    if (n > 0) partes.push({ parteId: parteId.toLowerCase(), piezas: n });
  }
  return partes.length > 0 ? partes : null;
}

interface ErrorConCodigo {
  code?: string | null;
  message?: string | null;
  statusCode?: string | number | null;
}

/** La entrega ya estaba registrada: choca con el índice único de clave_envio. */
export function esViolacionUnica(error: ErrorConCodigo): boolean {
  return error.code === "23505";
}

/**
 * Los errores que la propia función SQL levanta con `raise exception` (P0001) y los de
 * datos, integridad o permisos (clases 22, 23, 42) son una respuesta definitiva: repetir
 * el envío daría lo mismo. Cualquier otro (corte con la base, tiempo agotado) es pasajero.
 */
export function esRechazoDefinitivo(error: ErrorConCodigo): boolean {
  return /^(P0|22|23|42)/.test(error.code ?? "");
}
