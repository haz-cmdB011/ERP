import { describe, expect, it } from "vitest";
import { COLUMNAS_REQUERIDAS, diagnosticarEncabezados, letraColumna } from "./formato";

function encabezados(nombres: string[]) {
  return nombres.map((texto, i) => ({ columna: i + 1, texto }));
}

describe("letraColumna", () => {
  it("convierte números de columna a letras de Excel", () => {
    expect(letraColumna(1)).toBe("A");
    expect(letraColumna(26)).toBe("Z");
    expect(letraColumna(27)).toBe("AA");
    expect(letraColumna(28)).toBe("AB");
  });
});

describe("diagnosticarEncabezados", () => {
  it("no reporta faltantes cuando están todas las obligatorias con su nombre", () => {
    const diag = diagnosticarEncabezados(encabezados([...COLUMNAS_REQUERIDAS, "NOTAS"]));
    expect(diag.faltantes).toEqual([]);
    expect(diag.desconocidas.map((c) => c.texto)).toEqual(["NOTAS"]);
  });

  it("sugiere la columna mal escrita para una obligatoria faltante", () => {
    const nombres = COLUMNAS_REQUERIDAS.map((n) => (n === "CANTIDAD TOTAL" ? "CANT TOTAL" : n));
    const diag = diagnosticarEncabezados(encabezados(nombres));
    expect(diag.faltantes).toEqual([
      {
        nombre: "CANTIDAD TOTAL",
        sugerida: { columna: COLUMNAS_REQUERIDAS.indexOf("CANTIDAD TOTAL") + 1, texto: "CANT TOTAL" },
      },
    ]);
  });

  it("no sugiere una columna que no se parece a la faltante", () => {
    const nombres = COLUMNAS_REQUERIDAS.filter((n) => n !== "UNIDAD");
    const diag = diagnosticarEncabezados(encabezados([...nombres, "OBSERVACION GENERAL"]));
    expect(diag.faltantes).toEqual([{ nombre: "UNIDAD", sugerida: null }]);
  });

  it("un segundo TIPO cuenta como desconocida y no como columna extra", () => {
    const diag = diagnosticarEncabezados(encabezados([...COLUMNAS_REQUERIDAS, "TIPO"]));
    expect(diag.faltantes).toEqual([]);
    expect(diag.desconocidas.map((c) => c.texto)).toEqual(["TIPO"]);
  });
});
