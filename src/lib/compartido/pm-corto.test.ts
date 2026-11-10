import { describe, expect, it } from "vitest";
import { pmCorto } from "./pm-corto";

describe("pmCorto", () => {
  it("deja solo el PM y quita lo que sobra", () => {
    expect(pmCorto("PM009-26 ACTUALIZACION")).toBe("PM009-26");
    expect(pmCorto("PM193-24 SOTANO 1")).toBe("PM193-24");
    expect(pmCorto("PM115-26 ETAPA 3")).toBe("PM115-26");
    expect(pmCorto("PM013-26 SALON 2 INCIDENCIAS")).toBe("PM013-26");
    expect(pmCorto("PM107-26")).toBe("PM107-26");
  });

  it("conserva el número de PM dentro de la O.T.", () => {
    expect(pmCorto("2PM134-26")).toBe("2PM134-26");
    expect(pmCorto("12PM193-24 PEDIDO (2)")).toBe("12PM193-24");
  });

  it("si hay un SDC, deja solo el SDC", () => {
    expect(pmCorto("SDC-1 PM009-26")).toBe("SDC-1");
    expect(pmCorto("SDC-1 2PM134-26")).toBe("SDC-1");
    expect(pmCorto("SDC-02 PM027-26")).toBe("SDC-2");
    expect(pmCorto("sdc 2 PM009-26")).toBe("SDC-2");
    expect(pmCorto("PM193-24 SDC 2 3 Y 4")).toBe("SDC-2");
  });

  it("arregla espacios y mayúsculas", () => {
    expect(pmCorto("  pm 107-26  ")).toBe("PM107-26");
    expect(pmCorto("pm-107/26")).toBe("pm-107/26");
  });

  it("devuelve lo que no reconoce y vacío si no hay nada", () => {
    expect(pmCorto("PEDIDO ESPECIAL")).toBe("PEDIDO ESPECIAL");
    expect(pmCorto("")).toBe("");
    expect(pmCorto(null)).toBe("");
    expect(pmCorto(undefined)).toBe("");
  });

  it("no confunde palabras que solo contienen SDC o PM", () => {
    expect(pmCorto("ESDC-1")).toBe("ESDC-1");
    expect(pmCorto("EPM107-26")).toBe("EPM107-26");
  });
});
