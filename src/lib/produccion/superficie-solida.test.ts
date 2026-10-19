import { describe, expect, it } from "vitest";
import { admiteSuperficieSolida, descripcionMencionaSuperficieSolida } from "./superficie-solida";

describe("descripcionMencionaSuperficieSolida", () => {
  it("detecta el material y sus marcas", () => {
    expect(descripcionMencionaSuperficieSolida("CUBIERTA EN SUPERFICIE SÓLIDA BLANCA")).toBe(true);
    expect(descripcionMencionaSuperficieSolida("Cubierta de Corian glacier white")).toBe(true);
    expect(descripcionMencionaSuperficieSolida("Lavabo HI-MACS")).toBe(true);
    expect(descripcionMencionaSuperficieSolida("solid surface top")).toBe(true);
  });
  it("descarta negaciones y lo que no lo menciona", () => {
    expect(descripcionMencionaSuperficieSolida("Mostrador sin superficie sólida")).toBe(false);
    expect(descripcionMencionaSuperficieSolida("NO INCLUYE CORIAN")).toBe(false);
    expect(descripcionMencionaSuperficieSolida("Cubierta de cuarzo")).toBe(false);
    expect(descripcionMencionaSuperficieSolida(null)).toBe(false);
  });
});

describe("admiteSuperficieSolida", () => {
  it("acepta al mueble que la lleva en un componente", () => {
    expect(admiteSuperficieSolida("MOSTRADOR RECEPCIÓN", ["CUERPO EN MDF", "CUBIERTA CORIAN"])).toBe(true);
    expect(admiteSuperficieSolida("BURÓ", ["CUERPO EN MDF"])).toBe(false);
  });
});
