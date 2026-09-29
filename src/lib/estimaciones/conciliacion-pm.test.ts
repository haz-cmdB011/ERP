import { describe, expect, it } from "vitest";
import { cantidadPorModelo, evaluarConciliacion } from "./conciliacion-pm";

describe("evaluarConciliacion", () => {
  it("si el modelo no está en el PM de la OT no se puede comparar", () => {
    expect(evaluarConciliacion(null, 0, 5)).toEqual({ estado: "sin_modelo_en_pm" });
  });

  it("cuadra cuando lo registrado más lo capturado iguala al PM", () => {
    expect(evaluarConciliacion(10, 4, 6)).toEqual({ estado: "cuadra", cantidadPm: 10, total: 10 });
  });

  it("no cuadra si se captura de menos", () => {
    expect(evaluarConciliacion(10, 0, 8)).toEqual({
      estado: "no_cuadra",
      cantidadPm: 10,
      total: 8,
      diferencia: -2,
    });
  });

  it("no cuadra si se captura de más", () => {
    expect(evaluarConciliacion(10, 4, 8)).toMatchObject({ estado: "no_cuadra", diferencia: 2 });
  });
});

describe("cantidadPorModelo", () => {
  it("suma renglones del mismo modelo sin importar mayúsculas ni espacios", () => {
    const mapa = cantidadPorModelo([
      { modelo: "dec-313", cantidad: 3 },
      { modelo: " DEC-313 ", cantidad: 2 },
      { modelo: "PIN-1", cantidad: "" },
      { modelo: "  ", cantidad: 9 },
    ]);
    expect(mapa.get("DEC-313")).toBe(5);
    expect(mapa.get("PIN-1")).toBe(0);
    expect(mapa.size).toBe(2);
  });
});
