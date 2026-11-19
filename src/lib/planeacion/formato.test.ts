import { describe, expect, it } from "vitest";
import { COLUMNAS_REQUERIDAS, COLUMNAS_TOLERADAS, diagnosticarEncabezados, letraColumna } from "./formato";

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
    const nombres = COLUMNAS_REQUERIDAS.map((n) => (n === "CANTIDAD TOTAL" ? "CANTIDAD FINAL" : n));
    const diag = diagnosticarEncabezados(encabezados(nombres));
    expect(diag.faltantes).toEqual([
      {
        nombre: "CANTIDAD TOTAL",
        sugerida: { columna: COLUMNAS_REQUERIDAS.indexOf("CANTIDAD TOTAL") + 1, texto: "CANTIDAD FINAL" },
      },
    ]);
  });

  it.each([
    ["CANT TOTAL", "CANTIDAD TOTAL"],
    ["CANT\nTOTAL", "CANTIDAD TOTAL"],
    ["TOTAL", "CANTIDAD TOTAL"],
    ["COMP", "COMPONENTE"],
    ["CANTIDAD POR MUEBLE", "CANTIDAD X MUEBLE"],
    ["CANT X MUEBLE", "CANTIDAD X MUEBLE"],
  ])("lee %j como %s (plantillas anteriores) y lo reporta como equivalente", (alias, canonico) => {
    const nombres = COLUMNAS_REQUERIDAS.map((n) => (n === canonico ? alias : n));
    const diag = diagnosticarEncabezados(encabezados(nombres));
    expect(diag.faltantes).toEqual([]);
    expect(diag.desconocidas).toEqual([]);
    const columna = COLUMNAS_REQUERIDAS.findIndex((n) => n === canonico) + 1;
    expect(diag.equivalentes).toEqual([{ columna, texto: alias, nombre: canonico }]);
  });

  it("si el nombre exacto también está, manda el exacto y el alias queda como columna desconocida", () => {
    const diag = diagnosticarEncabezados(encabezados([...COLUMNAS_REQUERIDAS, "TOTAL"]));
    expect(diag.faltantes).toEqual([]);
    expect(diag.equivalentes).toEqual([]);
    expect(diag.desconocidas.map((c) => c.texto)).toEqual(["TOTAL"]);
  });

  it("ELEVACION se sigue aceptando en silencio (sin aviso)", () => {
    const diag = diagnosticarEncabezados(encabezados([...COLUMNAS_REQUERIDAS, "ELEVACION"]));
    expect(diag.equivalentes).toEqual([]);
    expect(diag.desconocidas).toEqual([]);
  });

  it("COMPONENTE se tolera: sigue saliendo como faltante en el diagnóstico y el lector lo avisa en vez de rechazar", () => {
    expect(COLUMNAS_TOLERADAS).toEqual(["COMPONENTE"]);
    const diag = diagnosticarEncabezados(encabezados(COLUMNAS_REQUERIDAS.filter((n) => n !== "COMPONENTE")));
    expect(diag.faltantes.map((f) => f.nombre)).toEqual(["COMPONENTE"]);
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
