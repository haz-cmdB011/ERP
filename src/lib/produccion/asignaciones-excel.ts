// Excel del control de asignaciones con las mismas columnas que llevaba el
// encargado de Producción a mano, más el estado y lo entregado.

import ExcelJS from "exceljs";
import {
  ESTADO_ASIGNACION_LABELS,
  PROCESO_LABELS,
  diasEnProceso,
  type AsignacionResumen,
} from "./asignaciones";

export const ENCABEZADOS_ASIGNACIONES = [
  "PM",
  "ÍTEM",
  "MODELO",
  "DESCRIPCIÓN",
  "CANTIDAD ASIGNADA",
  "CANTIDAD ENTREGADA",
  "EQUIPO",
  "ENCARGADO",
  "PROCESO",
  "FECHA DE ASIGNACIÓN",
  "FECHA DE ENTREGA",
  "DÍAS",
  "FOLIOS DE CALIDAD",
  "ESTADO",
  "NOTAS",
] as const;

// "2026-10-05" -> fecha de Excel (sin corrimiento por zona horaria).
function fechaExcel(fecha: string | null): Date | null {
  if (!fecha) return null;
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export async function generarExcelAsignaciones(
  filas: AsignacionResumen[],
  hoy: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Asignaciones");

  const encabezado = ws.addRow([...ENCABEZADOS_ASIGNACIONES]);
  encabezado.font = { bold: true };
  encabezado.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  });

  for (const a of filas) {
    ws.addRow([
      a.numero_pedido,
      a.item_code,
      a.modelo,
      a.descripcion?.split("\n")[0] ?? null,
      Number(a.cantidad),
      Number(a.entregado),
      a.es_planta ? `${a.equipo} (planta)` : a.equipo,
      a.equipo_encargado,
      PROCESO_LABELS[a.proceso],
      fechaExcel(a.fecha_asignacion),
      // La fecha de entrega es la de la última entrega, y solo cuando terminó.
      a.estado === "entregada" ? fechaExcel(a.ultima_entrega) : null,
      diasEnProceso(a, hoy),
      a.folios_calidad,
      ESTADO_ASIGNACION_LABELS[a.estado],
      a.cancelada_en ? `Cancelada: ${a.motivo_cancelacion ?? ""}` : a.notas,
    ]);
  }

  ws.getColumn(10).numFmt = "dd/mm/yyyy";
  ws.getColumn(11).numFmt = "dd/mm/yyyy";
  const anchos = [16, 8, 18, 40, 10, 10, 22, 20, 10, 12, 12, 7, 30, 16, 30];
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: anchos.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
