import { describe, expect, it } from "vitest";
import { RUTAS_ESCANER } from "./escaner-rutas";

describe("RUTAS_ESCANER", () => {
  it("Producción abre el mueble en su pantalla de entrega y busca folios PRD en Producción", () => {
    expect(RUTAS_ESCANER.produccion.item("abc-123")).toBe("/produccion/escanear/abc-123");
    expect(RUTAS_ESCANER.produccion.folio("PRD-000123")).toBe("/produccion?q=PRD-000123");
    expect(RUTAS_ESCANER.produccion.placeholderFolio).toContain("PRD-");
  });

  it("Calidad abre el mueble en su pantalla de evaluación y busca folios CAL en Calidad", () => {
    expect(RUTAS_ESCANER.calidad.item("abc-123")).toBe("/calidad/escanear/abc-123");
    expect(RUTAS_ESCANER.calidad.folio("CAL-000123")).toBe("/calidad/folios?q=CAL-000123");
    expect(RUTAS_ESCANER.calidad.placeholderFolio).toContain("CAL-");
  });

  it("codifica los folios para que no rompan la dirección", () => {
    expect(RUTAS_ESCANER.produccion.folio("a b&c")).toBe("/produccion?q=a%20b%26c");
  });
});
