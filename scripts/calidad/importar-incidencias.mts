/**
 * Importa las incidencias de Calidad del Excel BD-CONTROL26 (hojas MADERA 26 y
 * METAL 26) a public.incidencias_calidad.
 *
 * Por defecto solo SIMULA: lee el Excel, limpia cada fila y muestra el
 * resultado sin escribir nada. Con --aplicar escribe en la base a la que apunte
 * .env.local (producción), así que primero hay que haber revisado la simulación
 * y tener aplicada la migración `incidencias_calidad`.
 *
 * Repetirlo no duplica: cada fila se identifica por "<línea>:<fila de la hoja>"
 * (columna origen_importacion) y se actualiza en lugar de insertarse otra vez.
 *
 * Uso:
 *   npm run calidad:importar-incidencias -- "ruta/al/BD-CONTROL26.xlsx"            (simula)
 *   npm run calidad:importar-incidencias -- "ruta/al/BD-CONTROL26.xlsx" --aplicar  (escribe)
 */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import {
  incidenciaDesdeFilaExcel,
  resumirIncidencias,
  type Incidencia,
  type Linea,
  type NuevaIncidencia,
} from "../../src/lib/calidad/incidencias.ts";

const HOJAS: ReadonlyArray<readonly [string, Linea]> = [
  ["MADERA 26", "madera"],
  ["METAL 26", "metal"],
];
const PRIMERA_FILA_DATOS = 3;
// Columnas de las hojas (la fila 2 trae los encabezados).
const COL = { folio: 2, tipo: 4, proyecto: 6, mueble: 7, area: 10, motivo: 14, origen: 19, reporta: 20, estado: 23 };
const LOTE = 200;

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const ruta = args.find((a) => !a.startsWith("--"));
if (!ruta) {
  console.error('Falta la ruta del Excel. Ejemplo: npm run calidad:importar-incidencias -- "C:/ruta/BD-CONTROL26.xlsx"');
  process.exit(1);
}

function valorDeCelda(celda: ExcelJS.Cell): unknown {
  const v = celda.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if (o.result !== undefined) return o.result;
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text !== undefined) return o.text;
    return "";
  }
  return v;
}

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(ruta);

const nuevas: NuevaIncidencia[] = [];
const omitidas: string[] = [];
const conAvisos: Array<{ clave: string; avisos: string[] }> = [];

for (const [nombreHoja, linea] of HOJAS) {
  const hoja = libro.getWorksheet(nombreHoja);
  if (!hoja) {
    console.error(`No encuentro la hoja "${nombreHoja}" en el Excel.`);
    process.exit(1);
  }
  for (let n = PRIMERA_FILA_DATOS; n <= hoja.rowCount; n++) {
    const fila = hoja.getRow(n);
    const g = (col: number) => valorDeCelda(fila.getCell(col));
    // Una fila sin folio es una fila vacía de la hoja; el folio solo sirve para esto.
    if (!String(g(COL.folio) ?? "").trim()) continue;
    const { incidencia, avisos } = incidenciaDesdeFilaExcel(linea, n, {
      tipo: g(COL.tipo),
      proyecto: g(COL.proyecto),
      mueble: g(COL.mueble),
      area: g(COL.area),
      motivo: g(COL.motivo),
      origen: g(COL.origen),
      reporta: g(COL.reporta),
      estado: g(COL.estado),
    });
    const clave = `${linea}:${n}`;
    if (!incidencia) {
      omitidas.push(`${clave} → ${avisos.join("; ")}`);
      continue;
    }
    if (avisos.length) conAvisos.push({ clave, avisos });
    nuevas.push(incidencia);
  }
}

const filas: Incidencia[] = nuevas.map((n, i) => ({ ...n, id: String(i) }));
const r = resumirIncidencias(filas);
const lista = (c: Array<{ nombre: string; total: number }>, n = 8) =>
  c.slice(0, n).map((x) => `${x.nombre} (${x.total})`).join(", ");

console.log(`\nModo: ${aplicar ? "APLICAR (escribe en la base)" : "SIMULACIÓN (no escribe nada)"}`);
console.log(`Filas leídas: ${nuevas.length + omitidas.length} · a importar: ${nuevas.length} · omitidas: ${omitidas.length}`);
console.log(`Madera ${r.porLinea.madera} · Metal ${r.porLinea.metal} · abiertas ${r.abiertas} · cerradas ${r.cerradas}`);
console.log(`Tipos: ${lista(r.porTipo)}`);
console.log(`Áreas (${r.porArea.length} distintas): ${lista(r.porArea)}`);
console.log(`Área que reporta (${r.porAreaQueReporta.length} distintas): ${lista(r.porAreaQueReporta)}`);
console.log(`Categorías: ${lista(r.porCategoria, 9)}`);
console.log(`Proyectos (${r.porProyecto.length} distintos): ${lista(r.porProyecto, 5)}`);
if (omitidas.length) console.log(`\nOmitidas:\n  ${omitidas.join("\n  ")}`);
const resumenAvisos = new Map<string, number>();
for (const a of conAvisos) for (const t of a.avisos) resumenAvisos.set(t, (resumenAvisos.get(t) ?? 0) + 1);
if (resumenAvisos.size) {
  console.log("\nAvisos (filas que se importan pero con algo vacío):");
  for (const [t, n] of resumenAvisos) console.log(`  ${t}: ${n}`);
}

if (!aplicar) {
  console.log("\nNo se escribió nada. Para cargar a la base: repetir con --aplicar.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (se leen de .env.local con --env-file).");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { autoRefreshToken: false, persistSession: false } });

let escritas = 0;
for (let i = 0; i < nuevas.length; i += LOTE) {
  const lote = nuevas.slice(i, i + LOTE);
  const { error } = await supabase.from("incidencias_calidad").upsert(lote, { onConflict: "origen_importacion" });
  if (error) {
    console.error(`\nFalló el lote que empieza en la fila ${i + 1}: ${error.message}`);
    console.error(`Se alcanzaron a escribir ${escritas}. Repetir el comando es seguro: no duplica.`);
    process.exit(1);
  }
  escritas += lote.length;
}
console.log(`\nListo: ${escritas} incidencias escritas (las que ya existían se actualizaron).`);
