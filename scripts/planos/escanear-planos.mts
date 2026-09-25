/**
 * Prototipo (SOLO LECTURA) de la sincronización de planos de Ingeniería.
 *
 * Recorre las carpetas de órdenes de trabajo del servidor de Ingeniería:
 *
 *   I:\O. T´s. <AÑO>\<PM ... | proyecto>\INGENIERIA\<MODELO>\PLANOS\*.pdf
 *                                                           \CEDULA\*.xlsx
 *
 * y compara los modelos encontrados contra los modelos de los pedidos que
 * ya están en la app. No sube nada ni escribe en la base de datos: solo
 * genera un reporte (JSON + CSV) para medir cuántos modelos coinciden solos.
 *
 * Uso:
 *   node scripts/planos/escanear-planos.mts [--raiz I:/] [--anios 2025,2026] [--salida planos-reporte]
 */
import { createClient } from "@supabase/supabase-js";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizarNumeroPM } from "../../src/lib/planeacion/numero-pm.ts";

// ---------------------------------------------------------------- argumentos

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const RAIZ = arg("raiz", "I:/");
const ANIOS = arg("anios", "2021,2022,2023,2024,2025,2026").split(",").map((a) => a.trim());
const SALIDA = arg("salida", "planos-reporte");
const CONCURRENCIA = 16;

// ------------------------------------------------------------- normalización

// Los modelos se escriben distinto según quién los capture: "P-19-01" en la
// carpeta, "P-19/01" en la cédula, "p 19 01" en el Excel... Se comparan en
// una forma canónica: mayúsculas, sin acentos, separadores unificados a "-".
function normalizarModelo(modelo: string): string {
  return modelo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[\s/_.\\]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// "PSTA01 (90)" → "PSTA01": la medida entre paréntesis suele no venir en
// el nombre de la carpeta de Ingeniería.
function sinMedida(modelo: string): string {
  return normalizarModelo(modelo.replace(/\(.*?\)/g, " "));
}

// Ingeniería a veces agrega texto al nombre de la carpeta del modelo:
// "PSTA05 (100) SANITARIOS MUJERES", "PSTA08 (110) CANCELADA". La carpeta
// corresponde al modelo si su nombre normalizado es el modelo, o empieza
// con él seguido de PALABRAS — no de un número: "FXSV-22-1" es otra
// variante, no una carpeta más de "FXSV-22".
function carpetaEsDelModelo(
  carpetaNormalizada: string,
  modeloNormalizado: string,
  permitirTextoExtra: boolean
): boolean {
  if (carpetaNormalizada === modeloNormalizado) return true;
  if (!permitirTextoExtra) return false;
  const prefijo = `${modeloNormalizado}-`;
  return (
    carpetaNormalizada.startsWith(prefijo) && /^[A-Z]/.test(carpetaNormalizada.slice(prefijo.length))
  );
}

// "PM 004-25 PROBADORES ..." → "PM004-25"; carpetas sin PM → null.
function pmDeCarpeta(nombre: string): string | null {
  if (!/^\s*PM\b/i.test(nombre)) return null;
  const pm = normalizarNumeroPM(nombre);
  return /^PM\d+-\d{2}$/.test(pm) ? pm : null;
}

// ------------------------------------------------------------ sistema de archivos

async function listar(dir: string): Promise<{ carpetas: string[]; archivos: string[] }> {
  try {
    const entradas = await readdir(dir, { withFileTypes: true });
    return {
      carpetas: entradas.filter((e) => e.isDirectory()).map((e) => e.name),
      archivos: entradas.filter((e) => e.isFile()).map((e) => e.name),
    };
  } catch {
    return { carpetas: [], archivos: [] };
  }
}

function buscarSubcarpeta(carpetas: string[], nombre: string): string | undefined {
  return carpetas.find((c) => c.trim().toUpperCase() === nombre);
}

async function enParalelo<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
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

// ------------------------------------------------------------------- escaneo

interface ModeloIngenieria {
  anio: string;
  carpeta_proyecto: string;
  pm: string | null;
  modelo_carpeta: string;
  modelo_normalizado: string;
  cancelada: boolean;
  planos_pdf: string[];
  cedulas_xlsx: string[];
  ruta: string;
}

interface CarpetaProyecto {
  anio: string;
  nombre: string;
  pm: string | null;
  tiene_ingenieria: boolean;
  modelos: number;
}

async function escanearProyecto(
  anio: string,
  dirAnio: string,
  nombre: string
): Promise<{ proyecto: CarpetaProyecto; modelos: ModeloIngenieria[] }> {
  const pm = pmDeCarpeta(nombre);
  const dirProyecto = path.join(dirAnio, nombre);
  const { carpetas } = await listar(dirProyecto);
  const ingenieria = buscarSubcarpeta(carpetas, "INGENIERIA");
  if (!ingenieria) {
    return { proyecto: { anio, nombre, pm, tiene_ingenieria: false, modelos: 0 }, modelos: [] };
  }

  const dirIngenieria = path.join(dirProyecto, ingenieria);
  const { carpetas: carpetasModelo } = await listar(dirIngenieria);

  const modelos = await enParalelo(carpetasModelo, async (modeloCarpeta) => {
    const dirModelo = path.join(dirIngenieria, modeloCarpeta);
    const { carpetas: sub } = await listar(dirModelo);
    const planos = buscarSubcarpeta(sub, "PLANOS");
    const cedula = buscarSubcarpeta(sub, "CEDULA");
    const pdfs = planos
      ? (await listar(path.join(dirModelo, planos))).archivos.filter((a) => /\.pdf$/i.test(a))
      : [];
    const xlsx = cedula
      ? (await listar(path.join(dirModelo, cedula))).archivos.filter(
          (a) => /\.xlsx?$/i.test(a) && !a.startsWith("~$")
        )
      : [];
    return {
      anio,
      carpeta_proyecto: nombre,
      pm,
      modelo_carpeta: modeloCarpeta,
      modelo_normalizado: normalizarModelo(modeloCarpeta),
      cancelada: /CANCELAD/i.test(modeloCarpeta),
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

async function escanear(): Promise<{ proyectos: CarpetaProyecto[]; modelos: ModeloIngenieria[] }> {
  const proyectos: CarpetaProyecto[] = [];
  const modelos: ModeloIngenieria[] = [];
  for (const anio of ANIOS) {
    const dirAnio = path.join(RAIZ, `O. T´s. ${anio}`);
    const { carpetas } = await listar(dirAnio);
    if (carpetas.length === 0) {
      console.warn(`  (no se encontró ${dirAnio})`);
      continue;
    }
    const t0 = Date.now();
    const resultados = await enParalelo(carpetas, (c) => escanearProyecto(anio, dirAnio, c));
    for (const r of resultados) {
      proyectos.push(r.proyecto);
      modelos.push(...r.modelos);
    }
    const n = resultados.reduce((s, r) => s + r.modelos.length, 0);
    console.log(
      `  ${anio}: ${carpetas.length} carpetas, ${n} modelos con plano/cédula (${((Date.now() - t0) / 1000).toFixed(1)} s)`
    );
  }
  return { proyectos, modelos };
}

// ------------------------------------------------------- modelos de la app

interface ModeloApp {
  pm: string;
  numero_pedido: string;
  proyecto: string;
  item_code: number;
  modelo: string;
}

async function leerEnv(): Promise<Record<string, string>> {
  const texto = await readFile(".env.local", "utf8");
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
  );
}

// Solo SELECT: modelos de la versión activa de los pedidos no eliminados.
async function modelosDeLaApp(): Promise<ModeloApp[]> {
  const env = await leerEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("planeacion_items")
    .select(
      "item_code, modelo, pedido_versiones!inner ( es_version_activa, pedidos!inner ( numero_pedido, fecha_pedido, eliminado_en, proyectos ( nombre ) ) )"
    )
    .eq("pedido_versiones.es_version_activa", true)
    .is("pedido_versiones.pedidos.eliminado_en", null)
    .not("modelo", "is", null)
    .returns<
      {
        item_code: number;
        modelo: string;
        pedido_versiones: {
          pedidos: {
            numero_pedido: string;
            fecha_pedido: string | null;
            proyectos: { nombre: string } | null;
          };
        };
      }[]
    >();
  if (error) throw new Error(`No se pudieron leer los modelos de la app: ${error.message}`);
  return (data ?? []).map((r) => {
    const p = r.pedido_versiones.pedidos;
    return {
      pm: normalizarNumeroPM(p.numero_pedido, { fechaPedido: p.fecha_pedido }),
      numero_pedido: p.numero_pedido,
      proyecto: p.proyectos?.nombre ?? "",
      item_code: r.item_code,
      modelo: r.modelo,
    };
  });
}

// --------------------------------------------------------------- comparación

type TipoCoincidencia =
  | "mismo_pm" // carpeta del modelo dentro de la carpeta del mismo PM
  | "otro_pm" // el modelo existe, pero en la carpeta de otro PM (reutilizado)
  | "aproximado" // solo coincide quitando la medida "(90)": revisar a mano
  | "sin_plano";

interface Coincidencia extends ModeloApp {
  tipo: TipoCoincidencia;
  cancelada: boolean;
  carpetas: string[];
  planos: number;
  cedulas: number;
}

function comparar(app: ModeloApp[], ingenieria: ModeloIngenieria[]): Coincidencia[] {
  // Dentro del mismo PM se acepta texto extra en la carpeta; en otros PM
  // solo coincidencias exactas (nombres genéricos como "MUESTRA" darían
  // falsos positivos: "MUESTRA SECCION" de otro proyecto).
  const buscar = (clave: string, deCarpeta: (m: ModeloIngenieria) => string, pm: string) =>
    ingenieria.filter((m) => carpetaEsDelModelo(deCarpeta(m), clave, m.pm === pm));

  return app.map((a) => {
    let candidatos = buscar(normalizarModelo(a.modelo), (m) => m.modelo_normalizado, a.pm);
    let tipo: TipoCoincidencia | null = null;
    if (candidatos.length === 0) {
      candidatos = buscar(sinMedida(a.modelo), (m) => sinMedida(m.modelo_carpeta), a.pm);
      if (candidatos.length > 0) tipo = "aproximado";
    }

    // Preferencia: las carpetas de su mismo PM; si no hay, las del año más
    // reciente (modelo reutilizado de otro proyecto).
    const delMismoPm = candidatos.filter((c) => c.pm === a.pm);
    const anioReciente = candidatos.map((c) => c.anio).sort().at(-1);
    const elegidos = delMismoPm.length
      ? delMismoPm
      : candidatos.filter((c) => c.anio === anioReciente);

    tipo ??= elegidos.length === 0 ? "sin_plano" : delMismoPm.length ? "mismo_pm" : "otro_pm";
    return {
      ...a,
      tipo,
      cancelada: elegidos.length > 0 && elegidos.every((c) => c.cancelada),
      carpetas: elegidos.map((c) => c.ruta),
      planos: elegidos.reduce((s, c) => s + c.planos_pdf.length, 0),
      cedulas: elegidos.reduce((s, c) => s + c.cedulas_xlsx.length, 0),
    };
  });
}

// -------------------------------------------------------------------- reporte

function csv(filas: Record<string, unknown>[]): string {
  if (filas.length === 0) return "";
  const columnas = Object.keys(filas[0]);
  const celda = (v: unknown) => {
    const s = Array.isArray(v) ? v.join(" | ") : String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para que Excel abra bien los acentos.
  return "﻿" + [columnas.join(","), ...filas.map((f) => columnas.map((c) => celda(f[c])).join(","))].join("\r\n");
}

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(0)}%` : "—";
}

async function main() {
  console.log(`Escaneando ${RAIZ} (años ${ANIOS.join(", ")})...`);
  const { proyectos, modelos } = await escanear();

  const conPdf = modelos.filter((m) => m.planos_pdf.length > 0);
  const conCedula = modelos.filter((m) => m.cedulas_xlsx.length > 0);
  const variosPdf = modelos.filter((m) => m.planos_pdf.length > 1);
  const proyectosPm = proyectos.filter((p) => p.pm);
  const pdfsTotales = modelos.reduce((s, m) => s + m.planos_pdf.length, 0);

  console.log("\n== Servidor de Ingeniería");
  console.log(`  Carpetas de proyecto:        ${proyectos.length} (${proyectosPm.length} con número de PM)`);
  console.log(`  Con carpeta INGENIERIA:      ${proyectos.filter((p) => p.tiene_ingenieria).length}`);
  console.log(`  Modelos con plano o cédula:  ${modelos.length}`);
  console.log(`    con plano PDF:             ${conPdf.length} (${pdfsTotales} PDF en total)`);
  console.log(`    con cédula:                ${conCedula.length}`);
  console.log(`    con varios PDF:            ${variosPdf.length}`);

  console.log("\nLeyendo modelos de la app (solo lectura)...");
  const app = await modelosDeLaApp();
  const comparacion = comparar(app, modelos);

  // Un mismo modelo aparece en varios ítems (padre e hijos): se resume
  // por modelo distinto dentro de cada PM.
  const unicos = new Map<string, Coincidencia>();
  for (const c of comparacion) unicos.set(`${c.pm}|${normalizarModelo(c.modelo)}`, c);
  const resumen = [...unicos.values()];
  const cuenta = (t: TipoCoincidencia) => resumen.filter((c) => c.tipo === t).length;

  console.log("\n== Modelos de la app vs. planos");
  console.log(`  Modelos distintos en la app: ${resumen.length} (${app.length} ítems)`);
  console.log(`  Con plano en su mismo PM:    ${cuenta("mismo_pm")} (${pct(cuenta("mismo_pm"), resumen.length)})`);
  console.log(`  Con plano en otro PM:        ${cuenta("otro_pm")} (${pct(cuenta("otro_pm"), resumen.length)})`);
  console.log(`  Aproximados (otra medida):   ${cuenta("aproximado")} (${pct(cuenta("aproximado"), resumen.length)})`);
  console.log(`  Sin carpeta encontrada:      ${cuenta("sin_plano")} (${pct(cuenta("sin_plano"), resumen.length)})`);
  console.log(`  (de los encontrados, carpeta marcada CANCELADA: ${resumen.filter((c) => c.cancelada).length})`);

  const porPm = new Map<string, Coincidencia[]>();
  for (const c of resumen) porPm.set(c.pm, [...(porPm.get(c.pm) ?? []), c]);
  for (const [pm, lista] of porPm) {
    const carpetaPm = proyectos.find((p) => p.pm === pm);
    console.log(
      `\n  ${pm} (${lista[0].numero_pedido}) — carpeta en servidor: ${carpetaPm ? `"${carpetaPm.nombre}" (${carpetaPm.anio}, ${carpetaPm.modelos} modelos)` : "NO ENCONTRADA"}`
    );
    for (const c of lista.sort((x, y) => x.item_code - y.item_code)) {
      const marca = { mismo_pm: "✓", otro_pm: "~", aproximado: "≈", sin_plano: "✗" }[c.tipo];
      const detalle =
        c.tipo === "sin_plano"
          ? "sin carpeta"
          : `${c.planos} PDF, ${c.cedulas} cédula${c.cancelada ? " [CANCELADA]" : ""} — ${c.carpetas.map((r) => path.basename(r)).join(" | ")}`;
      console.log(`    ${marca} ${c.modelo.padEnd(22)} ${detalle}`);
    }
  }

  await mkdir(SALIDA, { recursive: true });
  await writeFile(
    path.join(SALIDA, "modelos-ingenieria.json"),
    JSON.stringify({ generado: new Date().toISOString(), raiz: RAIZ, proyectos, modelos }, null, 2)
  );
  await writeFile(
    path.join(SALIDA, "modelos-ingenieria.csv"),
    csv(modelos as unknown as Record<string, unknown>[])
  );
  await writeFile(path.join(SALIDA, "comparacion-app.csv"), csv(comparacion as unknown as Record<string, unknown>[]));
  console.log(`\nReporte guardado en ${path.resolve(SALIDA)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
