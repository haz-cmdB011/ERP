/**
 * Importa las incidencias de Calidad del Excel BD-CONTROL26 (hojas MADERA 26 y
 * METAL 26) a public.incidencias_calidad.
 *
 * Por defecto solo SIMULA: lee el Excel, limpia cada fila y muestra el
 * resultado sin escribir nada. Con --aplicar escribe en la base a la que apunte
 * .env.local (producción), así que primero hay que haber revisado la simulación
 * y tener aplicada la migración `incidencias_calidad`.
 *
 * Por defecto SOLO AGREGA las filas que aún no están y deja intactas las que ya
 * existen: desde que se captura y se cierra en la app, recargar el Excel no debe
 * pisar esos cambios. Con --actualizar sí sobrescribe las existentes con lo que
 * diga el Excel (para corregir una carga).
 *
 * Repetirlo no duplica: cada fila se identifica por "<línea>:<fila de la hoja>"
 * (columna origen_importacion) y se actualiza en lugar de insertarse otra vez.
 *
 * Uso:
 *   npm run calidad:importar-incidencias -- "ruta/al/BD-CONTROL26.xlsx"            (simula)
 *   npm run calidad:importar-incidencias -- "ruta/al/BD-CONTROL26.xlsx" --aplicar  (agrega las que faltan)
 *   … --aplicar --actualizar                                                       (también sobrescribe las existentes)
 *   … --aplicar --textos                                                           (solo completa descripción, solución y
 *                                                                                    seguimiento de las que aún no los tienen)
 */
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import {
  resumirIncidencias,
  resumirPorAuditor,
  resumirPorSemana,
  type Incidencia,
} from "../../src/lib/calidad/incidencias.ts";
import { leerIncidenciasDeLibro } from "../../src/lib/calidad/importar-incidencias.ts";

const LOTE = 200;

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const actualizar = args.includes("--actualizar");
const soloTextos = args.includes("--textos");
const ruta = args.find((a) => !a.startsWith("--"));
if (!ruta) {
  console.error('Falta la ruta del Excel. Ejemplo: npm run calidad:importar-incidencias -- "C:/ruta/BD-CONTROL26.xlsx"');
  process.exit(1);
}

const libro = new ExcelJS.Workbook();
await libro.xlsx.readFile(ruta);

// La lectura es la misma que usa el botón "Importar Excel" de No conformidades (hojas MADERA y METAL de
// cualquier año).
const lectura = leerIncidenciasDeLibro(libro);
if (lectura.hojas.length === 0) {
  console.error("No encuentro hojas de madera ni de metal en el Excel (se esperan nombres como \"MADERA 26\" y \"METAL 26\").");
  process.exit(1);
}
const nuevas = lectura.incidencias;
const omitidas = lectura.omitidas.map((o) => `${o.donde} → ${o.motivo}`);
const conAvisos = [...lectura.avisos].map(([aviso, n]) => ({ aviso, n }));

const filas: Incidencia[] = nuevas.map((n, i) => ({ ...n, id: String(i) }));
const r = resumirIncidencias(filas);
const lista = (c: Array<{ nombre: string; total: number }>, n = 8) =>
  c.slice(0, n).map((x) => `${x.nombre} (${x.total})`).join(", ");

console.log(
  `\nModo: ${
    aplicar
      ? `APLICAR (escribe en la base; ${soloTextos ? "solo completa los textos del reporte" : actualizar ? "sobrescribe las existentes" : "solo agrega las que faltan"})`
      : "SIMULACIÓN (no escribe nada)"
  }`
);
console.log(`Filas leídas: ${nuevas.length + omitidas.length} · a importar: ${nuevas.length} · omitidas: ${omitidas.length}`);
console.log(`Madera ${r.porLinea.madera} · Metal ${r.porLinea.metal} · abiertas ${r.abiertas} · cerradas ${r.cerradas}`);
const porSemana = resumirPorSemana(filas);
console.log(`Semanas: ${porSemana.semanas.length} (de ${porSemana.semanas[0]?.clave} a ${porSemana.semanas.at(-1)?.clave}) · sin fecha: ${porSemana.sinFecha}`);
console.log(`Auditores: ${resumirPorAuditor(filas).map((a) => `${a.nombre} (${a.total})`).join(", ")}`);
console.log(
  `Texto del reporte: descripción ${nuevas.filter((n) => n.descripcion).length}, solución ${nuevas.filter((n) => n.solucion).length}, seguimiento ${nuevas.filter((n) => n.seguimiento).length} de ${nuevas.length}`
);
console.log(`Tipos: ${lista(r.porTipo)}`);
console.log(`Áreas (${r.porArea.length} distintas): ${lista(r.porArea)}`);
console.log(`Área que reporta (${r.porAreaQueReporta.length} distintas): ${lista(r.porAreaQueReporta)}`);
console.log(`Categorías: ${lista(r.porCategoria, 9)}`);
console.log(`Proyectos (${r.porProyecto.length} distintos): ${lista(r.porProyecto, 5)}`);
if (omitidas.length) console.log(`\nOmitidas:\n  ${omitidas.join("\n  ")}`);
if (conAvisos.length) {
  console.log("\nAvisos (filas que se importan pero con algo vacío):");
  for (const { aviso, n } of conAvisos) console.log(`  ${aviso}: ${n}`);
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

// --textos: solo llena la descripción, la solución y el seguimiento de las filas que ya están en la
// base y todavía no tienen ninguno de los tres. No toca nada más (ni lo cerrado desde la app ni lo
// editado) y no pisa un texto ya escrito.
if (soloTextos) {
  const conTexto = nuevas.filter((n) => n.descripcion || n.solucion || n.seguimiento);
  let completadas = 0;
  let yaTenian = 0;
  for (let i = 0; i < conTexto.length; i += 10) {
    const tanda = conTexto.slice(i, i + 10);
    const resultados = await Promise.all(
      tanda.map((n) =>
        supabase
          .from("incidencias_calidad")
          .update({ descripcion: n.descripcion, solucion: n.solucion, seguimiento: n.seguimiento })
          .eq("origen_importacion", n.origen_importacion!)
          .is("descripcion", null)
          .is("solucion", null)
          .is("seguimiento", null)
          .select("id")
      )
    );
    for (const r of resultados) {
      if (r.error) {
        console.error(`
Falló al completar textos: ${r.error.message}`);
        console.error(`Se completaron ${completadas}. Repetir el comando es seguro: no pisa lo ya escrito.`);
        process.exit(1);
      }
      if (r.data && r.data.length > 0) completadas++;
      else yaTenian++;
    }
  }
  console.log(`
Listo: ${completadas} reportes con su texto completado; ${yaTenian} ya tenían texto o no están en la base.`);
  process.exit(0);
}

let escritas = 0;
for (let i = 0; i < nuevas.length; i += LOTE) {
  const lote = nuevas.slice(i, i + LOTE);
  const { error } = await supabase.from("incidencias_calidad").upsert(lote, { onConflict: "origen_importacion", ignoreDuplicates: !actualizar });
  if (error) {
    console.error(`\nFalló el lote que empieza en la fila ${i + 1}: ${error.message}`);
    console.error(`Se alcanzaron a escribir ${escritas}. Repetir el comando es seguro: no duplica.`);
    process.exit(1);
  }
  escritas += lote.length;
}
console.log(
  `\nListo: ${escritas} filas enviadas (${
    actualizar ? "las que ya existían se actualizaron" : "las que ya existían se dejaron como estaban"
  }).`
);
