// Archivos huérfanos del bucket de imágenes de ítems (planeacion-item-imagenes): archivos que
// ninguna fila de planeacion_item_imagenes apunta. Lógica pura, sin red; la usa
// scripts/db/limpiar-huerfanos.mts y está probada.
//
// De dónde salen:
//  - pedidos borrados por una vía que no limpia Storage (SQL a mano, truncar tablas);
//  - cargas de Excel que fallan: las imágenes se suben ANTES de ingerir el pedido
//    (src/app/api/planeacion/upload/route.ts) y, si la ingestión falla, quedan sueltas.

import { rutaImagenGrande } from "@/lib/planeacion/imagenes";

export interface ObjetoStorage {
  /** Ruta dentro del bucket: "<carga>/<fila>-<n>.webp" o "<carga>/hoja-2/<fila>-<n>.webp". */
  ruta: string;
  bytes: number;
  creado: string | null;
}

/** Rutas que las filas de la base mantienen vivas: cada imagen y su versión grande (-hd). */
export function rutasReferenciadas(rutasEnBase: string[]): Set<string> {
  const refs = new Set<string>();
  for (const ruta of rutasEnBase) {
    refs.add(ruta);
    refs.add(rutaImagenGrande(ruta));
  }
  return refs;
}

export interface Clasificacion {
  referenciados: ObjetoStorage[];
  /** Sin fila que los use y con antigüedad suficiente: candidatos a borrar. */
  huerfanos: ObjetoStorage[];
  /** Sin fila pero muy nuevos: pueden ser de una carga en curso (suben antes de ingerir). NO se tocan. */
  recientes: ObjetoStorage[];
}

export const EDAD_MINIMA_MS = 24 * 60 * 60 * 1000;

export function clasificarObjetos(
  objetos: ObjetoStorage[],
  refs: Set<string>,
  ahora: number = Date.now(),
  edadMinimaMs: number = EDAD_MINIMA_MS
): Clasificacion {
  const r: Clasificacion = { referenciados: [], huerfanos: [], recientes: [] };
  for (const o of objetos) {
    if (refs.has(o.ruta)) {
      r.referenciados.push(o);
      continue;
    }
    const creado = o.creado ? Date.parse(o.creado) : NaN;
    // Sin fecha legible se trata como reciente: ante la duda no se borra.
    if (!Number.isFinite(creado) || ahora - creado < edadMinimaMs) r.recientes.push(o);
    else r.huerfanos.push(o);
  }
  return r;
}

export interface GrupoCarga {
  /** Primera carpeta de la ruta: el id de la carga de Excel que subió esas imágenes. */
  carga: string;
  archivos: number;
  bytes: number;
  desde: string | null;
  hasta: string | null;
}

export function agruparPorCarga(objetos: ObjetoStorage[]): GrupoCarga[] {
  const grupos = new Map<string, GrupoCarga>();
  for (const o of objetos) {
    const carga = o.ruta.split("/")[0];
    const g = grupos.get(carga) ?? { carga, archivos: 0, bytes: 0, desde: null, hasta: null };
    g.archivos++;
    g.bytes += o.bytes;
    if (o.creado) {
      if (!g.desde || o.creado < g.desde) g.desde = o.creado;
      if (!g.hasta || o.creado > g.hasta) g.hasta = o.creado;
    }
    grupos.set(carga, g);
  }
  return [...grupos.values()].sort((a, b) => b.archivos - a.archivos);
}

export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export interface OperacionesBorrado {
  /** Trae el contenido de un archivo; lanza o devuelve null si no se pudo. */
  descargar: (ruta: string) => Promise<Uint8Array | null>;
  /** Guarda el respaldo local de un archivo. */
  guardarRespaldo: (ruta: string, contenido: Uint8Array) => Promise<void>;
  /** Borra un lote de rutas del bucket; lanza si falla. */
  borrarLote: (rutas: string[]) => Promise<void>;
  /** Para informar avance (opcional). */
  progreso?: (mensaje: string) => void;
}

export const TAMANO_LOTE_BORRADO = 100;

/**
 * Respalda TODOS los archivos y solo entonces los borra. Si falla un respaldo no se borra nada;
 * si falla el borrado de un lote se detiene y dice cuántos llevaba (los demás siguen intactos).
 */
export async function borrarConRespaldo(
  objetos: ObjetoStorage[],
  { descargar, guardarRespaldo, borrarLote, progreso }: OperacionesBorrado
): Promise<{ borrados: number }> {
  for (const [i, o] of objetos.entries()) {
    let contenido: Uint8Array | null;
    try {
      contenido = await descargar(o.ruta);
    } catch {
      contenido = null;
    }
    if (!contenido) throw new Error(`No se pudo respaldar ${o.ruta}. No se borró nada.`);
    await guardarRespaldo(o.ruta, contenido);
    if ((i + 1) % 200 === 0) progreso?.(`respaldados ${i + 1}/${objetos.length}`);
  }

  let borrados = 0;
  for (let i = 0; i < objetos.length; i += TAMANO_LOTE_BORRADO) {
    const lote = objetos.slice(i, i + TAMANO_LOTE_BORRADO).map((o) => o.ruta);
    try {
      await borrarLote(lote);
    } catch (e) {
      throw new Error(`Falló el borrado tras ${borrados} archivos: ${e instanceof Error ? e.message : String(e)}`);
    }
    borrados += lote.length;
  }
  return { borrados };
}
