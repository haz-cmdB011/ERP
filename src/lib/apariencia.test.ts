import { describe, expect, it } from "vitest";
import {
  APARIENCIA_INICIAL,
  ESTILO_INICIAL,
  esEstilo,
  MARCA_CLASICA_INICIAL,
  normalizarMarcaClasica,
  SCRIPT_APARIENCIA,
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

describe("estilo", () => {
  it("el predefinido es el clásico y solo acepta los dos estilos", () => {
    expect(ESTILO_INICIAL).toBe("clasico");
    expect(esEstilo("vidrio")).toBe(true);
    expect(esEstilo("clasico")).toBe(true);
    expect(esEstilo("otro")).toBe(false);
    expect(esEstilo(null)).toBe(false);
  });
});

describe("acento del estilo clásico", () => {
  it("valida el color y cae al verde original si no sirve", () => {
    expect(normalizarMarcaClasica("#38BDF8")).toBe("#38bdf8");
    expect(normalizarMarcaClasica("red")).toBe(MARCA_CLASICA_INICIAL);
    expect(normalizarMarcaClasica(null)).toBe(MARCA_CLASICA_INICIAL);
  });

  it("el script de <head> es JavaScript válido", () => {
    expect(() => new Function(SCRIPT_APARIENCIA)).not.toThrow();
  });
});
