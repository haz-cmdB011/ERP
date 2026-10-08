// Ayudas de /api/produccion/entregas para que un envío se pueda REPETIR sin duplicar la
// entrega. El celular guarda las capturas hechas sin red y las manda cuando vuelve la
// conexión (src/lib/offline); si la red se corta justo después de que el servidor guardó
// la entrega y la respuesta no llega, el celular la reenvía. La clave de envío identifica
// el intento: la foto se sube a una ruta que sale de ella, y la entrega se reconoce por esa
// ruta (índice único en entregas_produccion.foto_path).

import { randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La clave que manda el celular, o una nueva si no vino o no es válida (clientes viejos). */
export function leerClaveEnvio(valor: FormDataEntryValue | null): string {
  return typeof valor === "string" && UUID.test(valor.trim()) ? valor.trim().toLowerCase() : randomUUID();
}

export function rutaFotoEntrega(asignacionId: string, clave: string): string {
  return `${asignacionId}/${clave}.webp`;
}

interface ErrorConCodigo {
  code?: string | null;
  message?: string | null;
  statusCode?: string | number | null;
}

/** La foto ya estaba en Storage: un intento anterior de este mismo envío la subió. */
export function esFotoYaSubida(error: ErrorConCodigo): boolean {
  return String(error.statusCode ?? "") === "409" || /already exists|duplicate/i.test(error.message ?? "");
}

/** La entrega ya estaba registrada: choca con el índice único de foto_path. */
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
