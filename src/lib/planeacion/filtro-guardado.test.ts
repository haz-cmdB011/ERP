import { describe, expect, it } from "vitest";
import {
  etiquetaFiltroGuardado,
  leerFiltroGuardado,
  mismoFiltro,
  valorFiltroGuardado,
} from "./filtro-guardado";

describe("valorFiltroGuardado / leerFiltroGuardado", () => {
  it("va y vuelve con año y cliente", () => {
    const valor = valorFiltroGuardado({ anio: "2026", cliente: "ACME SA" });
    expect(leerFiltroGuardado(valor)).toEqual({ anio: "2026", cliente: "ACME SA" });
  });

  it("conserva caracteres especiales del cliente", () => {
    const valor = valorFiltroGuardado({ cliente: "A&B + CÍA" });
    expect(leerFiltroGuardado(valor)).toEqual({ cliente: "A&B + CÍA" });
  });

  it("entiende el valor aunque llegue con la codificación de cookie", () => {
    const valor = encodeURIComponent(valorFiltroGuardado({ anio: "2025", cliente: "ACME SA" }));
    expect(leerFiltroGuardado(valor)).toEqual({ anio: "2025", cliente: "ACME SA" });
  });

  it("sin cookie o con basura no hay filtro", () => {
    expect(leerFiltroGuardado(undefined)).toBeNull();
    expect(leerFiltroGuardado("")).toBeNull();
    expect(leerFiltroGuardado("cualquier cosa")).toBeNull();
    expect(leerFiltroGuardado("%E0%A4%A")).toBeNull();
  });

  it("descarta años inválidos y clientes demasiado largos", () => {
    expect(leerFiltroGuardado("anio=20x6")).toBeNull();
    expect(leerFiltroGuardado(`cliente=${"A".repeat(200)}`)).toBeNull();
    expect(leerFiltroGuardado("anio=abcd&cliente=ACME")).toEqual({ cliente: "ACME" });
  });

  it("normaliza el cliente como lo hace el filtro de la lista", () => {
    expect(leerFiltroGuardado("cliente=%20acme%20%20sa%20")).toEqual({ cliente: "ACME SA" });
  });
});

describe("etiquetaFiltroGuardado / mismoFiltro", () => {
  it("arma la etiqueta con lo que haya", () => {
    expect(etiquetaFiltroGuardado({ anio: "2026", cliente: "ACME" })).toBe("2026 · ACME");
    expect(etiquetaFiltroGuardado({ cliente: "ACME" })).toBe("ACME");
    expect(etiquetaFiltroGuardado({ anio: "2026" })).toBe("2026");
  });

  it("compara filtros", () => {
    expect(mismoFiltro({ anio: "2026" }, { anio: "2026" })).toBe(true);
    expect(mismoFiltro({ anio: "2026" }, { anio: "2026", cliente: "ACME" })).toBe(false);
    expect(mismoFiltro({}, {})).toBe(true);
  });
});
