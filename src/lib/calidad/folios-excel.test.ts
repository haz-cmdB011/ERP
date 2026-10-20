import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { FolioParaExcel } from "./folios-consulta";
import { ENCABEZADOS_FOLIOS, generarExcelFolios } from "./folios-excel";

const noConforme: FolioParaExcel = {
  folio: "CAL-000014",
  aprobado: false,
  categoria: null,
  elaboradoEn: "2026-10-19T19:03:00.000Z",
  elaboro: "Janette Suheilli Galicia Maldonado",
  pedido: "PM157-26",
  proyecto: "MOBILIARIO SMART FIT MONCLOVA",
  cliente: "SMART FIT",
  itemCode: 3.01,
  modelo: "M-CHK",
  situacion: null,
  motivo: "0150 · TAPICERIA CON RESTOS DE ADHESIVO",
  areaOrigen: "PROD-TAPIZ",
  responsableOrigen: "MARTIN PEREA",
  estatus: "cerrado",
  fechaCierre: "2026-10-19T19:03:00.000Z",
};

const aprobado: FolioParaExcel = {
  ...noConforme,
  folio: "CAL-000013",
  aprobado: true,
  motivo: null,
  areaOrigen: null,
  responsableOrigen: null,
  estatus: null,
  fechaCierre: null,
};

async function leerHoja(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  // El tipo de Buffer de exceljs no coincide con el de Node en esta versión de TypeScript.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb.worksheets[0];
}

describe("Excel de folios", () => {
  it("tiene las columnas de la tabla y no las que se quitaron", () => {
    expect(ENCABEZADOS_FOLIOS).toContain("MOTIVO");
    expect(ENCABEZADOS_FOLIOS).toContain("ÁREA DE ORIGEN");
    expect(ENCABEZADOS_FOLIOS).toContain("ESTATUS");
    expect(ENCABEZADOS_FOLIOS).not.toContain("FOLIO PRODUCCIÓN");
    expect(ENCABEZADOS_FOLIOS).not.toContain("MATERIAL");
    expect(ENCABEZADOS_FOLIOS).not.toContain("OBSERVACIONES");
  });

  it("escribe la no conformidad en su columna y deja vacío lo que no aplica", async () => {
    const ws = await leerHoja(await generarExcelFolios([noConforme, aprobado]));
    const encabezados = ws.getRow(1).values as unknown[];
    const columna = (nombre: string) => encabezados.indexOf(nombre);

    const nc = ws.getRow(2);
    expect(nc.getCell(columna("FOLIO")).value).toBe("CAL-000014");
    expect(nc.getCell(columna("MOTIVO")).value).toBe("0150 · TAPICERIA CON RESTOS DE ADHESIVO");
    expect(nc.getCell(columna("ÁREA DE ORIGEN")).value).toBe("PROD-TAPIZ");
    expect(nc.getCell(columna("RESPONSABLE EN ÁREA DE ORIGEN")).value).toBe("MARTIN PEREA");
    expect(nc.getCell(columna("ESTATUS")).value).toBe("Cerrado");
    expect(nc.getCell(columna("FECHA DE CIERRE")).value).toBeInstanceOf(Date);

    const ap = ws.getRow(3);
    expect(ap.getCell(columna("RESULTADO")).value).toBe("Aprobado");
    expect(ap.getCell(columna("MOTIVO")).value).toBeNull();
    expect(ap.getCell(columna("ESTATUS")).value).toBeNull();
  });
});
