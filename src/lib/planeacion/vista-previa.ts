import ExcelJS from "exceljs";
import { buscarEncabezados, textoDeCelda } from "./parser";
import {
  diagnosticarEncabezados,
  type ColumnaEncabezado,
  type FaltaColumna,
} from "./formato";

/**
 * Vista previa de un Excel que no cumple el formato: las primeras filas tal
 * como las lee el parser, con la fila de encabezados marcada, las columnas no
 * reconocidas y las que faltan. Así quien carga ve qué está mal en su archivo.
 */

export interface FilaVistaPrevia {
  numero: number;
  // Un texto por columna, desde la columna A; "" si la celda está vacía.
  celdas: string[];
}

export interface VistaPrevia {
  hoja: string;
  // null si el archivo no tiene ninguna fila de encabezados reconocible.
  filaEncabezado: number | null;
  filas: FilaVistaPrevia[];
  // Columnas (desde 1) del encabezado que no corresponden a ningún nombre del formato.
  desconocidas: number[];
  faltantes: FaltaColumna[];
}

// Tope de la vista: lo suficiente para ver el encabezado y los primeros
// renglones, sin volver pesada la respuesta.
const FILAS_DESPUES_DEL_ENCABEZADO = 8;
const FILAS_SIN_ENCABEZADO = 15;
const MAX_COLUMNAS = 30;

export async function construirVistaPrevia(
  buffer: Buffer | ArrayBuffer
): Promise<VistaPrevia | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ExcelJS.Buffer);

  // Se muestra la hoja cuyo encabezado se parece más al del formato; si
  // ninguna, la primera.
  let hoja: ExcelJS.Worksheet | undefined = workbook.worksheets[0];
  let mejor = hoja ? buscarEncabezados(hoja) : null;
  for (const candidata of workbook.worksheets) {
    const encabezados = buscarEncabezados(candidata);
    if (encabezados && (!mejor || encabezados.coincidencias > mejor.coincidencias)) {
      hoja = candidata;
      mejor = encabezados;
    }
  }
  if (!hoja) return null;

  const filaEncabezado = mejor?.headerRowNumber ?? null;
  const ultimaFila = Math.min(
    hoja.rowCount,
    filaEncabezado !== null ? filaEncabezado + FILAS_DESPUES_DEL_ENCABEZADO : FILAS_SIN_ENCABEZADO
  );
  const ultimaColumna = Math.min(hoja.columnCount, MAX_COLUMNAS);

  const filas: FilaVistaPrevia[] = [];
  for (let r = 1; r <= ultimaFila; r++) {
    const fila = hoja.getRow(r);
    const celdas: string[] = [];
    for (let c = 1; c <= ultimaColumna; c++) {
      celdas.push(textoDeCelda(fila.getCell(c)));
    }
    filas.push({ numero: r, celdas });
  }

  const columnasEncabezado: ColumnaEncabezado[] = [];
  if (filaEncabezado !== null) {
    const fila = hoja.getRow(filaEncabezado);
    for (let c = 1; c <= ultimaColumna; c++) {
      const texto = textoDeCelda(fila.getCell(c));
      if (texto) columnasEncabezado.push({ columna: c, texto });
    }
  }
  const diagnostico = diagnosticarEncabezados(columnasEncabezado);

  return {
    hoja: hoja.name,
    filaEncabezado,
    filas,
    desconocidas: diagnostico.desconocidas.map((c) => c.columna),
    faltantes: diagnostico.faltantes,
  };
}
