/**
 * Sincroniza las especificaciones de los planos PDF del servidor de
 * Ingeniería con la tabla public.planos de Supabase.
 *
 *   I:\O. T´s. <AÑO>\<PM>\INGENIERIA\<MODELO>\PLANOS\*.pdf
 *     → un registro por PDF con los datos de su cuadro de datos
 *
 * - Los PDF NO se suben: solo se lee su texto (ver leer-pdf.mts). Se abren
 *   desde el servidor de la empresa con la ruta guardada.
 * - Solo lee lo nuevo o lo que cambió (compara tamaño y fecha de
 *   modificación contra lo ya sincronizado).
 * - Los PDF que ya no están en el servidor se dan de baja, pero solo de
 *   los años cuya carpeta sí se pudo leer, y con un tope de seguridad (ver
 *   MAX_BAJAS_SIN_FORZAR) para que un fallo de red no borre todo.
 * - Si la unidad no está disponible (PC fuera de la red), termina sin error.
 *
 * Pensado para correr sin supervisión (Programador de tareas de Windows).
 *
 * Uso:
 *   node scripts/planos/sincronizar-planos.mts [--simular] [--raiz I:/] [--anios 2025,2026]
 *                                             [--limite N] [--forzar-bajas] [--log ruta]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { access, appendFile, mkdir } from "node:fs/promises";
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
import { leerPlano } from "./leer-pdf.mts";

const RAIZ = arg("raiz", "I:/");
const ANIOS = arg("anios", aniosPorDefecto()).split(",").map((a) => a.trim());
const SIMULAR = bandera("simular");
const FORZAR_BAJAS = bandera("forzar-bajas");
const LIMITE = Number(arg("limite", "0")) || Infinity;
const RUTA_LOG = arg(
  "log",
  path.join(import.meta.dirname, "../../planos-reporte/sincronizacion.log")
);

const LOTE_UPSERT = 200;
const LECTURAS_EN_PARALELO = 4;
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
  tamano_bytes: number;
  modificado_en: string;
}

// Postgres guarda microsegundos y Node da milisegundos con decimales: se
// compara al milisegundo entero.
function fechaMs(fecha: Date | string): number {
  return Math.floor(new Date(fecha).getTime());
}

async function planosRegistrados(supabase: SupabaseClient): Promise<PlanoRow[]> {
  const filas: PlanoRow[] = [];
  const pagina = 1000;
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await supabase
      .from("planos")
      .select("id, ruta_origen, anio, tamano_bytes, modificado_en")
      .order("id")
      .range(desde, desde + pagina - 1)
      .returns<PlanoRow[]>();
    if (error) throw new Error(`No se pudo leer la tabla planos: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < pagina) return filas;
  }
}

// Un PDF que no se puede leer (dañado, protegido) se registra igual, con el
// motivo: así no se reintenta en cada pasada hasta que el archivo cambie.
async function registroDePlano(archivo: ArchivoPdf, modelo: ModeloIngenieria) {
  const base = {
    ruta_origen: archivo.ruta_origen,
    anio: Number(modelo.anio),
    carpeta_proyecto: modelo.carpeta_proyecto,
    pm: modelo.pm,
    modelo_carpeta: modelo.modelo_carpeta,
    modelo_normalizado: modelo.modelo_normalizado,
    cancelada: modelo.cancelada,
    nombre_archivo: archivo.nombre,
    tamano_bytes: archivo.tamano_bytes,
    modificado_en: new Date(fechaMs(archivo.modificado_en)).toISOString(),
    sincronizado_en: new Date().toISOString(),
  };
  try {
    return { ...base, ...(await leerPlano(archivo.ruta_absoluta)), error_lectura: null };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    log(`  ⚠ No se pudo leer ${archivo.ruta_origen}: ${motivo}`);
    return {
      ...base,
      paginas: null,
      especificacion: null,
      descripcion: null,
      proyecto: null,
      pm_plano: null,
      dibujo: null,
      verifico: null,
      fecha_plano: null,
      escala: null,
      acabados: [],
      notas: [],
      texto: null,
      error_lectura: motivo,
    };
  }
}

type Registro = Awaited<ReturnType<typeof registroDePlano>>;

async function guardar(supabase: SupabaseClient, registros: Registro[]) {
  const { error } = await supabase.from("planos").upsert(registros, { onConflict: "ruta_origen" });
  if (error) throw new Error(`No se pudieron registrar los planos: ${error.message}`);
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
  const registrados = await planosRegistrados(supabase);
  const porRuta = new Map(registrados.map((r) => [r.ruta_origen, r]));

  // 1. Qué hay que leer: nuevos, o con tamaño/fecha distintos a lo registrado.
  const enServidor = modelos.flatMap((m) => m.planos_pdf.map((archivo) => ({ archivo, modelo: m })));
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
  log(
    `  PDF en el servidor: ${enServidor.length} · sin cambios: ${enServidor.length - pendientes.length} · nuevos: ${nuevos} · modificados: ${pendientes.length - nuevos}`
  );
  if (aProcesar.length < pendientes.length) {
    log(`  (--limite ${LIMITE}: se procesan solo ${aProcesar.length} de ${pendientes.length})`);
  }

  // 2. Bajas: registrados de los años leídos que ya no están en el servidor.
  const bajas = registrados.filter(
    (r) => aniosLeidos.includes(String(r.anio)) && !rutasEnServidor.has(r.ruta_origen)
  );
  const registradosEnAnios = registrados.filter((r) => aniosLeidos.includes(String(r.anio))).length;
  const bajasSospechosas =
    bajas.length > MAX_BAJAS_SIN_FORZAR && bajas.length > registradosEnAnios * 0.1;
  const bajasAplicables = bajasSospechosas && !FORZAR_BAJAS ? [] : bajas;
  log(`  Ya no están en el servidor: ${bajas.length}`);
  if (bajasSospechosas && !FORZAR_BAJAS) {
    log(
      `  ⚠ Son demasiadas bajas de golpe (${bajas.length} de ${registradosEnAnios}); puede ser un problema de lectura de la red. No se da de baja nada. Si es correcto, correr con --forzar-bajas.`
    );
  }

  if (SIMULAR) {
    log(`  Se leerían ${aProcesar.length} PDF y se darían de baja ${bajasAplicables.length}.`);
    for (const { archivo } of aProcesar.slice(0, 10)) log(`    + ${archivo.ruta_origen}`);
    if (aProcesar.length > 10) log(`    ... y ${aProcesar.length - 10} más`);
    for (const b of bajasAplicables.slice(0, 10)) log(`    - ${b.ruta_origen}`);
    return;
  }

  // 3. Leer y registrar, guardando por lotes para no perder avance si la
  //    pasada se interrumpe (la siguiente retoma lo que falte).
  let leidos = 0;
  let conError = 0;
  let lote: Registro[] = [];
  const vaciarLote = async () => {
    const actual = lote;
    lote = [];
    if (actual.length > 0) await guardar(supabase, actual);
  };
  await enParalelo(
    Array.from({ length: LECTURAS_EN_PARALELO }, (_, i) => i),
    async (hilo) => {
      for (let i = hilo; i < aProcesar.length; i += LECTURAS_EN_PARALELO) {
        const { archivo, modelo } = aProcesar[i];
        const registro = await registroDePlano(archivo, modelo);
        if (registro.error_lectura) conError++;
        lote.push(registro);
        leidos++;
        if (lote.length >= LOTE_UPSERT) await vaciarLote();
        if (leidos % 100 === 0) {
          log(`    ${leidos}/${aProcesar.length} (${((Date.now() - inicio) / 1000).toFixed(0)} s)...`);
        }
      }
    }
  );
  await vaciarLote();

  // 4. Dar de baja los que ya no están.
  for (let i = 0; i < bajasAplicables.length; i += LOTE_UPSERT) {
    const ids = bajasAplicables.slice(i, i + LOTE_UPSERT).map((b) => b.id);
    const { error } = await supabase.from("planos").delete().in("id", ids);
    if (error) throw new Error(`No se pudieron dar de baja planos: ${error.message}`);
  }

  log(
    `  Listo en ${((Date.now() - inicio) / 1000).toFixed(0)} s: ${leidos} leídos (${conError} sin poder leerse), ${bajasAplicables.length} dados de baja.`
  );
}

main()
  .catch((err) => {
    log(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(guardarLog);
