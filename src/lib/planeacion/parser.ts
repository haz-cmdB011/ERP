import ExcelJS from "exceljs";
import { FASES_TALLER_COLUMNS, type FaseTaller } from "./fases-taller";
import type {
  CategoriaComponente,
  FilaError,
  ImagenExtraida,
  ParseResult,
  PlaneacionItemParsed,
  PlaneacionMetadata,
  TipoRegistroItem,
} from "./types";

/**
 * Parser del Excel "PEDIDO DE MANUFACTURA" de Planeación.
 *
 * Formato esperado (ver muestra real PM 107-26 SMART FIT PLAZA PALMIRA):
 * - Metadata en las primeras ~8 filas como pares etiqueta/valor
 *   ("PROYECTO:", "CLIENTE:", "No. PEDIDO", "FECHA:", "FECHA DE ENTREGA:").
 * - Una fila de encabezados de columna (contiene "ITEM" y "CANTIDAD TOTAL").
 * - Filas de datos jerárquicas por la forma del ITEM: entero = mueble
 *   (MO, padre), decimal (ej. 1.01) = componente (FU) hijo del mueble con
 *   ese mismo entero.
 * - La columna COMPONENTE (MOB/MO, FUN/FU, PER...) es una CATEGORÍA
 *   independiente del rol padre/hijo: un PER puede aparecer como padre
 *   (ITEM entero) y su despiece puede venir etiquetado MOB o FUN — el rol
 *   padre/hijo lo decide siempre la forma del ITEM, nunca este texto.
 */

const REQUIRED_HEADERS = [
  "ITEM",
  "COMPONENTE",
  "TIPO",
  "MODELO",
  "DESCRIPCION",
  "CANTIDAD X MUEBLE",
  "UNIDAD",
  "CANTIDAD TOTAL",
] as const;

const METADATA_LABELS: Record<string, keyof PlaneacionMetadata> = {
  "NO. PEDIDO": "numero_pedido",
  PROYECTO: "proyecto_nombre",
  CLIENTE: "cliente",
  FECHA: "fecha_pedido",
  "FECHA DE ENTREGA": "fecha_entrega",
};

const MAX_HEADER_SCAN_ROWS = 15;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

type CellValue = ExcelJS.CellValue;

// exceljs no siempre expone `result` en `cell.value` para celdas de
// fórmula compartida ("shared formula"): las celdas "esclavas" de un
// rango compartido (y a veces hasta la propia maestra) devuelven un
// objeto sin `result`, aunque el valor cacheado sí existe en el modelo
// interno de la celda (`cell.model.result`). Sin este fallback, cualquier
// columna calculada por fórmula (común en CANTIDAD TOTAL cuando depende
// de la cantidad del mueble padre) se leería como no numérica.
function resolvedValue(cell: ExcelJS.Cell): CellValue {
  const value = cell.value;
  const esObjetoSinResultado =
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date) &&
    !("richText" in value) &&
    !("text" in value) &&
    !("result" in value);

  if (esObjetoSinResultado) {
    const model = cell.model as { result?: CellValue } | undefined;
    if (model && "result" in model) {
      return model.result as CellValue;
    }
  }
  return value;
}

function cellText(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((rt) => rt.text).join("").trim() || null;
    }
    if ("result" in value) return cellText(value.result as CellValue);
    if ("text" in value && typeof value.text === "string") return value.text.trim() || null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function cellNumber(value: CellValue): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if ("result" in value) return cellNumber(value.result as CellValue);
  }
  const raw = typeof value === "number" ? value : String(value).trim().replace(",", ".");
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  // Redondea artefactos de precisión flotante (ej. 5.029999999999999 -> 5.03).
  return Math.round(n * 100) / 100;
}

const VALORES_VERDADEROS = new Set(["1", "X", "SI", "S", "TRUE", "OK"]);

// Banderas de validación (INGENIERIA, SUMINISTRO DE MATS, fases de taller):
// en la práctica se marcan con "1", "X" o similar, no siempre con booleanos
// reales de Excel. Todo lo que no sea un valor reconocido como verdadero
// (vacío, "0", "NO"...) se trata como falso.
function cellFlag(value: CellValue): boolean {
  const num = cellNumber(value);
  if (num !== null) return num === 1;
  const text = cellText(value);
  if (!text) return false;
  return VALORES_VERDADEROS.has(normalize(text));
}

// Coincidencia por PREFIJO, no exacta: en la práctica los archivos reales
// usan variaciones ("MO", "MOB", "MOBILIARIO", "FU", "FUN", "PER"...).
// Siempre van a aparecer variantes nuevas, así que se acepta cualquier
// texto que empiece por estos prefijos en vez de una lista cerrada.
function normalizeCategoriaComponente(raw: string): CategoriaComponente | null {
  const norm = normalize(raw);
  if (norm.startsWith("MO")) return "MOBILIARIO";
  if (norm.startsWith("FU")) return "FUNCION";
  if (norm.startsWith("PE")) return "PERIMETRO";
  return null;
}

// Fechas escritas como texto en vez de fecha de Excel: "08.07.26",
// "04/11/2025", "4-11-25" (día, mes, año).
const PATRON_FECHA_TEXTO = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/;

function cellDateISO(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "result" in value) {
    return cellDateISO(value.result as CellValue);
  }
  const m = cellText(value)?.match(PATRON_FECHA_TEXTO);
  if (!m) return null;
  const [dia, mes] = [Number(m[1]), Number(m[2])];
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const anio = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// Título con el número de PM en las primeras filas cuando el archivo no
// trae la etiqueta "No. PEDIDO" (ej. "168-25 REMODELACIÓN PH MONTERREY",
// "PM 107-26 SMART FIT", "2PM134-26 ..."). Solo texto: una fecha de Excel
// ("2025-11-04") no cuenta.
const PATRON_TITULO_PM = /^\s*(?:\d{1,3}\s*)?(?:PM\s*[-_ ]?\s*)?\d{1,5}\s*-\s*(?:\d{4}|\d{2})(?!\d)/i;

// Las imágenes de la columna IMAGEN no son valores de celda: Excel las
// ancla como objetos flotantes (drawing) sobre un rango de celdas, vía
// worksheet.getImages(). Se filtran por cercanía a la columna IMAGEN para
// no capturar objetos ajenos (ej. el logo del encabezado, anclado en otra
// columna) y se agrupan por fila de origen porque un mismo ítem puede
// tener varias imágenes ancladas (se observaron hasta 6 en archivos reales).
function extraerImagenesPorFila(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  imagenColIndex: number | undefined
): Map<number, ImagenExtraida[]> {
  const porFila = new Map<number, ImagenExtraida[]>();
  if (!imagenColIndex) return porFila;

  const imagenColZeroBased = imagenColIndex - 1;
  const media = workbook.model.media;

  for (const img of worksheet.getImages()) {
    const tlCol = Math.floor(img.range.tl.nativeCol);
    // br puede faltar en anclas de una sola celda (oneCellAnchor); en ese
    // caso se trata la imagen como si ocupara solo la celda de tl.
    const brCol = img.range.br ? Math.ceil(img.range.br.nativeCol) : tlCol;
    if (imagenColZeroBased < tlCol - 1 || imagenColZeroBased > brCol + 1) continue;

    const asset = media[Number(img.imageId)];
    if (!asset?.buffer) continue;

    const excelRow = Math.round(img.range.tl.nativeRow) + 1;
    const lista = porFila.get(excelRow) ?? [];
    lista.push({ buffer: Buffer.from(asset.buffer), extension: asset.extension ?? "png" });
    porFila.set(excelRow, lista);
  }

  return porFila;
}

// Fila de encabezados de columna: la primera (en las primeras filas) que
// tiene "ITEM" y "CANTIDAD TOTAL". Es también lo que distingue una hoja con
// formato de PM de una hoja de notas o cálculos dentro del mismo archivo.
function buscarEncabezados(
  worksheet: ExcelJS.Worksheet
): { headerRowNumber: number; columnMap: Record<string, number> } | null {
  for (let r = 1; r <= Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS); r++) {
    const row = worksheet.getRow(r);
    const map: Record<string, number> = {};
    for (let c = 1; c <= row.cellCount; c++) {
      const text = cellText(resolvedValue(row.getCell(c)));
      if (!text) continue;
      const nombre = normalize(text);
      map[nombre] = c;
      // Variantes de encabezado vistas en archivos reales.
      if (nombre === "ACABADOS ACTUALIZADOS" && !map["ACABADOS"]) map["ACABADOS"] = c;
    }
    if (map["ITEM"] && map["CANTIDAD TOTAL"]) {
      return { headerRowNumber: r, columnMap: map };
    }
  }
  return null;
}

/** Una hoja del archivo con formato de PM y el resultado de leerla. */
export interface HojaPM {
  nombreHoja: string;
  // Posición de la hoja en el archivo (0 = primera); distingue las rutas
  // de las imágenes de cada hoja en Storage.
  indiceHoja: number;
  resultado: ParseResult;
}

export interface ResultadoLibro {
  // Hojas con formato de PM, en el orden del archivo. Si ninguna lo tiene,
  // trae solo la primera hoja con sus errores de formato.
  hojas: HojaPM[];
  // Hojas sin formato de PM (notas, cálculos) u ocultas: no se cargan.
  hojasIgnoradas: string[];
}

/**
 * Lee TODAS las hojas del archivo: algunos PM traen más de un pedido en el
 * mismo Excel (ej. la hoja "PEDIDO" y una hoja "SDC-1" con su propio
 * encabezado y No. PEDIDO). Cada hoja con formato de PM se lee por separado.
 */
export async function parsePlaneacionLibro(
  buffer: Buffer | ArrayBuffer,
  opciones: { nombreArchivo?: string } = {}
): Promise<ResultadoLibro> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ExcelJS.Buffer);

  const hojas: HojaPM[] = [];
  const hojasIgnoradas: string[] = [];
  workbook.worksheets.forEach((worksheet, indiceHoja) => {
    if (worksheet.state !== "visible" || !buscarEncabezados(worksheet)) {
      hojasIgnoradas.push(worksheet.name);
      return;
    }
    hojas.push({
      nombreHoja: worksheet.name,
      indiceHoja,
      resultado: parsearHoja(worksheet, workbook, {
        // El nombre del archivo solo sirve de respaldo para el No. PEDIDO de
        // la primera hoja: en las demás daría el mismo PM que la primera.
        nombreArchivo: hojas.length === 0 ? opciones.nombreArchivo : undefined,
      }),
    });
  });

  // Ninguna hoja con formato: se reporta la primera con sus errores, igual
  // que un archivo de una sola hoja.
  if (hojas.length === 0) {
    const primera = workbook.worksheets[0];
    return {
      hojas: [
        {
          nombreHoja: primera?.name ?? "",
          indiceHoja: 0,
          resultado: primera
            ? parsearHoja(primera, workbook, opciones)
            : {
                ok: false,
                errores: [{ fila: 0, mensaje: "El archivo no contiene ninguna hoja." }],
                filasTotales: 0,
              },
        },
      ],
      hojasIgnoradas: [],
    };
  }

  return { hojas, hojasIgnoradas };
}

/** Lee solo la primera hoja del archivo. */
export async function parsePlaneacionExcel(
  buffer: Buffer | ArrayBuffer,
  // Respaldo para el número de PM si el archivo no lo trae en el encabezado.
  opciones: { nombreArchivo?: string } = {}
): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ExcelJS.Buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return {
      ok: false,
      errores: [{ fila: 0, mensaje: "El archivo no contiene ninguna hoja." }],
      filasTotales: 0,
    };
  }
  return parsearHoja(worksheet, workbook, opciones);
}

function parsearHoja(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  opciones: { nombreArchivo?: string }
): ParseResult {
  const errores: FilaError[] = [];

  // ---- 1. Metadata (pares etiqueta/valor en las primeras filas) ----------
  // fecha_pedido/fecha_entrega arrancan en null (no undefined): si faltan,
  // el objeto igual debe tener la clave — de lo contrario, al serializar la
  // llamada al RPC de ingestión, JSON.stringify elimina las claves con
  // valor undefined y Postgres recibe menos argumentos de los que espera.
  const metadata: Partial<PlaneacionMetadata> = {
    fecha_pedido: null,
    fecha_entrega: null,
  };
  const metadataScanLimit = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS);

  for (let r = 1; r <= metadataScanLimit; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const raw = cellText(resolvedValue(row.getCell(c)));
      if (!raw) continue;
      const label = normalize(raw.replace(/:\s*$/, ""));
      const key = METADATA_LABELS[label];
      if (!key) continue;

      // valor = siguiente celda no vacía a la derecha, en la misma fila
      for (let vc = c + 1; vc <= row.cellCount; vc++) {
        const cellVal = resolvedValue(row.getCell(vc));
        if (key === "fecha_pedido" || key === "fecha_entrega") {
          const iso = cellDateISO(cellVal);
          if (iso) {
            metadata[key] = iso;
            break;
          }
        } else {
          const text = cellText(cellVal);
          if (text) {
            metadata[key as "numero_pedido" | "proyecto_nombre" | "cliente"] = text;
            break;
          }
        }
      }
    }
  }

  // Sin etiqueta "No. PEDIDO": el número de PM del título de las primeras
  // filas y, si tampoco, del nombre del archivo (lo normaliza la ruta).
  if (!metadata.numero_pedido) {
    for (let r = 1; r <= metadataScanLimit && !metadata.numero_pedido; r++) {
      const row = worksheet.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        const valor = resolvedValue(row.getCell(c));
        if (typeof valor !== "string" && !(valor && typeof valor === "object" && "richText" in valor)) {
          continue;
        }
        const texto = cellText(valor);
        if (texto && PATRON_TITULO_PM.test(texto)) {
          metadata.numero_pedido = texto;
          break;
        }
      }
    }
  }
  if (!metadata.numero_pedido && opciones.nombreArchivo && /\d/.test(opciones.nombreArchivo)) {
    metadata.numero_pedido = opciones.nombreArchivo.replace(/\.xls[xm]$/i, "");
  }

  for (const [label, key] of Object.entries(METADATA_LABELS)) {
    if ((key === "numero_pedido" || key === "proyecto_nombre" || key === "cliente") && !metadata[key]) {
      errores.push({
        fila: 0,
        mensaje: `No se encontró la etiqueta "${label}" con su valor en el encabezado del archivo.`,
      });
    }
  }

  // ---- 2. Fila de encabezados de columna ----------------------------------
  const encabezados = buscarEncabezados(worksheet);

  if (encabezados === null) {
    errores.push({
      fila: 0,
      mensaje:
        'No se encontró la fila de encabezados: se esperaba una columna "ITEM" y una columna "CANTIDAD TOTAL".',
    });
    return { ok: false, errores, filasTotales: 0 };
  }
  const { headerRowNumber, columnMap } = encabezados;

  const missingHeaders = REQUIRED_HEADERS.filter((h) => !columnMap[h]);
  if (missingHeaders.length > 0) {
    errores.push({
      fila: headerRowNumber,
      mensaje: `Faltan columnas requeridas en el archivo: ${missingHeaders.join(", ")}.`,
    });
  }

  if (errores.length > 0) {
    return { ok: false, errores, filasTotales: 0 };
  }

  // ---- 3. Filas de datos ---------------------------------------------------
  const items: PlaneacionItemParsed[] = [];
  const avisos: FilaError[] = [];
  let filasTotales = 0;

  const col = (name: (typeof REQUIRED_HEADERS)[number] | string) => columnMap[name];
  const imagenesPorFila = extraerImagenesPorFila(worksheet, workbook, columnMap["IMAGEN"]);

  for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    if (row.cellCount === 0) continue;

    const itemCode = cellNumber(resolvedValue(row.getCell(col("ITEM"))));
    const descripcion = cellText(resolvedValue(row.getCell(col("DESCRIPCION"))));
    const modelo = cellText(resolvedValue(row.getCell(col("MODELO"))));
    const componenteRaw = cellText(resolvedValue(row.getCell(col("COMPONENTE"))));

    const filaTieneContenido = itemCode !== null || descripcion || modelo || componenteRaw;
    if (!filaTieneContenido) continue; // fila vacía / separador, se ignora

    filasTotales++;

    if (itemCode === null) {
      // fila con contenido pero sin ITEM numérico (ej. fila de "pesos" de avance): se ignora
      continue;
    }

    // El rol padre/hijo lo decide la forma del ITEM, no el texto de
    // COMPONENTE: entero = MO (padre), con decimales = FU (hijo).
    const tipoRegistro: TipoRegistroItem =
      Number.isInteger(itemCode) ? "MO" : "FU";

    // Best-effort: si COMPONENTE no coincide con MOB/FUN/PER (algunos
    // proyectos usan esa columna para otra cosa, ej. códigos de modelo),
    // se guarda como null en vez de rechazar la fila — no es un campo
    // estructural, el rol padre/hijo ya lo decidió el ITEM arriba.
    const categoriaComponente = componenteRaw
      ? normalizeCategoriaComponente(componenteRaw)
      : null;

    const cantidadTotal = cellNumber(resolvedValue(row.getCell(col("CANTIDAD TOTAL"))));

    // Renglón de relleno: solo trae el número de ITEM (y quizá "N/A" en
    // otras columnas), sin modelo, descripción ni cantidad. No es un ítem.
    if (!descripcion && !modelo && cantidadTotal === null) {
      filasTotales--;
      continue;
    }

    // Datos incompletos en archivos reales: el ítem se guarda igual y se
    // avisa, en vez de rechazar todo el archivo por un renglón.
    const etiquetaItem = `Ítem ${itemCode}${modelo ? ` (${modelo})` : ""}`;
    if (!descripcion) {
      avisos.push({
        fila: r,
        mensaje: `${etiquetaItem}: sin DESCRIPCION; se guardó sin descripción.`,
      });
    }

    const cantidadXMueble = cellNumber(resolvedValue(row.getCell(col("CANTIDAD X MUEBLE"))));
    let cantidadFinal = cantidadTotal;
    if (cantidadFinal === null) {
      cantidadFinal = cantidadXMueble ?? 0;
      avisos.push({
        fila: r,
        mensaje: `${etiquetaItem}: CANTIDAD TOTAL vacía o no numérica; se guardó ${cantidadFinal}${
          cantidadXMueble !== null ? " (la CANTIDAD X MUEBLE)" : ""
        }. Revísala.`,
      });
    }

    // Nota: item_code NO es único por fila. Es habitual que un mismo mueble
    // (ej. "1.03") tenga varias filas FU con distinto material (madera,
    // metal, tapiz...). La identidad única de la fila es fila_excel_origen.

    const fasesTaller: Partial<Record<FaseTaller, boolean>> = {};
    for (const fase of FASES_TALLER_COLUMNS) {
      if (col(fase)) {
        fasesTaller[fase] = cellFlag(resolvedValue(row.getCell(col(fase))));
      }
    }

    items.push({
      item_code: itemCode,
      tipo_registro: tipoRegistro,
      categoria_componente: categoriaComponente,
      tipo_material: cellText(resolvedValue(row.getCell(col("TIPO")))),
      etapa: col("ETAPA") ? cellText(resolvedValue(row.getCell(col("ETAPA")))) : null,
      nivel: col("NIVEL") ? cellText(resolvedValue(row.getCell(col("NIVEL")))) : null,
      departamento: col("DEPARTAMENTO") ? cellText(resolvedValue(row.getCell(col("DEPARTAMENTO")))) : null,
      elevacion: col("ELEVACION") ? cellText(resolvedValue(row.getCell(col("ELEVACION")))) : null,
      modelo,
      descripcion,
      cantidad_x_mueble: cantidadXMueble,
      unidad: cellText(resolvedValue(row.getCell(col("UNIDAD")))),
      cantidad_total: cantidadFinal,
      acabados: col("ACABADOS") ? cellText(resolvedValue(row.getCell(col("ACABADOS")))) : null,
      observaciones: col("OBSERVACIONES") ? cellText(resolvedValue(row.getCell(col("OBSERVACIONES")))) : null,
      fila_excel_origen: r,
      imagenes: imagenesPorFila.get(r) ?? [],
      ingenieria: col("INGENIERIA") ? cellFlag(resolvedValue(row.getCell(col("INGENIERIA")))) : null,
      lista_insumos: col("LISTA DE INSUMOS")
        ? cellText(resolvedValue(row.getCell(col("LISTA DE INSUMOS"))))
        : null,
      suministro_mats: col("SUMINISTRO DE MATS")
        ? cellFlag(resolvedValue(row.getCell(col("SUMINISTRO DE MATS"))))
        : null,
      fases_taller: fasesTaller,
    });
  }

  if (errores.length === 0 && items.length === 0) {
    errores.push({ fila: 0, mensaje: "El archivo no contiene filas de datos." });
  }

  if (errores.length > 0) {
    return { ok: false, errores, filasTotales };
  }

  return {
    ok: true,
    metadata: metadata as PlaneacionMetadata,
    items,
    filasTotales,
    avisos,
  };
}
