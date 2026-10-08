// Limpieza de archivos huérfanos del bucket de imágenes de ítems (planeacion-item-imagenes):
// archivos que ninguna fila de planeacion_item_imagenes usa. Ver src/lib/storage/huerfanos.ts
// para de dónde salen.
//
//   npm run db:huerfanos                    SOLO LISTA (no cambia nada). Escribe el detalle en
//                                           .scratch/huerfanos-<fecha>.txt
//   npm run db:huerfanos -- --confirmar     Respalda cada archivo en .scratch/respaldo-huerfanos/
//                                           y después los BORRA (permanente en Storage).
//   npm run db:huerfanos -- --confirmar --prefijo=<id-de-carga>
//                                           Igual, pero solo los de esa carpeta (para ir por etapas).
//
// Usa la clave de servicio de .env.local: apunta a PRODUCCIÓN. Medidas de seguridad:
//  - por defecto no borra nada;
//  - nunca toca archivos de menos de 24 h (una carga en curso sube las imágenes ANTES de
//    registrar sus filas);
//  - se niega a borrar si no logra leer filas de la base (todo parecería huérfano);
//  - respalda todo antes de borrar y aborta sin borrar nada si falla un respaldo;
//  - vuelve a leer la base justo antes de borrar y solo borra lo que sigue sin fila.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  EDAD_MINIMA_MS,
  agruparPorCarga,
  borrarConRespaldo,
  clasificarObjetos,
  pesoLegible,
  rutasReferenciadas,
  type ObjetoStorage,
} from "../../src/lib/storage/huerfanos";

const BUCKET = "planeacion-item-imagenes";
const confirmar = process.argv.includes("--confirmar");
const prefijo = process.argv.find((a) => a.startsWith("--prefijo="))?.slice("--prefijo=".length) ?? "";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa: npm run db:huerfanos).");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function leerRutasEnBase(): Promise<string[]> {
  const rutas: string[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("planeacion_item_imagenes")
      .select("storage_path")
      .order("storage_path")
      .range(desde, desde + 999);
    if (error) throw new Error(`No se pudieron leer las filas de imágenes: ${error.message}`);
    rutas.push(...(data ?? []).map((f) => f.storage_path as string));
    if ((data ?? []).length < 1000) break;
  }
  return rutas;
}

async function listarBucket(prefijo = ""): Promise<ObjetoStorage[]> {
  const salida: ObjetoStorage[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefijo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`No se pudo listar "${prefijo || "/"}": ${error.message}`);
    for (const e of data ?? []) {
      const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.id === null) salida.push(...(await listarBucket(ruta))); // carpeta
      else
        salida.push({
          ruta,
          bytes: Number((e.metadata as { size?: number } | null)?.size ?? 0),
          creado: e.created_at ?? null,
        });
    }
    if ((data ?? []).length < 1000) break;
  }
  return salida;
}

const host = new URL(url).host;
console.log(`Proyecto: ${host}   Bucket: ${BUCKET}   Modo: ${confirmar ? "BORRAR (--confirmar)" : "solo listar"}\n`);

const rutasEnBase = await leerRutasEnBase();
if (rutasEnBase.length === 0) {
  console.error("La tabla planeacion_item_imagenes no devolvió filas: no se puede saber qué es huérfano. Me detengo.");
  process.exit(1);
}
const objetos = await listarBucket();
const clasificado = clasificarObjetos(objetos, rutasReferenciadas(rutasEnBase));
const { referenciados, recientes } = clasificado;
// Con --prefijo solo se consideran los huérfanos de esa carpeta.
const huerfanos = prefijo ? clasificado.huerfanos.filter((o) => o.ruta.startsWith(prefijo)) : clasificado.huerfanos;
const total = (l: ObjetoStorage[]) => l.reduce((s, o) => s + o.bytes, 0);

console.log(`Filas de imágenes en la base ........ ${rutasEnBase.length}`);
console.log(`Archivos en el bucket ............... ${objetos.length} (${pesoLegible(total(objetos))})`);
console.log(`  con fila en la base (se conservan)  ${referenciados.length} (${pesoLegible(total(referenciados))})`);
console.log(`  sin fila, de menos de ${EDAD_MINIMA_MS / 3_600_000} h (no se tocan)  ${recientes.length}`);
console.log(`  HUÉRFANOS (candidatos a borrar) ... ${huerfanos.length} (${pesoLegible(total(huerfanos))})`);

// Filas de la base cuyo archivo no existe (lo contrario de huérfano).
const existentes = new Set(objetos.map((o) => o.ruta));
const filasSinArchivo = rutasEnBase.filter((r) => !existentes.has(r));
console.log(`Filas en la base SIN archivo ........ ${filasSinArchivo.length}${filasSinArchivo.length ? "  ⚠ (imágenes rotas en pantalla)" : ""}`);

// Sin fila pero recientes (no se tocan): se muestran para ver si son de una carga en curso o de
// datos que se acaban de borrar.
if (recientes.length) {
  const gr = agruparPorCarga(recientes);
  const idsRec = gr.map((g) => g.carga).filter((c) => UUID.test(c));
  const estados = new Map<string, string | null>();
  if (idsRec.length) {
    const { data } = await supabase.from("cargas_archivo").select("id, estado").in("id", idsRec);
    for (const c of data ?? []) estados.set(c.id as string, c.estado as string | null);
  }
  console.log(`
Sin fila pero recientes (no se tocan): ${gr.length} cargas`);
  for (const g of gr.slice(0, 8)) {
    console.log(`  ${g.carga}  ${String(g.archivos).padStart(4)} archivos  ${g.desde ?? "?"} → ${g.hasta ?? "?"}  carga: ${estados.has(g.carga) ? estados.get(g.carga) : "sin registro"}`);
  }
  if (gr.length > 8) console.log(`  … y ${gr.length - 8} más`);
}

// De qué cargas vienen los huérfanos y cómo terminaron esas cargas.
const grupos = agruparPorCarga(huerfanos);
const ids = grupos.map((g) => g.carga).filter((c) => UUID.test(c));
const cargas = new Map<string, { nombre_archivo: string | null; estado: string | null; procesado_en: string | null }>();
if (ids.length) {
  const { data } = await supabase.from("cargas_archivo").select("id, nombre_archivo, estado, procesado_en").in("id", ids);
  for (const c of data ?? []) cargas.set(c.id as string, c as never);
}
let deCargaFallida = 0;
let deCargaExitosaBorrada = 0;
let sinRegistroDeCarga = 0;
const lineas: string[] = [];
console.log(`\nHuérfanos por carga de Excel (${grupos.length} carpetas):`);
for (const g of grupos) {
  const c = cargas.get(g.carga);
  const origen = !c ? "sin registro de la carga" : c.estado === "exitoso" ? "carga exitosa (su pedido ya no existe)" : `carga con estado "${c.estado}"`;
  if (!c) sinRegistroDeCarga += g.archivos;
  else if (c.estado === "exitoso") deCargaExitosaBorrada += g.archivos;
  else deCargaFallida += g.archivos;
  const fila = `${g.carga}  ${String(g.archivos).padStart(4)} archivos  ${pesoLegible(g.bytes).padStart(8)}  ${g.desde?.slice(0, 10) ?? "?"} → ${g.hasta?.slice(0, 10) ?? "?"}  ${origen}${c?.nombre_archivo ? `  «${c.nombre_archivo}»` : ""}`;
  lineas.push(fila);
}
for (const l of lineas.slice(0, 12)) console.log("  " + l);
if (lineas.length > 12) console.log(`  … y ${lineas.length - 12} carpetas más (detalle completo en el archivo)`);
console.log(`\nOrigen de los huérfanos: carga exitosa cuyo pedido ya no existe: ${deCargaExitosaBorrada} · carga fallida/en error: ${deCargaFallida} · sin registro de carga: ${sinRegistroDeCarga}`);

mkdirSync(".scratch", { recursive: true });
const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const archivoDetalle = `.scratch/huerfanos-${sello}.txt`;
writeFileSync(
  archivoDetalle,
  [
    `# Huérfanos de ${BUCKET} en ${host} — ${new Date().toISOString()}`,
    `# ${huerfanos.length} archivos, ${pesoLegible(total(huerfanos))}`,
    "",
    "## Por carga",
    ...lineas,
    "",
    "## Archivos",
    ...huerfanos.map((o) => `${o.ruta}\t${o.bytes}\t${o.creado ?? ""}`),
  ].join("\n")
);
console.log(`\nDetalle completo: ${archivoDetalle}`);

if (!confirmar) {
  console.log("\nEsto fue SOLO una revisión: no se cambió nada. Para respaldar y borrar los huérfanos: npm run db:huerfanos -- --confirmar");
  process.exit(0);
}

// ---- Borrado ----------------------------------------------------------------------------
if (huerfanos.length === 0) {
  console.log("\nNo hay huérfanos que borrar.");
  process.exit(0);
}

// Vuelve a leer la base: solo se borra lo que SIGUE sin fila (por si alguien cargó algo mientras tanto).
const refsAhora = rutasReferenciadas(await leerRutasEnBase());
const porBorrar = huerfanos.filter((o) => !refsAhora.has(o.ruta));
console.log(`\nRevisión final contra la base: ${porBorrar.length} de ${huerfanos.length} siguen sin fila.`);

const carpetaRespaldo = join(".scratch", "respaldo-huerfanos", sello);
console.log(`Respaldando en ${carpetaRespaldo} y borrando…`);
const { borrados } = await borrarConRespaldo(porBorrar, {
  descargar: async (ruta) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(ruta);
    return error || !data ? null : new Uint8Array(await data.arrayBuffer());
  },
  guardarRespaldo: async (ruta, contenido) => {
    const destino = join(carpetaRespaldo, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  },
  borrarLote: async (rutas) => {
    const { error } = await supabase.storage.from(BUCKET).remove(rutas);
    if (error) throw new Error(error.message);
  },
  progreso: (m) => console.log("  " + m),
});
const despues = await listarBucket();
console.log(`Borrados: ${borrados}. Archivos que quedan en el bucket: ${despues.length} (antes ${objetos.length}).`);
console.log(`Si hubiera que deshacerlo, los archivos están en ${carpetaRespaldo}.`);
