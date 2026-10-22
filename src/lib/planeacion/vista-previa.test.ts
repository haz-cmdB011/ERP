import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { construirVistaPrevia } from "./vista-previa";

async function libro(armar: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  armar(wb.addWorksheet("PEDIDO"));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("construirVistaPrevia", () => {
  it("marca el encabezado, la columna no reconocida y la obligatoria mal escrita", async () => {
    const buf = await libro((ws) => {
      ws.getCell("L1").value = "No. PEDIDO";
      ws.getCell("N1").value = "107-26";
      ws.getRow(3).values = [
        "ITEM", "COMPONENTE", "TIPO", "MODELO", "DESCRIPCION", "CANTIDAD X MUEBLE", "UNIDAD",
        "CANT TOTAL", "NOTAS",
      ];
      ws.getRow(4).values = [1, "MO", "HIBRIDO", "SAL", "SOFA", 1, "PZA", 2, "revisar"];
    });

    const vista = await construirVistaPrevia(buf);
    expect(vista).not.toBeNull();
    if (!vista) return;
    expect(vista.hoja).toBe("PEDIDO");
    expect(vista.filaEncabezado).toBe(3);
    // "CANT TOTAL" no es un nombre reconocido, así que también sale en ámbar.
    expect(vista.desconocidas).toEqual([8, 9]);
    expect(vista.faltantes).toEqual([
      {
        nombre: "CANTIDAD TOTAL",
        sugerida: { columna: 8, texto: "CANT TOTAL" },
      },
    ]);
    const filaEncabezado = vista.filas.find((f) => f.numero === 3);
    expect(filaEncabezado?.celdas.slice(0, 3)).toEqual(["ITEM", "COMPONENTE", "TIPO"]);
    expect(vista.filas.find((f) => f.numero === 4)?.celdas[8]).toBe("revisar");
  });

  it("sin ninguna fila de encabezados, la vista lo indica y lista todas las obligatorias", async () => {
    const buf = await libro((ws) => {
      ws.getCell("A1").value = "Notas de la hoja";
      ws.getCell("A2").value = "sin tabla";
    });

    const vista = await construirVistaPrevia(buf);
    expect(vista?.filaEncabezado).toBeNull();
    expect(vista?.faltantes.map((f) => f.nombre)).toHaveLength(8);
    expect(vista?.faltantes.every((f) => f.sugerida === null)).toBe(true);
  });
});
