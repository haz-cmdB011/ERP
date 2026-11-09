// Excel de la bitácora de taller: la lista de control (palomita, tache o sin marcar, con su motivo) y
// el historial de cambios, con lo que muestra la pantalla Bitácora.

import ExcelJS from "exceljs";
import type { RenglonControl } from "./control-taller";
import { MOTIVOS_ACTIVOS, describirCambio, formatoFechaHora, textoMarca, type EventoMarca } from "./historial-marcas";

function hoja(wb: ExcelJS.Workbook, nombre: string, encabezados: string[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombre);
  const fila = ws.addRow(encabezados);
  fila.font = { bold: true };
  fila.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return ws;
}

function anchos(ws: ExcelJS.Worksheet) {
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (c) => {
      max = Math.max(max, Math.min(50, String(c.value ?? "").length + 2));
    });
    col.width = max;
  });
}

export async function generarExcelControl(renglones: RenglonControl[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = hoja(wb, "Control de taller", [
    "O.T.",
    "PM",
    "MODELO",
    "EQUIPO",
    "PROCESO",
    "ESTADO",
    "CANTIDAD",
    "TIENE EL EQUIPO",
    "MARCA",
    ...(MOTIVOS_ACTIVOS ? ["MOTIVO"] : []),
  ]);
  for (const r of renglones) {
    ws.addRow([
      r.ot ?? "",
      r.numeroPm,
      r.modelo,
      r.equipo ?? "Sin equipo",
      r.proceso ?? "",
      r.estado,
      `${r.cantidad} ${r.unidad ?? ""}`.trim(),
      r.tiene,
      textoMarca(r.marca).toUpperCase(),
      ...(MOTIVOS_ACTIVOS ? [r.nota ?? ""] : []),
    ]);
  }
  anchos(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function generarExcelHistorial(eventos: EventoMarca[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = hoja(wb, "Historial de marcas", [
    "FECHA Y HORA",
    "MODELO",
    "O.T.",
    "PM",
    "EQUIPO",
    "ANTES",
    "DESPUÉS",
    "CAMBIO",
    ...(MOTIVOS_ACTIVOS ? ["MOTIVO"] : []),
    "QUIÉN",
  ]);
  for (const e of eventos) {
    ws.addRow([
      formatoFechaHora(e.hecho_en),
      e.modelo ?? "",
      e.orden_trabajo ?? "",
      e.numero_pedido ?? "",
      e.equipo ?? "Sin equipo",
      textoMarca(e.esta_anterior),
      textoMarca(e.esta),
      describirCambio(e),
      ...(MOTIVOS_ACTIVOS ? [e.nota ?? ""] : []),
      e.hecho_por_nombre ?? "",
    ]);
  }
  anchos(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
