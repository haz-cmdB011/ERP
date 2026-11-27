// Respaldo de los DATOS de la base (las tablas, los usuarios y los archivos de Storage) a una carpeta
// local. El esquema (tablas, funciones, reglas) no hace falta: vive en supabase/migrations/.
//
//   npm run db:respaldo                  Respalda todo en respaldos/<AAAA-MM-DD_HHMM>/
//   npm run db:respaldo -- --sin-archivos  Igual, sin descargar los archivos de Storage (solo su lista).
//
// SOLO LEE: no escribe, no borra ni cambia nada en la base ni en Storage. Usa la clave de servicio de
// .env.local (apunta a PRODUCCIÓN) y lee por la API de Supabase, por páginas de 1000 filas ordenadas por
// la llave primaria, así que una tabla grande no se corta en silencio. Al final compara las filas
// guardadas de cada tabla con las que cuenta la base y avisa si alguna no cuadra (el comando termina con
// error, para que no se tome por bueno un respaldo incompleto).
//
// La carpeta respaldos/ trae datos reales (nombres, correos, recibos): está en .gitignore y NO se sube a
// Git. Guárdala en un lugar seguro (Drive de la empresa, disco externo). Cómo restaurar: docs/operacion.md.

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  nombreCarpetaRespaldo,
  tablasDeEspecificacion,
  tablasIncompletas,
  type ResultadoTabla,
  type TablaRespaldo,
} from "../../src/lib/respaldo/respaldo";

const POR_PAGINA = 1000;
const sinArchivos = process.argv.includes("--sin-archivos");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (usa: npm run db:respaldo).");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });

const carpeta = join("respaldos", nombreCarpetaRespaldo(new Date()));

function guardar(ruta: string, datos: unknown) {
  const destino = join(carpeta, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, JSON.stringify(datos, null, 1));
}

async function leerTablas(): Promise<TablaRespaldo[]> {
  const respuesta = await fetch(`${url}/rest/v1/`, { headers: { apikey: clave!, Authorization: `Bearer ${clave}` } });
  if (!respuesta.ok) throw new Error(`No se pudo leer la lista de tablas (HTTP ${respuesta.status}).`);
  return tablasDeEspecificacion(await respuesta.json());
}

async function respaldarTabla({ tabla, orden }: TablaRespaldo): Promise<ResultadoTabla> {
  const conteo = await supabase.from(tabla).select("*", { count: "exact", head: true });
  const esperadas = conteo.error ? null : conteo.count;
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    let consulta = supabase.from(tabla).select("*");
    for (const columna of orden) consulta = consulta.order(columna, { ascending: true });
    const { data, error } = await consulta.range(desde, desde + POR_PAGINA - 1);
    if (error) return { tabla, filas: filas.length, esperadas, error: error.message };
    filas.push(...(data ?? []));
    if (!data || data.length < POR_PAGINA) break;
  }
  guardar(join("tablas", `${tabla}.json`), filas);
  return { tabla, filas: filas.length, esperadas };
}

async function respaldarUsuarios(): Promise<number> {
  const usuarios: unknown[] = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(`No se pudo leer los usuarios: ${error.message}`);
    usuarios.push(...data.users);
    if (data.users.length < 1000) break;
  }
  // Las contraseñas no salen por la API (ni se deben guardar): al restaurar, cada quien la restablece.
  guardar("usuarios.json", usuarios);
  return usuarios.length;
}

type Archivo = { bucket: string; ruta: string; tamano: number | null; descargado: boolean; error?: string };

async function listarCarpeta(bucket: string, prefijo: string): Promise<{ ruta: string; tamano: number | null }[]> {
  const salida: { ruta: string; tamano: number | null }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefijo, { limit: 1000, offset: desde });
    if (error) throw new Error(`No se pudo listar ${bucket}/${prefijo}: ${error.message}`);
    for (const entrada of data ?? []) {
      const ruta = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
      if (entrada.id === null) salida.push(...(await listarCarpeta(bucket, ruta))); // es una carpeta
      else salida.push({ ruta, tamano: (entrada.metadata?.size as number | undefined) ?? null });
    }
    if (!data || data.length < 1000) break;
  }
  return salida;
}

async function respaldarArchivos(): Promise<Archivo[]> {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`No se pudo leer los buckets: ${error.message}`);
  const archivos: Archivo[] = [];
  for (const bucket of buckets ?? []) {
    for (const { ruta, tamano } of await listarCarpeta(bucket.id, "")) {
      const archivo: Archivo = { bucket: bucket.id, ruta, tamano, descargado: false };
      if (!sinArchivos) {
        const descarga = await supabase.storage.from(bucket.id).download(ruta);
        if (descarga.error) archivo.error = descarga.error.message;
        else {
          const destino = join(carpeta, "archivos", bucket.id, ruta);
          mkdirSync(dirname(destino), { recursive: true });
          writeFileSync(destino, Buffer.from(await descarga.data.arrayBuffer()));
          archivo.descargado = true;
        }
      }
      archivos.push(archivo);
    }
  }
  guardar("archivos.json", archivos);
  return archivos;
}

function ultimaMigracion(): string {
  return readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort().at(-1) ?? "";
}

async function main() {
  console.log(`Respaldo de datos → ${carpeta}  (solo lectura)`);
  const tablas = await leerTablas();
  if (tablas.length === 0) throw new Error("La API no devolvió ninguna tabla: no se respalda nada.");

  const resultados: ResultadoTabla[] = [];
  for (const tabla of tablas) {
    const resultado = await respaldarTabla(tabla);
    resultados.push(resultado);
    const aviso = resultado.error ? `  ERROR: ${resultado.error}` : tabla.orden.length === 0 ? "  (sin llave primaria)" : "";
    console.log(`  ${tabla.tabla.padEnd(40)} ${String(resultado.filas).padStart(7)}${aviso}`);
  }
  const usuarios = await respaldarUsuarios();
  console.log(`  ${"usuarios (auth)".padEnd(40)} ${String(usuarios).padStart(7)}`);
  const archivos = await respaldarArchivos();
  const fallidos = archivos.filter((a) => a.error);
  console.log(
    `  ${"archivos de Storage".padEnd(40)} ${String(archivos.length).padStart(7)}` +
      (sinArchivos ? "  (solo la lista)" : fallidos.length ? `  ERROR en ${fallidos.length}` : "")
  );

  const incompletas = tablasIncompletas(resultados);
  guardar("manifiesto.json", {
    creado_en: new Date().toISOString(),
    proyecto: new URL(url!).hostname.split(".")[0],
    ultima_migracion_del_repo: ultimaMigracion(),
    tablas: resultados,
    usuarios,
    archivos: { total: archivos.length, descargados: archivos.filter((a) => a.descargado).length, con_error: fallidos.length },
    completo: incompletas.length === 0 && fallidos.length === 0,
  });

  if (incompletas.length > 0 || fallidos.length > 0) {
    for (const t of incompletas) {
      console.error(`INCOMPLETO: ${t.tabla} (${t.filas} de ${t.esperadas ?? "?"} filas)${t.error ? ` — ${t.error}` : ""}`);
    }
    for (const a of fallidos) console.error(`ARCHIVO SIN DESCARGAR: ${a.bucket}/${a.ruta} — ${a.error}`);
    console.error("El respaldo NO está completo. Vuelve a correrlo; si se repite, revisa el error.");
    process.exit(1);
  }
  console.log(`Listo: ${tablas.length} tablas, ${usuarios} usuarios y ${archivos.length} archivos. Guarda la carpeta en un lugar seguro.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
