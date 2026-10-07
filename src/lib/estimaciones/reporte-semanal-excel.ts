// Excel del reporte semanal con las columnas del "FORMATO MAQUILA SEMANA nn":
// un renglón por folio. La CLABE (columna ".") queda vacía hasta que exista el
// catálogo de contratistas; INF (Infonavit) también, porque todavía no hay
// datos. La primera hoja conserva el formato; después van el resumen por
// maquilador y área y, si hay, las diferencias contra el PM.

import ExcelJS from "exceljs";
import { AREAS_COBRO, estadoCelda, type FilaPmCobrado } from "./pm-cobrado";
import { ETIQUETA_AREA } from "./reporte-dashboard";
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

// `descargadoEl`: fecha "AAAA-MM-DD" de la descarga; `filtrado`: el Excel trae
// solo una parte de la semana.
export function nombreArchivoFormato(semana: Semana, descargadoEl?: string, filtrado = false): string {
  const fecha = descargadoEl ? ` (descargado ${descargadoEl})` : "";
  return `FORMATO MAQUILA SEMANA ${semana.semana} ${semana.anio}${filtrado ? " FILTRADO" : ""}${fecha}.xlsx`;
}

export interface ExtrasExcel {
  // Texto de los filtros activos; si viene, el archivo lo avisa en cada hoja.
  filtro?: string;
  // Modelos con diferencias contra el PM en las O.T. del reporte.
  diferenciasPm?: FilaPmCobrado[];
}

const ENCABEZADO_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } } as const;
const ETIQUETA_COBRO: Record<string, string> = {
  no_aplica: "No aplica",
  sin_cobro: "Sin cobro",
  parcial: "Parcial",
  completo: "Completo",
  excedido: "Cobrado de más",
  fuera_del_pm: "Fuera del PM",
};

function hojaResumen(wb: ExcelJS.Workbook, reporte: ReporteSemanal, semana: Semana, filtro?: string) {
  const ws = wb.addWorksheet("Resumen");
  ws.addRow([`Resumen ${etiquetaSemana(semana)}`]).font = { bold: true, size: 13 };
  if (filtro) ws.addRow([`REPORTE FILTRADO: ${filtro}. No incluye toda la semana.`]).font = { bold: true, color: { argb: "FFB45309" } };
  ws.addRow([]);

  const cab = ws.addRow(["Maquilador", "Recibos", "Piezas", "Importe"]);
  cab.font = { bold: true };
  cab.eachCell((c) => (c.fill = ENCABEZADO_FILL));
  for (const g of reporte.grupos) ws.addRow([g.contratista, g.filas.length, g.piezas, g.importe]);
  const total = ws.addRow(["TOTAL", reporte.numRecibos, reporte.grupos.reduce((s, g) => s + g.piezas, 0), reporte.importe]);
  total.font = { bold: true };

  ws.addRow([]);
  const cabArea = ws.addRow(["Área", "Recibos", "Piezas", "Importe"]);
  cabArea.font = { bold: true };
  cabArea.eachCell((c) => (c.fill = ENCABEZADO_FILL));
  const porArea = new Map<string, { recibos: number; piezas: number; importe: number }>();
  for (const f of reporte.grupos.flatMap((g) => g.filas)) {
    const a = porArea.get(f.tipo) ?? { recibos: 0, piezas: 0, importe: 0 };
    a.recibos += 1;
    a.piezas += f.piezas;
    a.importe += f.importe;
    porArea.set(f.tipo, a);
  }
  for (const [tipo, a] of porArea) {
    ws.addRow([ETIQUETA_AREA[tipo as keyof typeof ETIQUETA_AREA], a.recibos, a.piezas, Math.round(a.importe * 100) / 100]);
  }

  ws.getColumn(4).numFmt = FORMATO_DINERO;
  [34, 10, 12, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

function hojaDiferenciasPm(wb: ExcelJS.Workbook, filas: FilaPmCobrado[]) {
  const ws = wb.addWorksheet("Diferencias PM");
  const cab = ws.addRow([
    "O.T.",
    "Proyecto",
    "Modelo",
    "Descripción",
    "Cantidad PM",
    "Acabados",
    "Armado",
    "Electrificación",
    "Revisar",
  ]);
  cab.font = { bold: true };
  cab.eachCell((c) => (c.fill = ENCABEZADO_FILL));
  for (const f of filas) {
    const revisar = AREAS_COBRO.flatMap((a) => {
      const e = estadoCelda(f, a);
      return e === "excedido" || e === "fuera_del_pm" ? [`${ETIQUETA_AREA[a]}: ${ETIQUETA_COBRO[e]}`] : [];
    });
    ws.addRow([
      f.ot,
      f.proyecto,
      f.modelo,
      f.descripcion,
      f.cantidadPm,
      f.acabados,
      f.armado,
      f.electrificacion,
      revisar.join("; "),
    ]);
  }
  [10, 28, 18, 34, 12, 11, 10, 15, 44].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function generarExcelFormato(
  reporte: ReporteSemanal,
  semana: Semana,
  fechaEnvio: string,
  extras: ExtrasExcel = {}
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(etiquetaSemana(semana));

  const fechaFila = ws.addRow(["FECHA DE ENVIO", fechaEnvio]);
  if (extras.filtro) {
    fechaFila.getCell(4).value = `REPORTE FILTRADO: ${extras.filtro}`;
    fechaFila.getCell(4).font = { bold: true, color: { argb: "FFB45309" } };
  }
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

  hojaResumen(wb, reporte, semana, extras.filtro);
  if (extras.diferenciasPm && extras.diferenciasPm.length > 0) hojaDiferenciasPm(wb, extras.diferenciasPm);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
