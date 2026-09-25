// Recorrido del servidor de Ingeniería, compartido por el reporte
// (escanear-planos.mts) y la sincronización (sincronizar-planos.mts):
//
//   <RAIZ>\O. T´s. <AÑO>\<PM ... | proyecto>\INGENIERIA\<MODELO>\PLANOS\*.pdf
//                                                                \CEDULA\*.xlsx
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizarNumeroPM } from "../../src/lib/planeacion/numero-pm.ts";
import { carpetaCancelada, normalizarModelo } from "../../src/lib/planos/modelo.ts";

const CONCURRENCIA = 16;

export function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

export function bandera(nombre: string): boolean {
  return process.argv.includes(`--${nombre}`);
}

export function aniosPorDefecto(): string {
  const actual = new Date().getFullYear();
  return Array.from({ length: actual - 2021 + 1 }, (_, i) => String(2021 + i)).join(",");
}

// Variables de .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
export async function leerEnv(): Promise<Record<string, string>> {
  const texto = await readFile(path.join(import.meta.dirname, "../../.env.local"), "utf8");
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
  );
}

// "PM 004-25 PROBADORES ..." → "PM004-25"; carpetas sin PM → null.
export function pmDeCarpeta(nombre: string): string | null {
  if (!/^\s*PM\b/i.test(nombre)) return null;
  const pm = normalizarNumeroPM(nombre);
  return /^PM\d+-\d{2}$/.test(pm) ? pm : null;
}

async function listar(dir: string): Promise<{ carpetas: string[]; archivos: string[] } | null> {
  try {
    const entradas = await readdir(dir, { withFileTypes: true });
    return {
      carpetas: entradas.filter((e) => e.isDirectory()).map((e) => e.name),
      archivos: entradas.filter((e) => e.isFile()).map((e) => e.name),
    };
  } catch {
    return null;
  }
}

function buscarSubcarpeta(carpetas: string[], nombre: string): string | undefined {
  return carpetas.find((c) => c.trim().toUpperCase() === nombre);
}

export async function enParalelo<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++;
        resultados[i] = await fn(items[i]);
      }
    })
  );
  return resultados;
}

export interface ArchivoPdf {
  nombre: string;
  // Relativa a la raíz, con "\" (la forma en que Ingeniería ve la ruta).
  ruta_origen: string;
  ruta_absoluta: string;
  tamano_bytes: number;
  modificado_en: Date;
}

export interface ModeloIngenieria {
  anio: string;
  carpeta_proyecto: string;
  pm: string | null;
  modelo_carpeta: string;
  modelo_normalizado: string;
  cancelada: boolean;
  planos_pdf: ArchivoPdf[];
  cedulas_xlsx: string[];
  ruta: string;
}

export interface CarpetaProyecto {
  anio: string;
  nombre: string;
  pm: string | null;
  tiene_ingenieria: boolean;
  modelos: number;
}

export interface ResultadoEscaneo {
  proyectos: CarpetaProyecto[];
  modelos: ModeloIngenieria[];
  // Años cuya carpeta sí se pudo leer: la sincronización solo da de baja
  // planos de estos años (si un año no se pudo leer, no se toca nada de él).
  aniosLeidos: string[];
}

async function escanearProyecto(
  raiz: string,
  anio: string,
  dirAnio: string,
  nombre: string
): Promise<{ proyecto: CarpetaProyecto; modelos: ModeloIngenieria[] }> {
  const pm = pmDeCarpeta(nombre);
  const dirProyecto = path.join(dirAnio, nombre);
  const carpetas = (await listar(dirProyecto))?.carpetas ?? [];
  const ingenieria = buscarSubcarpeta(carpetas, "INGENIERIA");
  if (!ingenieria) {
    return { proyecto: { anio, nombre, pm, tiene_ingenieria: false, modelos: 0 }, modelos: [] };
  }

  const dirIngenieria = path.join(dirProyecto, ingenieria);
  const carpetasModelo = (await listar(dirIngenieria))?.carpetas ?? [];

  const modelos = await enParalelo(carpetasModelo, async (modeloCarpeta) => {
    const dirModelo = path.join(dirIngenieria, modeloCarpeta);
    const sub = (await listar(dirModelo))?.carpetas ?? [];
    const planos = buscarSubcarpeta(sub, "PLANOS");
    const cedula = buscarSubcarpeta(sub, "CEDULA");

    const nombresPdf = planos
      ? ((await listar(path.join(dirModelo, planos)))?.archivos ?? []).filter((a) => /\.pdf$/i.test(a))
      : [];
    const pdfs: ArchivoPdf[] = [];
    for (const nombrePdf of nombresPdf) {
      const rutaAbsoluta = path.join(dirModelo, planos!, nombrePdf);
      try {
        const info = await stat(rutaAbsoluta);
        pdfs.push({
          nombre: nombrePdf,
          ruta_origen: path.relative(raiz, rutaAbsoluta).split(path.sep).join("\\"),
          ruta_absoluta: rutaAbsoluta,
          tamano_bytes: info.size,
          modificado_en: info.mtime,
        });
      } catch {
        // Archivo que desapareció entre listar y leer: se toma en la siguiente pasada.
      }
    }

    const xlsx = cedula
      ? ((await listar(path.join(dirModelo, cedula)))?.archivos ?? []).filter(
          (a) => /\.xlsx?$/i.test(a) && !a.startsWith("~$")
        )
      : [];

    return {
      anio,
      carpeta_proyecto: nombre,
      pm,
      modelo_carpeta: modeloCarpeta,
      modelo_normalizado: normalizarModelo(modeloCarpeta),
      cancelada: carpetaCancelada(modeloCarpeta),
      planos_pdf: pdfs,
      cedulas_xlsx: xlsx,
      ruta: dirModelo,
    } satisfies ModeloIngenieria;
  });

  // Solo cuentan como modelo las carpetas que traen plano o cédula (en
  // INGENIERIA también hay carpetas de apoyo sin ninguno de los dos).
  const conContenido = modelos.filter((m) => m.planos_pdf.length > 0 || m.cedulas_xlsx.length > 0);
  return {
    proyecto: { anio, nombre, pm, tiene_ingenieria: true, modelos: conContenido.length },
    modelos: conContenido,
  };
}

export async function escanear(
  raiz: string,
  anios: string[],
  log: (linea: string) => void = console.log
): Promise<ResultadoEscaneo> {
  const proyectos: CarpetaProyecto[] = [];
  const modelos: ModeloIngenieria[] = [];
  const aniosLeidos: string[] = [];
  for (const anio of anios) {
    const dirAnio = path.join(raiz, `O. T´s. ${anio}`);
    const contenido = await listar(dirAnio);
    if (!contenido) {
      log(`  ${anio}: no se pudo leer ${dirAnio}`);
      continue;
    }
    aniosLeidos.push(anio);
    const t0 = Date.now();
    const resultados = await enParalelo(contenido.carpetas, (c) =>
      escanearProyecto(raiz, anio, dirAnio, c)
    );
    for (const r of resultados) {
      proyectos.push(r.proyecto);
      modelos.push(...r.modelos);
    }
    const n = resultados.reduce((s, r) => s + r.modelos.length, 0);
    log(
      `  ${anio}: ${contenido.carpetas.length} carpetas, ${n} modelos con plano/cédula (${((Date.now() - t0) / 1000).toFixed(1)} s)`
    );
  }
  return { proyectos, modelos, aniosLeidos };
}
