import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { diagnosticarEncabezados } from "./formato";
import { parsePlaneacionExcel } from "./parser";

// Encabezados de la hoja PEDIDOS de la plantilla PM_v5.xlsm, en su orden (fila 9).
const PM_V5 = [
  "ITEM", "COMPONENTE", "TIPO", "ETAPA", "NIVEL", "DEPARTAMENTO", "ELEVACION/UBICACIÓN",
  "MODELO", "DESCRIPCIÓN", "CANTIDAD X MUEBLE", "UNIDAD", "CANTIDAD TOTAL", "ACABADOS",
  "IMAGEN", "OBSERVACIONES", "PARA ENVIO A OBRA", "LISTA DE INSUMOS", "LIBERACIÓN DE PLANOS",
  "INGENIERIA", "SUMINISTRO DE MATS", "HAB MADERA", "HAB METAL", "ENSAMBLE MADERA",
  "ENSAMBLE METAL", "ACABADO MADERA", "ACABADO METAL", "CRISTAL", "ACRILICO", "TAPIZ",
  "PIEDRA", "ELECTRIFICACIÓN", "MONTAJE", "EMPAQUE", "PT",
];

// Columnas de la plantilla que el sistema no lee todavía (no bloquean la carga):
// las fases de taller (por ahora ninguna se lee) y las que no tienen papel en el sistema.
// (En el orden de la plantilla.)
const NO_LEIDAS = [
  "PARA ENVIO A OBRA",
  "LIBERACIÓN DE PLANOS",
  "HAB MADERA",
  "HAB METAL",
  "ENSAMBLE MADERA",
  "ENSAMBLE METAL",
  "ACABADO MADERA",
  "ACABADO METAL",
  "CRISTAL",
  "ACRILICO",
  "TAPIZ",
  "PIEDRA",
  "ELECTRIFICACIÓN",
  "MONTAJE",
  "EMPAQUE",
  "PT",
];

async function libroConEncabezados(headers: string[], fila: Record<string, unknown>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PEDIDOS");
  ws.getCell("G2").value = "No. PEDIDO";
  ws.getCell("H2").value = "126-26";
  ws.getCell("G4").value = "PROYECTO:";
  ws.getCell("H4").value = "ANN TAYLOR";
  ws.getCell("G5").value = "CLIENTE:";
  ws.getCell("H5").value = "LIVERPOOL";
  ws.getRow(9).values = headers;
  ws.getRow(10).values = headers.map((h) => (fila[h] ?? null) as ExcelJS.CellValue);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("plantilla PM_v5", () => {
  it("sus encabezados no dejan faltantes; solo quedan sin leer las columnas listadas", () => {
    const diag = diagnosticarEncabezados(PM_V5.map((texto, i) => ({ columna: i + 1, texto })));
    expect(diag.faltantes).toEqual([]);
    expect(diag.desconocidas.map((c) => c.texto)).toEqual(NO_LEIDAS);
  });

  it("el parser lee ELEVACION/UBICACIÓN y no lee las fases de taller", async () => {
    const buf = await libroConEncabezados(PM_V5, {
      ITEM: 1,
      COMPONENTE: "MO",
      TIPO: "MADERA",
      MODELO: "MESA",
      DESCRIPCIÓN: "MUEBLE",
      "CANTIDAD X MUEBLE": 1,
      UNIDAD: "PZA",
      "CANTIDAD TOTAL": 2,
      "ELEVACION/UBICACIÓN": "PLANTA BAJA",
      "HAB MADERA": 1,
      "ENSAMBLE METAL": "X",
      PT: "SI",
    });
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const [item] = resultado.items;
    expect(item.elevacion).toBe("PLANTA BAJA");
    // Las columnas de fases llenas en el archivo no se guardan.
    expect(item.fases_taller).toEqual({});
  });
});
