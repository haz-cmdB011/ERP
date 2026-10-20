// Excel de Folios de calidad con los mismos filtros de la pantalla y sus mismas
// columnas: el motivo, el área y el estatus de la no conformidad van después del
// resultado, y el ítem sale sin descripción.

import ExcelJS from "exceljs";
import { nombreCategoria } from "./categorias";
import type { FolioParaExcel } from "./folios-consulta";
import { ESTATUS_LABELS } from "./no-conformidad";

export const ENCABEZADOS_FOLIOS = [
  "FOLIO",
  "RESULTADO",
  "TIPO DE DEFECTO",
  "MOTIVO",
  "ÁREA DE ORIGEN",
  "RESPONSABLE EN ÁREA DE ORIGEN",
  "ESTATUS",
  "FECHA DE CIERRE",
  "PM",
  "PROYECTO",
  "CLIENTE",
  "ÍTEM",
  "MODELO",
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
      f.motivo,
      f.areaOrigen,
      f.responsableOrigen,
      f.estatus ? ESTATUS_LABELS[f.estatus] : null,
      f.fechaCierre ? fechaLocalExcel(f.fechaCierre) : null,
      f.pedido,
      f.proyecto,
      f.cliente,
      f.itemCode,
      f.modelo,
      f.elaboro,
      fechaLocalExcel(f.elaboradoEn),
      f.situacion,
    ]);
  }

  ws.getColumn(8).numFmt = "dd/mm/yyyy";
  ws.getColumn(15).numFmt = "dd/mm/yyyy hh:mm";
  const anchos = [14, 13, 16, 40, 20, 24, 13, 15, 16, 28, 22, 7, 16, 24, 17, 18];
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: anchos.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
