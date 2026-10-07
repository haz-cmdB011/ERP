// Excel de Folios de calidad con los mismos filtros de la pantalla.

import ExcelJS from "exceljs";
import { nombreCategoria } from "./categorias";
import type { FolioParaExcel } from "./folios-consulta";

export const ENCABEZADOS_FOLIOS = [
  "FOLIO",
  "RESULTADO",
  "TIPO DE DEFECTO",
  "FOLIO PRODUCCIÓN",
  "PM",
  "PROYECTO",
  "CLIENTE",
  "ÍTEM",
  "MODELO",
  "MATERIAL",
  "OBSERVACIONES",
  "ELABORÓ",
  "FECHA Y HORA",
  "SITUACIÓN",
] as const;

// Hora de la empresa (UTC-6 todo el año desde 2022) como fecha de Excel "de
// reloj": Excel no guarda zona, así que se escribe la hora local ya aplicada.
function fechaLocalExcel(iso: string): Date {
  return new Date(new Date(iso).getTime() - 6 * 3600_000);
}

export async function generarExcelFolios(filas: FolioParaExcel[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Folios de calidad");

  const encabezado = ws.addRow([...ENCABEZADOS_FOLIOS]);
  encabezado.font = { bold: true };
  encabezado.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  });

  for (const f of filas) {
    ws.addRow([
      f.folio,
      f.aprobado ? "Aprobado" : "No aprobado",
      f.aprobado ? null : nombreCategoria(f.categoria),
      f.folioProduccion,
      f.pedido,
      f.proyecto,
      f.cliente,
      f.itemCode,
      f.modelo,
      f.material,
      f.descripcion,
      f.elaboro,
      fechaLocalExcel(f.elaboradoEn),
      f.situacion,
    ]);
  }

  ws.getColumn(13).numFmt = "dd/mm/yyyy hh:mm";
  const anchos = [14, 13, 16, 16, 16, 28, 22, 7, 16, 16, 44, 24, 17, 18];
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: anchos.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
