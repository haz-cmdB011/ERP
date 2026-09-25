/**
 * Sincroniza los planos PDF del servidor de Ingeniería con Supabase.
 *
 *   I:\O. T´s. <AÑO>\<PM>\INGENIERIA\<MODELO>\PLANOS\*.pdf
 *     → bucket privado "planos" + tabla public.planos (un registro por PDF)
 *
 * - Por defecto solo sincroniza los planos de los PM que existen en la app
 *   (el plan gratuito de Supabase da 1 GB y el servidor completo pesa ~1.8
 *   GB). Con --todos sincroniza todo el servidor.
 * - Solo lee y sube lo nuevo o lo que cambió (compara tamaño y fecha de
 *   modificación contra lo ya sincronizado; no vuelve a leer lo demás).
 * - Los objetos se nombran por el hash del contenido: un PDF idéntico
 *   copiado en varios PM se sube una sola vez.
 * - Los PDF que ya no están en el servidor se dan de baja, pero solo de
 *   los años cuya carpeta sí se pudo leer, y con un tope de seguridad (ver
 *   MAX_BAJAS_SIN_FORZAR) para que un fallo de red no borre todo.
 * - Si la unidad no está disponible (PC fuera de la red), termina sin error.
 *
 * Pensado para correr sin supervisión (Programador de tareas de Windows).
 *
 * Uso:
 *   node scripts/planos/sincronizar-planos.mts [--simular] [--todos] [--raiz I:/] [--anios 2025,2026]
 *                                             [--limite N] [--forzar-bajas] [--log ruta]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { normalizarNumeroPM } from "../../src/lib/planeacion/numero-pm.ts";
import { access, appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  aniosPorDefecto,
  arg,
  bandera,
  enParalelo,
  escanear,
  leerEnv,
  type ArchivoPdf,
  type ModeloIngenieria,
} from "./escaneo.mts";

const RAIZ = arg("raiz", "I:/");
const ANIOS = arg("anios", aniosPorDefecto()).split(",").map((a) => a.trim());
const SIMULAR = bandera("simular");
const FORZAR_BAJAS = bandera("forzar-bajas");
const TODOS = bandera("todos");
const LIMITE = Number(arg("limite", "0")) || Infinity;
const RUTA_LOG = arg(
  "log",
  path.join(import.meta.dirname, "../../planos-reporte/sincronizacion.log")
);

const BUCKET = "planos";
const LOTE_UPSERT = 500;
const SUBIDAS_EN_PARALELO = 4;
// Si en una pasada desaparecen más planos que esto (y más del 10% de los
// registrados en esos años), se asume un problema de lectura y no se da de
// baja nada, salvo con --forzar-bajas.
const MAX_BAJAS_SIN_FORZAR = 25;

// ------------------------------------------------------------------- bitácora

const lineas: string[] = [];
function log(linea: string) {
  console.log(linea);
  lineas.push(linea);
}

async function guardarLog() {
  await mkdir(path.dirname(RUTA_LOG), { recursive: true });
  await appendFile(RUTA_LOG, lineas.join("\n") + "\n\n");
}

// -------------------------------------------------------------------- tipos

interface PlanoRow {
  id: string;
  ruta_origen: string;
  anio: number;
  storage_path: string;
  tamano_bytes: number;
  modificado_en: string;
}

interface PlanoNuevo {
  ruta_origen: string;
  anio: number;
  carpeta_proyecto: string;
  pm: string | null;
  modelo_carpeta: string;
  modelo_normalizado: string;
  cancelada: boolean;
  nombre_archivo: string;
  storage_path: string;
  sha256: string;
  tamano_bytes: number;
  modificado_en: string;
  sincronizado_en: string;
}

// Postgres guarda microsegundos y Node da milisegundos con decimales: se
// compara al milisegundo entero.
function fechaMs(fecha: Date | string): number {
  return Math.floor(new Date(fecha).getTime());
}

// --------------------------------------------------------------- base de datos

async function planosRegistrados(supabase: SupabaseClient): Promise<PlanoRow[] | null> {
  const filas: PlanoRow[] = [];
  const pagina = 1000;
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await supabase
      .from("planos")
      .select("id, ruta_origen, anio, storage_path, tamano_bytes, modificado_en")
      .order("id")
      .range(desde, desde + pagina - 1)
      .returns<PlanoRow[]>();
    if (error) {
      // En --simular antes de aplicar la migración, la tabla aún no existe.
      if (SIMULAR) {
        log(`  (no se pudo leer la tabla planos: ${error.message}; se simula como vacía)`);
        return null;
      }
      throw new Error(`No se pudo leer la tabla planos: ${error.message}`);
    }
    filas.push(...(data ?? []));
    if (!data || data.length < pagina) return filas;
  }
}

// PM de los pedidos no eliminados de la app, en formato canónico (PM009-26).
async function pmsDeLaApp(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("numero_pedido, fecha_pedido")
    .is("eliminado_en", null)
    .returns<{ numero_pedido: string; fecha_pedido: string | null }[]>();
  if (error) throw new Error(`No se pudieron leer los pedidos: ${error.message}`);
  return new Set(
    (data ?? []).map((p) => normalizarNumeroPM(p.numero_pedido, { fechaPedido: p.fecha_pedido }))
  );
}

async function subirPdf(
  supabase: SupabaseClient,
  archivo: ArchivoPdf,
  modelo: ModeloIngenieria,
  objetosExistentes: Set<string>
): Promise<PlanoNuevo> {
  const contenido = await readFile(archivo.ruta_absoluta);
  const sha256 = createHash("sha256").update(contenido).digest("hex");
  const storagePath = `${sha256.slice(0, 2)}/${sha256}.pdf`;

  if (!objetosExistentes.has(storagePath)) {
    objetosExistentes.add(storagePath);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, contenido, {
      contentType: "application/pdf",
      upsert: false,
    });
    // Otro registro (u otra pasada interrumpida) ya subió este mismo contenido.
    if (error && !/exists|duplicate/i.test(error.message)) {
      objetosExistentes.delete(storagePath);
      throw new Error(`No se pudo subir ${archivo.ruta_origen}: ${error.message}`);
    }
  }

  return {
    ruta_origen: archivo.ruta_origen,
    anio: Number(modelo.anio),
    carpeta_proyecto: modelo.carpeta_proyecto,
    pm: modelo.pm,
    modelo_carpeta: modelo.modelo_carpeta,
    modelo_normalizado: modelo.modelo_normalizado,
    cancelada: modelo.cancelada,
    nombre_archivo: archivo.nombre,
    storage_path: storagePath,
    sha256,
    tamano_bytes: archivo.tamano_bytes,
    modificado_en: new Date(fechaMs(archivo.modificado_en)).toISOString(),
    sincronizado_en: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------- main

async function main() {
  const inicio = Date.now();
  log(`== Sincronización de planos ${new Date().toLocaleString("es-MX")}${SIMULAR ? " (SIMULACIÓN: no se escribe nada)" : ""}`);

  try {
    await access(RAIZ);
  } catch {
    log(`  ${RAIZ} no está disponible (¿fuera de la red de la empresa?). No se hace nada.`);
    return;
  }

  const { modelos, aniosLeidos } = await escanear(RAIZ, ANIOS, log);
  if (aniosLeidos.length === 0) {
    log("  No se pudo leer ninguna carpeta de años. No se hace nada.");
    return;
  }

  const env = await leerEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const pms = TODOS ? null : await pmsDeLaApp(supabase);
  if (pms) log(`  PM en la app: ${pms.size} (${[...pms].join(", ")})`);
  const seSincroniza = (pm: string | null) => !pms || (pm !== null && pms.has(pm));

  const registrados = (await planosRegistrados(supabase)) ?? [];
  const porRuta = new Map(registrados.map((r) => [r.ruta_origen, r]));
  const objetosExistentes = new Set(registrados.map((r) => r.storage_path));

  // 1. Qué hay que subir: nuevos, o con tamaño/fecha distintos a lo registrado.
  const enServidor = modelos
    .filter((m) => seSincroniza(m.pm))
    .flatMap((m) => m.planos_pdf.map((archivo) => ({ archivo, modelo: m })));
  const rutasEnServidor = new Set(enServidor.map((e) => e.archivo.ruta_origen));
  const pendientes = enServidor.filter(({ archivo }) => {
    const r = porRuta.get(archivo.ruta_origen);
    return (
      !r ||
      Number(r.tamano_bytes) !== archivo.tamano_bytes ||
      fechaMs(r.modificado_en) !== fechaMs(archivo.modificado_en)
    );
  });
  const nuevos = pendientes.filter((p) => !porRuta.has(p.archivo.ruta_origen)).length;
  const aProcesar = pendientes.slice(0, LIMITE);
  const mb = aProcesar.reduce((s, p) => s + p.archivo.tamano_bytes, 0) / 1024 / 1024;
  log(
    `  PDF a sincronizar: ${enServidor.length}${pms ? ` (de ${modelos.reduce((s, m) => s + m.planos_pdf.length, 0)} en el servidor)` : ""} · ya sincronizados sin cambios: ${enServidor.length - pendientes.length} · nuevos: ${nuevos} · modificados: ${pendientes.length - nuevos}`
  );
  if (aProcesar.length < pendientes.length) {
    log(`  (--limite ${LIMITE}: se procesan solo ${aProcesar.length} de ${pendientes.length})`);
  }

  // 2. Bajas: registrados de los años leídos que ya no están en el servidor
  //    (o cuyo PM ya no está en la app, por ejemplo un pedido eliminado).
  const bajas = registrados.filter(
    (r) => aniosLeidos.includes(String(r.anio)) && !rutasEnServidor.has(r.ruta_origen)
  );
  const registradosEnAnios = registrados.filter((r) => aniosLeidos.includes(String(r.anio))).length;
  const bajasSospechosas =
    bajas.length > MAX_BAJAS_SIN_FORZAR && bajas.length > registradosEnAnios * 0.1;
  const bajasAplicables = bajasSospechosas && !FORZAR_BAJAS ? [] : bajas;
  log(`  Ya no están en el servidor o en la app: ${bajas.length}`);
  if (bajasSospechosas && !FORZAR_BAJAS) {
    log(
      `  ⚠ Son demasiadas bajas de golpe (${bajas.length} de ${registradosEnAnios}); puede ser un problema de lectura de la red. No se da de baja nada. Si es correcto, correr con --forzar-bajas.`
    );
  }

  if (SIMULAR) {
    log(`  Se subirían ${aProcesar.length} PDF (${mb.toFixed(1)} MB, menos los repetidos) y se darían de baja ${bajasAplicables.length}.`);
    for (const { archivo } of aProcesar.slice(0, 10)) log(`    + ${archivo.ruta_origen}`);
    if (aProcesar.length > 10) log(`    ... y ${aProcesar.length - 10} más`);
    for (const b of bajasAplicables.slice(0, 10)) log(`    - ${b.ruta_origen}`);
    return;
  }

  // 3. Subir y registrar.
  let errores = 0;
  let subidos = 0;
  const filas: PlanoNuevo[] = [];
  await enParalelo(
    Array.from({ length: SUBIDAS_EN_PARALELO }, (_, i) => i),
    async (hilo) => {
      for (let i = hilo; i < aProcesar.length; i += SUBIDAS_EN_PARALELO) {
        const { archivo, modelo } = aProcesar[i];
        try {
          filas.push(await subirPdf(supabase, archivo, modelo, objetosExistentes));
          subidos++;
          if (subidos % 100 === 0) log(`    ${subidos}/${aProcesar.length}...`);
        } catch (err) {
          errores++;
          log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  );

  for (let i = 0; i < filas.length; i += LOTE_UPSERT) {
    const { error } = await supabase
      .from("planos")
      .upsert(filas.slice(i, i + LOTE_UPSERT), { onConflict: "ruta_origen" });
    if (error) throw new Error(`No se pudieron registrar los planos: ${error.message}`);
  }

  // 4. Dar de baja los que ya no están.
  for (let i = 0; i < bajasAplicables.length; i += LOTE_UPSERT) {
    const ids = bajasAplicables.slice(i, i + LOTE_UPSERT).map((b) => b.id);
    const { error } = await supabase.from("planos").delete().in("id", ids);
    if (error) throw new Error(`No se pudieron dar de baja planos: ${error.message}`);
  }

  // 5. Borrar del bucket los objetos que ya ningún registro usa (de planos
  //    dados de baja o cuyo contenido cambió).
  const reemplazados = filas
    .map((f) => porRuta.get(f.ruta_origen))
    .filter((r): r is PlanoRow => !!r)
    .map((r) => r.storage_path);
  const candidatos = new Set([...bajasAplicables.map((b) => b.storage_path), ...reemplazados]);
  let huerfanos: string[] = [];
  if (candidatos.size > 0) {
    const { data: enUso, error } = await supabase
      .from("planos")
      .select("storage_path")
      .in("storage_path", [...candidatos]);
    if (error) throw new Error(`No se pudo revisar objetos en uso: ${error.message}`);
    const usados = new Set((enUso ?? []).map((r) => r.storage_path));
    huerfanos = [...candidatos].filter((p) => !usados.has(p));
    if (huerfanos.length > 0) {
      const { error: errorBorrado } = await supabase.storage.from(BUCKET).remove(huerfanos);
      if (errorBorrado) log(`  ⚠ No se pudieron borrar objetos sin uso: ${errorBorrado.message}`);
    }
  }

  log(
    `  Listo en ${((Date.now() - inicio) / 1000).toFixed(0)} s: ${filas.length} registrados/actualizados, ${bajasAplicables.length} dados de baja, ${huerfanos.length} objetos sin uso borrados, ${errores} errores.`
  );
  if (errores > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    log(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(guardarLog);
