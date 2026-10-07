import { describe, expect, it } from "vitest";
import { estaOculta, pendientesDeCuenta, valorOculto } from "./pendientes";

describe("pendientesDeCuenta", () => {
  it("una cuenta completa no tiene pendientes", () => {
    expect(pendientesDeCuenta({ nombre: "Ana Pérez", tieneFoto: true, mfaActivo: true })).toEqual([]);
  });

  it("detecta lo que falta, en orden", () => {
    expect(pendientesDeCuenta({ nombre: null, tieneFoto: false, mfaActivo: false })).toEqual([
      "nombre",
      "foto",
      "mfa",
    ]);
    expect(pendientesDeCuenta({ nombre: "Ana", tieneFoto: false, mfaActivo: true })).toEqual(["foto"]);
  });

  it("un nombre en blanco cuenta como faltante", () => {
    expect(pendientesDeCuenta({ nombre: "   ", tieneFoto: true, mfaActivo: true })).toEqual(["nombre"]);
    expect(pendientesDeCuenta({ nombre: undefined, tieneFoto: true, mfaActivo: true })).toEqual(["nombre"]);
  });
});

describe("estaOculta", () => {
  it("sin pendientes no hay nada que mostrar", () => {
    expect(estaOculta([], undefined)).toBe(true);
  });

  it("sin cookie se muestra", () => {
    expect(estaOculta(["foto", "mfa"], undefined)).toBe(false);
    expect(estaOculta(["foto"], "")).toBe(false);
  });

  it("se queda oculta mientras no aparezca algo nuevo", () => {
    const cookie = valorOculto(["nombre", "foto", "mfa"]);
    expect(cookie).toBe("nombre-foto-mfa");
    expect(estaOculta(["nombre", "foto", "mfa"], cookie)).toBe(true);
    // Completó el nombre: lo que queda ya estaba oculto.
    expect(estaOculta(["foto", "mfa"], cookie)).toBe(true);
  });

  it("vuelve a mostrarse si aparece un pendiente que no se había ocultado", () => {
    expect(estaOculta(["foto", "mfa"], valorOculto(["mfa"]))).toBe(false);
  });
});
