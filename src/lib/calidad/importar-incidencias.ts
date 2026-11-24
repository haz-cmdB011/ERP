// Lectura del Excel de control de no conformidades (BD-CONTROL, hojas "MADERA 26" y "METAL 26") y
// comparación con lo que ya está en la base. Lo usan el script de línea de comandos y el botón
// "Importar Excel" de la pantalla; no escribe en la base ni toca el navegador, y tiene pruebas.
//
// Imports relativos a propósito: el script corre con `tsx` y no resuelve el alias `@/`.

import type ExcelJS from "exceljs";
import {
  LIMITES,
  incidenciaDesdeFilaExcel,
  textoNormalizado,
  type Linea,
  type NuevaIncidencia,
} from "./incidencias.ts";

// Primera fila con datos y columnas de cada hoja (la fila 2 trae los encabezados).
export const PRIMERA_FILA_DATOS = 3;
export const COLUMNAS_HOJA = {
  fecha: 1,
  folio: 2,
  tipo: 4,
  proyecto: 6,
  mueble: 7,
  area: 10,
  motivo: 14,
  descripcion: 15,
  solucion: 16,
  seguimiento: 17,
  auditor: 18,
  origen: 19,
  reporta: 20,
  estado: 23,
} as const;

export interface HojaLeida {
  nombre: string;
  linea: Linea;
  // Filas con folio (las que se intentaron leer).
  filas: number;
}

export interface FilaOmitida {
  // Dónde está en el Excel: "MADERA 26, fila 427".
  donde: string;
  motivo: string;
}

export interface LecturaExcelIncidencias {
  hojas: HojaLeida[];
  // Hojas del libro que no son de madera ni de metal (no se leen).
  hojasIgnoradas: string[];
  incidencias: NuevaIncidencia[];
  omitidas: FilaOmitida[];
  // Aviso (algo vacío que conviene revisar) → cuántas filas lo tienen.
  avisos: Map<string, number>;
}

// "MADERA 26" → { linea: "madera", anio: "26" }; "Metal 2027" → { linea: "metal", anio: "27" }.
// Cualquier otro nombre no es una hoja de incidencias.
export function hojaDeIncidencias(nombre: string): { linea: Linea; anio: string | null } | null {
  const texto = textoNormalizado(nombre);
  const linea: Linea | null = /^MADERA\b/.test(texto) ? "madera" : /^METAL\b/.test(texto) ? "metal" : null;
  if (!linea) return null;
  const anio = /(\d{2,4})\s*$/.exec(texto)?.[1] ?? null;
  return { linea, anio: anio ? anio.slice(-2) : null };
}

// La clave con la que se reconoce una fila al repetir la importación. Las hojas de 2026 (y las que
// no traen año) conservan la clave de siempre ("madera:427") para no duplicar lo ya cargado; las de
// otro año llevan el año ("madera-27:12"), porque la fila 12 de cada año es un reporte distinto.
export function claveDeFila(linea: Linea, anio: string | null, fila: number): string {
  return !anio || anio === "26" ? `${linea}:${fila}` : `${linea}-${anio}:${fila}`;
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

// Lo que la base no acepta (sus topes de tamaño): la fila se omite con el motivo en vez de fallar todo el lote.
function pasaDeLosTopes(i: NuevaIncidencia): string | null {
  if ((i.motivo?.length ?? 0) > LIMITES.motivo) return `el motivo pasa de ${LIMITES.motivo} letras`;
  if ((i.proyecto?.length ?? 0) > LIMITES.proyecto) return `el proyecto pasa de ${LIMITES.proyecto} letras`;
  if ((i.auditor?.length ?? 0) > LIMITES.auditor) return `el auditor pasa de ${LIMITES.auditor} letras`;
  if (i.muebles.length > LIMITES.muebles) return `trae más de ${LIMITES.muebles} muebles`;
  if (i.areas.length > LIMITES.areas) return `trae más de ${LIMITES.areas} áreas`;
  if (i.areas_reporta.length > LIMITES.areas) return `trae más de ${LIMITES.areas} áreas que reportan`;
  return null;
}

export function leerIncidenciasDeLibro(libro: ExcelJS.Workbook): LecturaExcelIncidencias {
  const salida: LecturaExcelIncidencias = {
    hojas: [],
    hojasIgnoradas: [],
    incidencias: [],
    omitidas: [],
    avisos: new Map(),
  };
  const vistas = new Set<string>();

  for (const hoja of libro.worksheets) {
    const tipoDeHoja = hojaDeIncidencias(hoja.name);
    if (!tipoDeHoja) {
      salida.hojasIgnoradas.push(hoja.name);
      continue;
    }
    const { linea, anio } = tipoDeHoja;
    let filas = 0;
    for (let n = PRIMERA_FILA_DATOS; n <= hoja.rowCount; n++) {
      const fila = hoja.getRow(n);
      const g = (col: number) => valorDeCelda(fila.getCell(col));
      // Una fila sin folio es una fila vacía de la hoja; el folio solo sirve para esto (no se guarda).
      if (!String(g(COLUMNAS_HOJA.folio) ?? "").trim()) continue;
      filas++;
      const donde = `${hoja.name}, fila ${n}`;
      const { incidencia, avisos } = incidenciaDesdeFilaExcel(linea, n, {
        tipo: g(COLUMNAS_HOJA.tipo),
        proyecto: g(COLUMNAS_HOJA.proyecto),
        mueble: g(COLUMNAS_HOJA.mueble),
        area: g(COLUMNAS_HOJA.area),
        motivo: g(COLUMNAS_HOJA.motivo),
        origen: g(COLUMNAS_HOJA.origen),
        reporta: g(COLUMNAS_HOJA.reporta),
        estado: g(COLUMNAS_HOJA.estado),
        fecha: g(COLUMNAS_HOJA.fecha),
        auditor: g(COLUMNAS_HOJA.auditor),
        descripcion: g(COLUMNAS_HOJA.descripcion),
        solucion: g(COLUMNAS_HOJA.solucion),
        seguimiento: g(COLUMNAS_HOJA.seguimiento),
      });
      if (!incidencia) {
        salida.omitidas.push({ donde, motivo: avisos.join("; ") });
        continue;
      }
      const exceso = pasaDeLosTopes(incidencia);
      if (exceso) {
        salida.omitidas.push({ donde, motivo: exceso });
        continue;
      }
      const clave = claveDeFila(linea, anio, n);
      if (vistas.has(clave)) {
        salida.omitidas.push({ donde, motivo: "otra hoja del libro ya usa la misma clave (hojas repetidas de la misma línea y año)" });
        continue;
      }
      vistas.add(clave);
      for (const a of avisos) salida.avisos.set(a, (salida.avisos.get(a) ?? 0) + 1);
      salida.incidencias.push({ ...incidencia, origen_importacion: clave });
    }
    salida.hojas.push({ nombre: hoja.name, linea, filas });
  }
  return salida;
}

// --- Comparación con la base ----------------------------------------------------

export interface ExistenteParaComparar {
  id?: string;
  origen_importacion: string | null;
  linea: string;
  tipo: string;
  fecha: string | null;
  proyecto: string | null;
  muebles: string[];
  motivo: string | null;
  categoria_motivo?: string;
  areas?: string[];
  areas_reporta?: string[];
  estado?: string;
  auditor?: string | null;
  descripcion?: string | null;
  solucion?: string | null;
  seguimiento?: string | null;
}

// Huella del contenido de un reporte: si el Excel se ordenó o se le insertaron filas, el mismo reporte
// cambia de número de fila pero conserva esta huella, y así no se carga dos veces.
export function huellaDeIncidencia(
  i: Pick<ExistenteParaComparar, "linea" | "tipo" | "fecha" | "proyecto" | "muebles" | "motivo">
): string {
  return [
    i.linea,
    textoNormalizado(i.tipo),
    i.fecha ?? "",
    textoNormalizado(i.proyecto),
    [...i.muebles].map(textoNormalizado).sort().join("|"),
    textoNormalizado(i.motivo),
  ].join("¦");
}

// Campos que el Excel puede corregir en un reporte que ya está cargado.
export const CAMPOS_ACTUALIZABLES = [
  "estado",
  "tipo",
  "fecha",
  "proyecto",
  "muebles",
  "areas",
  "motivo",
  "areas_reporta",
  "auditor",
  "descripcion",
  "solucion",
  "seguimiento",
] as const;
export type CampoActualizable = (typeof CAMPOS_ACTUALIZABLES)[number];

export const NOMBRE_CAMPO: Record<CampoActualizable, string> = {
  estado: "estado",
  tipo: "tipo",
  fecha: "fecha",
  proyecto: "proyecto",
  muebles: "muebles",
  areas: "áreas",
  motivo: "motivo",
  areas_reporta: "área que reporta",
  auditor: "auditor",
  descripcion: "descripción",
  solucion: "solución",
  seguimiento: "seguimiento",
};

export interface Actualizacion {
  id: string;
  // De qué reporte se trata (para la vista previa).
  etiqueta: string;
  campos: CampoActualizable[];
  // Lo que se escribe: solo los campos que cambian (más la categoría si cambió el motivo).
  cambios: Record<string, unknown>;
  // Si el reporte cambió de número de fila en el Excel, su clave nueva.
  nuevaClave?: string;
}

const mismaLista = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// Qué cambia en un reporte ya cargado según lo que dice el Excel. Reglas:
// - Solo se escribe lo que el Excel trae con valor y es distinto: una celda vacía en el Excel no borra lo que
//   ya hay (por ejemplo, lo que se escribió en la pantalla).
// - Un reporte cerrado en la app NO se vuelve a abrir porque el Excel aún lo tenga abierto.
// - La línea nunca cambia.
export function cambiosDeUnReporte(
  excel: NuevaIncidencia,
  actual: ExistenteParaComparar
): { campos: CampoActualizable[]; cambios: Record<string, unknown>; seguiaCerrado: boolean } {
  const campos: CampoActualizable[] = [];
  const cambios: Record<string, unknown> = {};
  let seguiaCerrado = false;

  if (excel.estado === "cerrado" && actual.estado === "abierto") {
    campos.push("estado");
    cambios.estado = "cerrado";
  } else if (excel.estado === "abierto" && actual.estado === "cerrado") {
    seguiaCerrado = true;
  }

  if (excel.tipo !== actual.tipo) {
    campos.push("tipo");
    cambios.tipo = excel.tipo;
  }
  if (excel.fecha && excel.fecha !== actual.fecha) {
    campos.push("fecha");
    cambios.fecha = excel.fecha;
  }
  if (excel.proyecto && excel.proyecto !== actual.proyecto) {
    campos.push("proyecto");
    cambios.proyecto = excel.proyecto;
  }
  if (excel.muebles.length > 0 && !mismaLista(excel.muebles, actual.muebles ?? [])) {
    campos.push("muebles");
    cambios.muebles = excel.muebles;
  }
  if (excel.areas.length > 0 && !mismaLista(excel.areas, actual.areas ?? [])) {
    campos.push("areas");
    cambios.areas = excel.areas;
  }
  if (excel.motivo && excel.motivo !== actual.motivo) {
    campos.push("motivo");
    cambios.motivo = excel.motivo;
    cambios.categoria_motivo = excel.categoria_motivo;
  }
  if (excel.areas_reporta.length > 0 && !mismaLista(excel.areas_reporta, actual.areas_reporta ?? [])) {
    campos.push("areas_reporta");
    cambios.areas_reporta = excel.areas_reporta;
  }
  if (excel.auditor && excel.auditor !== actual.auditor) {
    campos.push("auditor");
    cambios.auditor = excel.auditor;
  }
  for (const campo of ["descripcion", "solucion", "seguimiento"] as const) {
    const valor = excel[campo];
    if (valor && valor !== actual[campo]) {
      campos.push(campo);
      cambios[campo] = valor;
    }
  }
  return { campos, cambios, seguiaCerrado };
}


export interface Reubicacion {
  id: string;
  nuevaClave: string;
}

export interface ClasificacionImportacion {
  // Lo que se va a agregar.
  nuevas: NuevaIncidencia[];
  // El reporte ya estaba en la base y el Excel no trae nada distinto: se deja como está.
  sinCambios: number;
  // El reporte ya estaba en la base y el Excel trae algo distinto (lo cerraron, corrigieron el motivo, etc.).
  aActualizar: Actualizacion[];
  // Abiertas en el Excel pero ya cerradas en la app: se dejan cerradas.
  cerradasEnLaApp: number;
  // Reportes que ya estaban en la base pero con otro número de fila (el Excel se ordenó o se le insertaron
  // filas) o que se capturaron en la app: se reconocen por su contenido y no se vuelven a cargar. Ya están
  // contados en `sinCambios` o en `aActualizar`.
  cambiaronDeFila: number;
  // Los que cambiaron de fila y no traen nada más distinto: solo se les anota su clave nueva.
  reubicadas: Reubicacion[];
  // Antes de escribir, a estos reportes (por id) hay que quitarles la clave: la van a tomar otros (porque
  // cambiaron de fila o porque ahora la usa un reporte nuevo) y la clave no se puede repetir.
  liberarClaves: string[];
}

// Cuántos de los cinco datos con que se reconoce un reporte coinciden (tipo, fecha, proyecto, muebles, motivo).
function datosEnComun(a: ExistenteParaComparar, b: ExistenteParaComparar): number {
  const lista = (x: string[]) => x.map(textoNormalizado).sort().join("|");
  return [
    textoNormalizado(a.tipo) === textoNormalizado(b.tipo),
    (a.fecha ?? "") === (b.fecha ?? ""),
    textoNormalizado(a.proyecto) === textoNormalizado(b.proyecto),
    lista(a.muebles) === lista(b.muebles),
    textoNormalizado(a.motivo) === textoNormalizado(b.motivo),
  ].filter(Boolean).length;
}

const tieneClaveEn = (e: ExistenteParaComparar, claves: Set<string>) => !!e.origen_importacion && claves.has(e.origen_importacion);

// Empareja cada fila del Excel con el reporte que ya está en la base, en tres pasos:
//  1. misma clave y mismo contenido: el caso de siempre;
//  2. mismo contenido con otra clave: el Excel se ordenó o se le insertaron filas y el reporte cambió de
//     número (también reconoce los capturados a mano en la app); se le anota la clave nueva y, si el Excel
//     trae algo distinto (lo cerraron…), se actualiza igual que cualquiera;
//  3. misma clave y contenido casi igual (3 de 5 datos): alguien corrigió el reporte en el Excel sin moverlo.
// Una fila con la misma clave pero contenido muy distinto NO se toma por el mismo reporte (con el Excel
// reordenado, ese número ahora es de otro reporte): se agrega como nueva y la clave se libera del anterior.
export function clasificarImportacion(
  leidas: NuevaIncidencia[],
  existentes: ExistenteParaComparar[]
): ClasificacionImportacion {
  const clavesLeidas = new Set(leidas.map((i) => i.origen_importacion).filter((c): c is string => !!c));
  const porClave = new Map<string, ExistenteParaComparar>();
  for (const e of existentes) if (e.origen_importacion) porClave.set(e.origen_importacion, e);

  const pareja = new Map<NuevaIncidencia, ExistenteParaComparar>();
  const tomados = new Set<ExistenteParaComparar>();
  const unir = (l: NuevaIncidencia, e: ExistenteParaComparar) => {
    pareja.set(l, e);
    tomados.add(e);
  };

  // 1. Misma clave y mismo contenido.
  for (const l of leidas) {
    const e = l.origen_importacion ? porClave.get(l.origen_importacion) : undefined;
    if (e && huellaDeIncidencia(e) === huellaDeIncidencia(l)) unir(l, e);
  }

  // 2. Mismo contenido con otra clave. Dos reportes iguales de verdad se emparejan de a uno; primero los que
  // ya no tienen una fila propia en el Excel (clave que ya no existe, o sin clave).
  const libresPorHuella = new Map<string, ExistenteParaComparar[]>();
  for (const e of existentes) {
    if (tomados.has(e)) continue;
    const h = huellaDeIncidencia(e);
    libresPorHuella.set(h, [...(libresPorHuella.get(h) ?? []), e]);
  }
  for (const lista of libresPorHuella.values()) {
    lista.sort((a, b) => Number(tieneClaveEn(a, clavesLeidas)) - Number(tieneClaveEn(b, clavesLeidas)));
  }
  const cambiaronDeFila = new Set<NuevaIncidencia>();
  for (const l of leidas) {
    if (pareja.has(l)) continue;
    const e = libresPorHuella.get(huellaDeIncidencia(l))?.shift();
    if (e) {
      unir(l, e);
      cambiaronDeFila.add(l);
    }
  }

  // 3. Misma clave, contenido casi igual: corregido en el Excel sin moverlo.
  for (const l of leidas) {
    if (pareja.has(l) || !l.origen_importacion) continue;
    const e = porClave.get(l.origen_importacion);
    if (e && !tomados.has(e) && datosEnComun(l as ExistenteParaComparar, e) >= 3) unir(l, e);
  }

  const nuevas: NuevaIncidencia[] = [];
  const aActualizar: Actualizacion[] = [];
  const reubicadas: Reubicacion[] = [];
  const claveNecesaria = new Set<string>();
  const liberar = new Set<string>();
  let sinCambios = 0;
  let cerradasEnLaApp = 0;
  for (const l of leidas) {
    const e = pareja.get(l);
    if (!e) {
      nuevas.push(l);
      if (l.origen_importacion) claveNecesaria.add(l.origen_importacion);
      continue;
    }
    const { campos, cambios, seguiaCerrado } = cambiosDeUnReporte(l, e);
    if (seguiaCerrado) cerradasEnLaApp++;
    const nuevaClave = l.origen_importacion && l.origen_importacion !== e.origen_importacion ? l.origen_importacion : undefined;
    if (nuevaClave) {
      claveNecesaria.add(nuevaClave);
      if (e.id) liberar.add(e.id);
    }
    if (campos.length > 0 && e.id) {
      const etiqueta = [l.proyecto, l.muebles.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || l.origen_importacion || "";
      aActualizar.push({ id: e.id, etiqueta, campos, cambios, ...(nuevaClave ? { nuevaClave } : {}) });
    } else {
      sinCambios++;
      if (nuevaClave && e.id) reubicadas.push({ id: e.id, nuevaClave });
    }
  }
  // Quien tenga hoy una clave que otro va a tomar (aunque ya no esté en el Excel) la suelta primero.
  for (const e of existentes) {
    if (e.id && tieneClaveEn(e, claveNecesaria)) liberar.add(e.id);
  }
  return {
    nuevas,
    sinCambios,
    aActualizar,
    cerradasEnLaApp,
    cambiaronDeFila: cambiaronDeFila.size,
    reubicadas,
    liberarClaves: [...liberar],
  };
}
