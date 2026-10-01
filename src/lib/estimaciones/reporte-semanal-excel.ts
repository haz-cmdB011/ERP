// Excel del reporte semanal con las columnas del "FORMATO MAQUILA SEMANA nn"
// que se le manda a Finanzas: un renglón por folio. La CLABE (columna ".")
// queda vacía hasta que exista el catálogo de contratistas; INF (Infonavit)
// también, porque todavía no hay datos.

import ExcelJS from "exceljs";
import { etiquetaSemana, type ReporteSemanal, type Semana } from "./reporte-semanal";

export const ENCABEZADOS_FORMATO = [
  "RAZONSOCIAL",
  ".",
  "CUENTA",
  "SUBCUENTA",
  "COMENTARIO 2",
  "OBS",
  "SEG",
  "ORDEN DE TRABAJO2",
  "ESTIMACION",
  "SS",
  "INF",
  "IMPORTE A PAGAR",
  "FOLIO",
  "OT¨S",
] as const;

const CUENTA_MAQUILA = "05 MAQUILA";
const FORMATO_DINERO = '"$"#,##0.00';

// Folio numérico como número (así venía en el Excel); con letras, texto.
function valorFolio(folio: string): string | number {
  return /^\d+$/.test(folio) ? Number(folio) : folio;
}

export function nombreArchivoFormato(semana: Semana): string {
  return `FORMATO MAQUILA SEMANA ${semana.semana} ${semana.anio}.xlsx`;
}

export async function generarExcelFormato(
  reporte: ReporteSemanal,
  semana: Semana,
  fechaEnvio: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(etiquetaSemana(semana));

  ws.addRow(["FECHA DE ENVIO", fechaEnvio]);
  const encabezado = ws.addRow([...ENCABEZADOS_FORMATO]);
  encabezado.font = { bold: true };
  encabezado.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  });

  const comentario = etiquetaSemana(semana);
  for (const g of reporte.grupos) {
    for (const f of g.filas) {
      ws.addRow([
        g.contratista,
        null,
        CUENTA_MAQUILA,
        f.subcuenta,
        comentario,
        `EST-${f.folio}`,
        null,
        [f.ot, f.obra].filter(Boolean).join(" ") || null,
        f.importe,
        f.seguroSocial,
        null,
        f.totalPagar,
        valorFolio(f.folio),
        f.ot || null,
      ]);
    }
  }

  const total = ws.addRow([
    "TOTAL",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    reporte.importe,
    reporte.seguroSocial,
    null,
    reporte.totalPagar,
  ]);
  total.font = { bold: true };

  for (const col of [9, 10, 11, 12]) ws.getColumn(col).numFmt = FORMATO_DINERO;
  const anchos = [36, 20, 13, 15, 14, 12, 6, 44, 14, 12, 10, 16, 8, 12];
  anchos.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 2 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
