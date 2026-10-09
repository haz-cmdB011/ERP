/**
 * Sincroniza las especificaciones de los planos PDF del servidor de
 * Ingeniería con la tabla public.planos de Supabase.
 *
 * Se toman dos fuentes, en este orden de prioridad:
 *
 *   1. Carpeta de OT (como siempre):
 *      I:\O. T´s. <AÑO>\<PM>\INGENIERIA\<MODELO>\PLANOS\*.pdf
 *      El PM y el modelo salen de la carpeta.
 *
 *   2. Cualquier otra carpeta de todo el servidor: un PDF cuyo nombre (sin
 *      .pdf) es el de un modelo de un PM de la app ("PLA-07.pdf" → modelo
 *      PLA-07). Su PM es el de la carpeta de proyecto donde está, si ese PM
 *      tiene el modelo; si no, el único PM con ese modelo. Si varios PM lo
 *      tienen y el archivo no está en ninguno, no se asigna (ver
 *      asignarPlanoPorNombre). Por PM y modelo se guarda solo el más reciente,
 *      y no se agrega nada si la carpeta de OT ya trae ese modelo.
 *
 * - Los PDF NO se suben: solo se lee su texto (ver leer-pdf.mts). Se abren
 *   desde el servidor de la empresa con la ruta guardada.
 * - Solo lee lo nuevo o lo que cambió (compara tamaño, fecha de modificación
 *   y datos del PM/modelo contra lo ya sincronizado).
 * - Los planos que ya no cumplen ninguna fuente se dan de baja. Si alguna
 *   carpeta del servidor no se pudo leer, no se da de baja ningún plano que
 *   esté dentro de ella, y con un tope de seguridad (ver MAX_BAJAS_SIN_FORZAR)
 *   para que un fallo de red no borre todo.
 * - Si la unidad no está disponible (PC fuera de la red), termina sin error.
 *
 * Pensado para correr sin supervisión (Programador de tareas de Windows).
 *
 * Uso:
 *   node scripts/planos/sincronizar-planos.mts [--simular] [--raiz I:/] [--anios 2025,2026]
 *                                             [--limite N] [--forzar-bajas] [--log ruta]
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { access, appendFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizarNumeroPM } from "../../src/lib/planeacion/numero-pm.ts";
import {
  asignarPlanoPorNombre,
  carpetaCancelada,
  indexarModelosDePm,
  normalizarModelo,
  type ModeloDePm,
  type PlanoAsignado,
} from "../../src/lib/planos/modelo.ts";
import {
  aniosPorDefecto,
  arg,
  bandera,
  enParalelo,
  escanear,
  leerEnv,
  pmDeRuta,
  recorrerServidor,
  type ArchivoPdf,
  type PdfEnServidor,
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
// registrados), se asume un problema de lectura y no se da de baja nada,
// salvo con --forzar-bajas.
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
  carpeta_proyecto: string;
  pm: string | null;
  modelo_carpeta: string;
  modelo_normalizado: string;
  cancelada: boolean;
  tamano_bytes: number;
  modificado_en: string;
}

// Lo que se guarda de un PDF además de su archivo: de qué PM y modelo es.
interface DatosPlano {
  anio: number;
  carpeta_proyecto: string;
  pm: string | null;
  modelo_carpeta: string;
  modelo_normalizado: string;
  cancelada: boolean;
}

interface Deseado {
  archivo: ArchivoPdf;
  datos: DatosPlano;
  // De dónde sale: la carpeta de OT, o el nombre del archivo (y si su PM
  // lo confirma por la carpeta o por ser el único con ese modelo).
  origen: "carpeta_ot" | "nombre_en_su_pm" | "nombre_unico";
}

// Postgres guarda microsegundos y Node da milisegundos con decimales: se
// compara al milisegundo entero.
function fechaMs(fecha: Date | string): number {
  return Math.floor(new Date(fecha).getTime());
}

// "PM107-26" → 2026. Sin año reconocible, null.
function anioDePm(pm: string): number | null {
  const m = /-(\d{2})$/.exec(pm);
  return m ? 2000 + Number(m[1]) : null;
}

// Ruta "dentro de" una carpeta, ambas relativas a la raíz con "\".
function estaDentro(ruta: string, carpeta: string): boolean {
  return carpeta === "" || ruta === carpeta || ruta.startsWith(carpeta + "\\");
}

async function planosRegistrados(supabase: SupabaseClient): Promise<PlanoRow[]> {
  const filas: PlanoRow[] = [];
  const pagina = 1000;
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await supabase
      .from("planos")
      .select(
        "id, ruta_origen, anio, carpeta_proyecto, pm, modelo_carpeta, modelo_normalizado, cancelada, tamano_bytes, modificado_en"
      )
      .order("id")
      .range(desde, desde + pagina - 1)
      .returns<PlanoRow[]>();
    if (error) throw new Error(`No se pudo leer la tabla planos: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < pagina) return filas;
  }
}

// Modelos de todos los PM de la app (versión activa, pedidos no eliminados),
// con la misma clave de PM que usa la página del pedido para buscar sus planos
// (ver src/app/planeacion/pedidos/[id]/page.tsx): "PM<OT>" si hay OT.
interface FilaModelo {
  modelo: string;
  pedido_versiones: {
    pedidos: { numero_pedido: string; fecha_pedido: string | null; orden_trabajo: string | null };
  };
}

async function modelosDeLosPm(supabase: SupabaseClient): Promise<ModeloDePm[]> {
  const filas: FilaModelo[] = [];
  const pagina = 1000;
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await supabase
      .from("planeacion_items")
      .select(
        "id, modelo, pedido_versiones!inner ( es_version_activa, pedidos!inner ( numero_pedido, fecha_pedido, orden_trabajo, eliminado_en ) )"
      )
      .eq("pedido_versiones.es_version_activa", true)
      .is("pedido_versiones.pedidos.eliminado_en", null)
      .not("modelo", "is", null)
      .order("id")
      .range(desde, desde + pagina - 1)
      .returns<FilaModelo[]>();
    if (error) throw new Error(`No se pudieron leer los modelos de los PM: ${error.message}`);
    filas.push(...(data ?? []));
    if (!data || data.length < pagina) break;
  }

  const modelos: ModeloDePm[] = [];
  for (const f of filas) {
    const p = f.pedido_versiones.pedidos;
    const pm = p.orden_trabajo
      ? `PM${p.orden_trabajo}`
      : normalizarNumeroPM(p.numero_pedido, { fechaPedido: p.fecha_pedido });
    const anio = anioDePm(pm);
    if (anio === null) continue;
    modelos.push({ pm, anio, modelo: f.modelo });
  }
  return modelos;
}

// Un PDF que no se puede leer (dañado, protegido) se registra igual, con el
// motivo: así no se reintenta en cada pasada hasta que el archivo cambie.
async function registroDePlano(archivo: ArchivoPdf, datos: DatosPlano) {
  const base = {
    ruta_origen: archivo.ruta_origen,
    anio: datos.anio,
    carpeta_proyecto: datos.carpeta_proyecto,
    pm: datos.pm,
    modelo_carpeta: datos.modelo_carpeta,
    modelo_normalizado: datos.modelo_normalizado,
    cancelada: datos.cancelada,
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

// Un PM no repite un mismo modelo: esta clave identifica la pareja.
function claveModelo(pm: string | null, modeloNormalizado: string): string {
  return `${pm ?? ""}|${modeloNormalizado}`;
}

// ¿El registro guardado ya refleja este PDF y sus datos de PM/modelo?
function alDia(r: PlanoRow, d: Deseado): boolean {
  return (
    Number(r.tamano_bytes) === d.archivo.tamano_bytes &&
    fechaMs(r.modificado_en) === fechaMs(d.archivo.modificado_en) &&
    Number(r.anio) === d.datos.anio &&
    r.carpeta_proyecto === d.datos.carpeta_proyecto &&
    r.pm === d.datos.pm &&
    r.modelo_carpeta === d.datos.modelo_carpeta &&
    r.modelo_normalizado === d.datos.modelo_normalizado &&
    r.cancelada === d.datos.cancelada
  );
}

// Solo en simulación: un CSV con cada plano que se registraría, de dónde sale
// y si ya está al día, para revisar las coincidencias por nombre a detalle.
const RUTA_DETALLE = path.join(path.dirname(RUTA_LOG), "simulacion-planos.csv");

function celdaCsv(valor: unknown): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function guardarDetalleSimulacion(deseados: Map<string, Deseado>, porRuta: Map<string, PlanoRow>) {
  const columnas = ["origen", "estado", "pm", "modelo", "anio", "carpeta_proyecto", "nombre_archivo", "ruta_origen", "cancelada"];
  const filas = [...deseados.values()].map((d) => {
    const r = porRuta.get(d.archivo.ruta_origen);
    const estado = !r ? "nuevo" : alDia(r, d) ? "sin cambios" : "modificado";
    return [d.origen, estado, d.datos.pm, d.datos.modelo_carpeta, d.datos.anio, d.datos.carpeta_proyecto, d.archivo.nombre, d.archivo.ruta_origen, d.datos.cancelada];
  });
  await mkdir(path.dirname(RUTA_DETALLE), { recursive: true });
  // BOM para que Excel abra bien los acentos.
  await writeFile(
    RUTA_DETALLE,
    "﻿" + [columnas, ...filas].map((f) => f.map(celdaCsv).join(",")).join("\r\n") + "\r\n"
  );
}

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

  // 1. Carpetas de OT (O. T´s./PM/INGENIERIA/MODELO/PLANOS).
  const { modelos, aniosLeidos } = await escanear(RAIZ, ANIOS, log);
  if (aniosLeidos.length === 0) {
    log("  No se pudo leer ninguna carpeta de años. No se hace nada.");
    return;
  }

  // 2. Todo el servidor, para los PDF con nombre de modelo.
  const recorrido = await recorrerServidor(RAIZ, log);
  if (recorrido.inaccesibles.includes("")) {
    log(`  No se pudo leer la raíz ${RAIZ}. No se hace nada.`);
    return;
  }

  const env = await leerEnv();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const registrados = await planosRegistrados(supabase);
  const porRuta = new Map(registrados.map((r) => [r.ruta_origen, r]));
  const modelosApp = await modelosDeLosPm(supabase);
  const indice = indexarModelosDePm(modelosApp);

  // 3. Qué planos deben estar registrados, y con qué PM/modelo.
  const deseados = new Map<string, Deseado>();
  for (const m of modelos) {
    for (const archivo of m.planos_pdf) {
      deseados.set(archivo.ruta_origen, {
        archivo,
        origen: "carpeta_ot",
        datos: {
          anio: Number(m.anio),
          carpeta_proyecto: m.carpeta_proyecto,
          pm: m.pm,
          modelo_carpeta: m.modelo_carpeta,
          modelo_normalizado: m.modelo_normalizado,
          cancelada: m.cancelada,
        },
      });
    }
  }
  const porCarpeta = deseados.size;

  // Un PDF fuera de la carpeta de OT entra por su nombre (ver asignarPlanoPorNombre).
  // Si su PM ya trae ese modelo en la carpeta de OT, esos planos mandan.
  const cubiertos = new Set(
    [...deseados.values()].map((d) => claveModelo(d.datos.pm, d.datos.modelo_normalizado))
  );
  let ambiguos = 0;
  const candidatos: { pdf: PdfEnServidor; asignacion: PlanoAsignado }[] = [];
  for (const pdf of recorrido.pdfs) {
    if (deseados.has(pdf.ruta_origen)) continue;
    const asignacion = asignarPlanoPorNombre(pdf.nombre, pmDeRuta(pdf.ruta_origen), indice);
    if (!asignacion) continue;
    if (asignacion.tipo === "ambiguo") {
      ambiguos++;
      continue;
    }
    candidatos.push({ pdf, asignacion });
  }
  const enSuPm = candidatos.filter((c) => c.asignacion.tipo === "en_su_pm").length;
  const deOtroProyecto = candidatos.filter(
    (c) => c.asignacion.tipo === "unico" && pmDeRuta(c.pdf.ruta_origen) !== null
  ).length;

  const conDatos = await enParalelo(candidatos, async ({ pdf, asignacion }): Promise<Deseado | null> => {
    try {
      const info = await stat(pdf.ruta_absoluta);
      return {
        archivo: {
          nombre: pdf.nombre,
          ruta_origen: pdf.ruta_origen,
          ruta_absoluta: pdf.ruta_absoluta,
          tamano_bytes: info.size,
          modificado_en: info.mtime,
        },
        origen: asignacion.tipo === "en_su_pm" ? "nombre_en_su_pm" : "nombre_unico",
        datos: {
          anio: asignacion.anio,
          carpeta_proyecto: pdf.carpeta,
          pm: asignacion.pm,
          modelo_carpeta: asignacion.modelo,
          modelo_normalizado: normalizarModelo(asignacion.modelo),
          cancelada: carpetaCancelada(pdf.ruta_origen),
        },
      };
    } catch {
      // Archivo que desapareció entre listar y leer: se toma en la siguiente pasada.
      return null;
    }
  });

  // Por PM y modelo se guarda solo el archivo más reciente.
  const porClave = new Map<string, Deseado[]>();
  let yaCubiertos = 0;
  for (const d of conDatos) {
    if (!d) continue;
    const clave = claveModelo(d.datos.pm, d.datos.modelo_normalizado);
    if (cubiertos.has(clave)) {
      yaCubiertos++;
      continue;
    }
    porClave.set(clave, [...(porClave.get(clave) ?? []), d]);
  }
  let repetidos = 0;
  for (const lista of porClave.values()) {
    lista.sort(
      (a, b) =>
        b.archivo.modificado_en.getTime() - a.archivo.modificado_en.getTime() ||
        a.archivo.ruta_origen.localeCompare(b.archivo.ruta_origen)
    );
    const [masReciente, ...otros] = lista;
    deseados.set(masReciente.archivo.ruta_origen, masReciente);
    repetidos += otros.length;
  }

  log(`  Planos en carpetas de OT: ${porCarpeta}`);
  log(
    `  Coincidencias por nombre en todo el servidor: ${candidatos.length} (en la carpeta de su PM: ${enSuPm} · nombre único: ${candidatos.length - enSuPm}, de ellas en carpeta de otro proyecto: ${deOtroProyecto})`
  );
  log(
    `  Descartadas: ${ambiguos} ambiguas (varios PM con ese modelo) · ${yaCubiertos} ya cubiertas por la carpeta de OT · ${repetidos} repetidas (se guarda la más reciente por PM y modelo)`
  );
  log(`  Modelos de PM en la app: ${modelosApp.length} · nombres distintos: ${indice.size}`);
  if (recorrido.inaccesibles.length > 0) {
    log(`  ⚠ Carpetas que no se pudieron leer: ${recorrido.inaccesibles.length} (sus planos no se dan de baja)`);
  }

  // 4. Qué hay que leer: nuevos, o cambiados en archivo o en PM/modelo.
  const pendientes = [...deseados.values()].filter((d) => {
    const r = porRuta.get(d.archivo.ruta_origen);
    return !r || !alDia(r, d);
  });
  const nuevos = pendientes.filter((d) => !porRuta.has(d.archivo.ruta_origen)).length;
  const aProcesar = pendientes.slice(0, LIMITE);
  log(
    `  Planos sincronizados: ${deseados.size} · sin cambios: ${deseados.size - pendientes.length} · nuevos: ${nuevos} · modificados: ${pendientes.length - nuevos}`
  );
  if (aProcesar.length < pendientes.length) {
    log(`  (--limite ${LIMITE}: se procesan solo ${aProcesar.length} de ${pendientes.length})`);
  }

  // 5. Bajas: registrados que ya no corresponden a ningún plano. Se protegen
  //    los que están dentro de una carpeta que no se pudo leer, y no se da de
  //    baja nada si la app no devolvió modelos (no se sabría qué sobra).
  const bajas = registrados.filter(
    (r) =>
      !deseados.has(r.ruta_origen) &&
      !recorrido.inaccesibles.some((carpeta) => estaDentro(r.ruta_origen, carpeta))
  );
  const bajasAplicables = modelosApp.length === 0 ? [] : bajas;
  if (modelosApp.length === 0 && bajas.length > 0) {
    log("  ⚠ La app no devolvió modelos de PM: no se da de baja nada.");
  }
  const bajasSospechosas =
    bajasAplicables.length > MAX_BAJAS_SIN_FORZAR &&
    bajasAplicables.length > registrados.length * 0.1;
  const bajasAUsar = bajasSospechosas && !FORZAR_BAJAS ? [] : bajasAplicables;
  log(`  Ya no están en el servidor: ${bajasAplicables.length}`);
  if (bajasSospechosas && !FORZAR_BAJAS) {
    log(
      `  ⚠ Son demasiadas bajas de golpe (${bajasAplicables.length} de ${registrados.length}); puede ser un problema de lectura de la red. No se da de baja nada. Si es correcto, correr con --forzar-bajas.`
    );
  }

  // Planos que entran por nombre, por PM (para revisar a ojo).
  const porPm = new Map<string, number>();
  for (const d of deseados.values()) {
    if (d.origen === "carpeta_ot" || !d.datos.pm) continue;
    porPm.set(d.datos.pm, (porPm.get(d.datos.pm) ?? 0) + 1);
  }
  if (porPm.size > 0) {
    log(`  Planos por nombre, por PM: ${[...porPm.entries()].map(([pm, n]) => `${pm} (${n})`).join(", ")}`);
  }

  if (SIMULAR) {
    await guardarDetalleSimulacion(deseados, porRuta);
    log(`  Detalle de todos los planos (CSV): ${RUTA_DETALLE}`);
    log(`  Se leerían ${aProcesar.length} PDF y se darían de baja ${bajasAUsar.length}.`);
    for (const { archivo } of aProcesar.slice(0, 10)) log(`    + ${archivo.ruta_origen}`);
    if (aProcesar.length > 10) log(`    ... y ${aProcesar.length - 10} más`);
    for (const b of bajasAUsar.slice(0, 10)) log(`    - ${b.ruta_origen}`);
    return;
  }

  // 6. Leer y registrar, guardando por lotes para no perder avance si la
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
        const { archivo, datos } = aProcesar[i];
        const registro = await registroDePlano(archivo, datos);
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

  // 7. Dar de baja los que ya no están.
  for (let i = 0; i < bajasAUsar.length; i += LOTE_UPSERT) {
    const ids = bajasAUsar.slice(i, i + LOTE_UPSERT).map((b) => b.id);
    const { error } = await supabase.from("planos").delete().in("id", ids);
    if (error) throw new Error(`No se pudieron dar de baja planos: ${error.message}`);
  }

  log(
    `  Listo en ${((Date.now() - inicio) / 1000).toFixed(0)} s: ${leidos} leídos (${conError} sin poder leerse), ${bajasAUsar.length} dados de baja.`
  );
}

main()
  .catch((err) => {
    log(`  ✗ Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(guardarLog);
