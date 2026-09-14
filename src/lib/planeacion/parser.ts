import ExcelJS from "exceljs";
import type {
  CategoriaComponente,
  FilaError,
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

function cellDateISO(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "result" in value) {
    return cellDateISO(value.result as CellValue);
  }
  return null;
}

export async function parsePlaneacionExcel(
  buffer: Buffer | ArrayBuffer
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

  const errores: FilaError[] = [];

  // ---- 1. Metadata (pares etiqueta/valor en las primeras filas) ----------
  const metadata: Partial<PlaneacionMetadata> = {};
  const metadataScanLimit = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS);

  for (let r = 1; r <= metadataScanLimit; r++) {
    const row = worksheet.getRow(r);
    for (let c = 1; c <= row.cellCount; c++) {
      const raw = cellText(row.getCell(c).value);
      if (!raw) continue;
      const label = normalize(raw.replace(/:\s*$/, ""));
      const key = METADATA_LABELS[label];
      if (!key) continue;

      // valor = siguiente celda no vacía a la derecha, en la misma fila
      for (let vc = c + 1; vc <= row.cellCount; vc++) {
        const cellVal = row.getCell(vc).value;
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

  for (const [label, key] of Object.entries(METADATA_LABELS)) {
    if ((key === "numero_pedido" || key === "proyecto_nombre" || key === "cliente") && !metadata[key]) {
      errores.push({
        fila: 0,
        mensaje: `No se encontró la etiqueta "${label}" con su valor en el encabezado del archivo.`,
      });
    }
  }

  // ---- 2. Fila de encabezados de columna ----------------------------------
  let headerRowNumber: number | null = null;
  let columnMap: Record<string, number> = {};

  for (let r = 1; r <= Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS); r++) {
    const row = worksheet.getRow(r);
    const map: Record<string, number> = {};
    for (let c = 1; c <= row.cellCount; c++) {
      const text = cellText(row.getCell(c).value);
      if (text) map[normalize(text)] = c;
    }
    if (map["ITEM"] && map["CANTIDAD TOTAL"]) {
      headerRowNumber = r;
      columnMap = map;
      break;
    }
  }

  if (headerRowNumber === null) {
    errores.push({
      fila: 0,
      mensaje:
        'No se encontró la fila de encabezados: se esperaba una columna "ITEM" y una columna "CANTIDAD TOTAL".',
    });
    return { ok: false, errores, filasTotales: 0 };
  }

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
  let filasTotales = 0;

  const col = (name: (typeof REQUIRED_HEADERS)[number] | string) => columnMap[name];

  for (let r = headerRowNumber + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    if (row.cellCount === 0) continue;

    const itemCode = cellNumber(row.getCell(col("ITEM")).value);
    const descripcion = cellText(row.getCell(col("DESCRIPCION")).value);
    const modelo = cellText(row.getCell(col("MODELO")).value);
    const componenteRaw = cellText(row.getCell(col("COMPONENTE")).value);

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

    if (!descripcion) {
      errores.push({ fila: r, mensaje: "La columna DESCRIPCION está vacía." });
      continue;
    }

    const cantidadTotal = cellNumber(row.getCell(col("CANTIDAD TOTAL")).value);
    if (cantidadTotal === null) {
      errores.push({
        fila: r,
        mensaje: "La columna CANTIDAD TOTAL no contiene un número válido.",
      });
      continue;
    }

    // Nota: item_code NO es único por fila. Es habitual que un mismo mueble
    // (ej. "1.03") tenga varias filas FU con distinto material (madera,
    // metal, tapiz...). La identidad única de la fila es fila_excel_origen.

    items.push({
      item_code: itemCode,
      tipo_registro: tipoRegistro,
      categoria_componente: categoriaComponente,
      tipo_material: cellText(row.getCell(col("TIPO")).value),
      etapa: col("ETAPA") ? cellText(row.getCell(col("ETAPA")).value) : null,
      nivel: col("NIVEL") ? cellText(row.getCell(col("NIVEL")).value) : null,
      departamento: col("DEPARTAMENTO") ? cellText(row.getCell(col("DEPARTAMENTO")).value) : null,
      elevacion: col("ELEVACION") ? cellText(row.getCell(col("ELEVACION")).value) : null,
      modelo,
      descripcion,
      cantidad_x_mueble: cellNumber(row.getCell(col("CANTIDAD X MUEBLE")).value),
      unidad: cellText(row.getCell(col("UNIDAD")).value),
      cantidad_total: cantidadTotal,
      acabados: col("ACABADOS") ? cellText(row.getCell(col("ACABADOS")).value) : null,
      observaciones: col("OBSERVACIONES") ? cellText(row.getCell(col("OBSERVACIONES")).value) : null,
      fila_excel_origen: r,
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
  };
}
