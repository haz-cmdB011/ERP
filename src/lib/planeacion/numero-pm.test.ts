import { describe, expect, it } from "vitest";
import { normalizarNumeroPM } from "./numero-pm";

describe("normalizarNumeroPM", () => {
  it.each([
    ["PM 107-26", "PM107-26"],
    ["PM107-26", "PM107-26"],
    ["pm-107-26", "PM107-26"],
    ["PM 107 - 26", "PM107-26"],
    ["107-26", "PM107-26"],
    ["009-26-2", "PM009-26"],
    ["PM 9-26", "PM009-26"],
    ["PM 107/2026", "PM107-26"],
    ["PM 1234-26", "PM1234-26"],
  ])("normaliza %s → %s", (entrada, esperado) => {
    expect(normalizarNumeroPM(entrada)).toBe(esperado);
  });

  it("toma el año del nombre del archivo si la celda no lo trae", () => {
    expect(
      normalizarNumeroPM("PM 107", { nombreArchivo: "PM 107-26 SMART FIT PLAZA PALMIRA.xlsx" })
    ).toBe("PM107-26");
  });

  it("ignora el nombre del archivo si es de otro PM", () => {
    expect(
      normalizarNumeroPM("PM 108", {
        nombreArchivo: "PM 107-26 SMART FIT.xlsx",
        fechaPedido: "2025-03-01",
      })
    ).toBe("PM108-25");
  });

  it("usa el año de la fecha del pedido como respaldo", () => {
    expect(normalizarNumeroPM("PM-999", { fechaPedido: "2026-02-06" })).toBe("PM999-26");
  });

  it("usa el año actual si no hay otra fuente", () => {
    expect(normalizarNumeroPM("PM-999", { hoy: new Date(2027, 0, 1) })).toBe("PM999-27");
  });

  it("deja el valor intacto si no trae ningún número", () => {
    expect(normalizarNumeroPM("SIN NUMERO")).toBe("SIN NUMERO");
  });
});
