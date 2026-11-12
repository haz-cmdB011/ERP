import { describe, expect, it } from "vitest";
import { respuestaToqueDeshabilitado } from "./toque-deshabilitado";

describe("respuestaToqueDeshabilitado", () => {
  it("al botón de enviar con un campo obligatorio vacío le toca marcar el campo", () => {
    expect(respuestaToqueDeshabilitado({ esEnvio: true, formularioValido: false, motivo: null })).toBe("validar");
  });

  it("marcar el campo gana sobre el motivo del botón", () => {
    expect(respuestaToqueDeshabilitado({ esEnvio: true, formularioValido: false, motivo: "Falta el folio" })).toBe(
      "validar"
    );
  });

  it("si el formulario está completo, muestra el motivo del botón", () => {
    expect(
      respuestaToqueDeshabilitado({ esEnvio: true, formularioValido: true, motivo: "  Ya se entregó todo  " })
    ).toEqual({ aviso: "Ya se entregó todo" });
  });

  it("un botón suelto con motivo lo muestra", () => {
    expect(
      respuestaToqueDeshabilitado({
        esEnvio: false,
        formularioValido: null,
        motivo: "Producción todavía no lo asigna a un equipo.",
      })
    ).toEqual({ aviso: "Producción todavía no lo asigna a un equipo." });
  });

  it("sin motivo ni campos por llenar no dice nada (p. ej. mientras se guarda)", () => {
    expect(respuestaToqueDeshabilitado({ esEnvio: true, formularioValido: true, motivo: "" })).toBeNull();
    expect(respuestaToqueDeshabilitado({ esEnvio: false, formularioValido: null, motivo: undefined })).toBeNull();
  });
});
