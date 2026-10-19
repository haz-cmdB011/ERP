import { describe, expect, it } from "vitest";
import { validarRevisionFinal } from "./revision-final";

describe("validarRevisionFinal", () => {
  it("acepta aprobar lo que está listo", () => {
    expect(validarRevisionFinal(6, 0, 6, "", null)).toBeNull();
  });
  it("no deja revisar más de lo listo ni nada", () => {
    expect(validarRevisionFinal(5, 2, 6, "rayón", "p")).toContain("solo tiene 6");
    expect(validarRevisionFinal(0, 0, 6, "", null)).toContain("Indica cuántas");
    expect(validarRevisionFinal(-1, 2, 6, "x", "p")).toContain("negativas");
  });
  it("lo rechazado necesita motivo y el paso al que regresa", () => {
    expect(validarRevisionFinal(4, 2, 6, " ", "p")).toContain("motivo");
    expect(validarRevisionFinal(4, 2, 6, "rayón en cubierta", null)).toContain("paso");
    expect(validarRevisionFinal(4, 2, 6, "rayón en cubierta", "p")).toBeNull();
  });
});
