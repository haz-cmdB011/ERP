import { describe, expect, it } from "vitest";
import { leerOrigen, nombreAreaOrigen, validarRevisionFinal } from "./revision-final";

describe("validarRevisionFinal", () => {
  it("acepta aprobar lo que está listo", () => {
    expect(validarRevisionFinal(6, 0, 6, "", null)).toBeNull();
  });
  it("no deja revisar más de lo listo ni nada", () => {
    expect(validarRevisionFinal(5, 2, 6, "rayón", "p", "area:otra")).toContain("solo tiene 6");
    expect(validarRevisionFinal(0, 0, 6, "", null)).toContain("Indica cuántas");
    expect(validarRevisionFinal(-1, 2, 6, "x", "p", "area:otra")).toContain("negativas");
  });
  it("lo rechazado necesita motivo, el paso al que regresa y dónde nació la falla", () => {
    expect(validarRevisionFinal(4, 2, 6, " ", "p", "area:otra")).toContain("motivo");
    expect(validarRevisionFinal(4, 2, 6, "rayón en cubierta", null, "area:otra")).toContain("paso");
    expect(validarRevisionFinal(4, 2, 6, "rayón en cubierta", "p")).toContain("dónde nació");
    expect(validarRevisionFinal(4, 2, 6, "rayón en cubierta", "p", "paso:p")).toBeNull();
    expect(validarRevisionFinal(4, 2, 6, "plano con medida mal", "p", "area:ingenieria")).toBeNull();
  });
});

describe("leerOrigen", () => {
  it("separa un paso de la ruta de un área", () => {
    expect(leerOrigen("paso:abc")).toEqual({ pasoId: "abc", area: null });
    expect(leerOrigen("area:ingenieria")).toEqual({ pasoId: null, area: "ingenieria" });
  });
  it("rechaza lo vacío o un área que no existe", () => {
    expect(leerOrigen("")).toBeNull();
    expect(leerOrigen("paso:")).toBeNull();
    expect(leerOrigen("area:ventas")).toBeNull();
  });
  it("nombra el área", () => {
    expect(nombreAreaOrigen("compras")).toBe("Compras o proveedor");
    expect(nombreAreaOrigen(null)).toBeNull();
  });
});
