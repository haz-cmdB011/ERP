import { describe, expect, it } from "vitest";
import {
  APARIENCIA_INICIAL,
  LIMITES,
  normalizarApariencia,
  textoSobreMarca,
  variablesApariencia,
} from "./apariencia";

describe("normalizarApariencia", () => {
  it("sin datos devuelve la apariencia inicial", () => {
    expect(normalizarApariencia(null)).toEqual(APARIENCIA_INICIAL);
    expect(normalizarApariencia("basura")).toEqual(APARIENCIA_INICIAL);
  });

  it("descarta colores inválidos y acota los números", () => {
    const a = normalizarApariencia({
      marca: "#ABCDEF",
      fondo1: "red",
      fondo2: "#12345",
      fondo3: "url(x)",
      opacidad: 500,
      desenfoque: -3,
    });
    expect(a.marca).toBe("#abcdef");
    expect(a.fondo1).toBe(APARIENCIA_INICIAL.fondo1);
    expect(a.fondo2).toBe(APARIENCIA_INICIAL.fondo2);
    expect(a.fondo3).toBe(APARIENCIA_INICIAL.fondo3);
    expect(a.opacidad).toBe(LIMITES.opacidad.max);
    expect(a.desenfoque).toBe(LIMITES.desenfoque.min);
  });
});

describe("textoSobreMarca", () => {
  it("usa texto oscuro sobre colores claros y blanco sobre oscuros", () => {
    expect(textoSobreMarca("#7cfc00")).toBe("oscuro");
    expect(textoSobreMarca("#ffffff")).toBe("oscuro");
    expect(textoSobreMarca("#1e3a8a")).toBe("claro");
    expect(textoSobreMarca("#000000")).toBe("claro");
  });
});

describe("variablesApariencia", () => {
  it("traduce la apariencia a variables CSS con unidades", () => {
    const v = variablesApariencia({ ...APARIENCIA_INICIAL, opacidad: 50, desenfoque: 12 });
    expect(v["--marca"]).toBe(APARIENCIA_INICIAL.marca);
    expect(v["--vidrio-opacidad"]).toBe("50%");
    expect(v["--vidrio-desenfoque"]).toBe("12px");
  });
});
