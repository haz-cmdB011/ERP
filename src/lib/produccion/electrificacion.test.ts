import { describe, expect, it } from "vitest";
import { admiteElectrificacion, descripcionIncluyeIluminacion } from "./electrificacion";

describe("descripcionIncluyeIluminacion", () => {
  it("detecta iluminación y sus variantes", () => {
    expect(descripcionIncluyeIluminacion("Buró con ILUMINACIÓN LED")).toBe(true);
    expect(descripcionIncluyeIluminacion("Espejo con lámpara integrada")).toBe(true);
    expect(descripcionIncluyeIluminacion("Cabecera con spots")).toBe(true);
  });
  it("descarta las negaciones y lo que no menciona luz", () => {
    expect(descripcionIncluyeIluminacion("Cama king NO INCLUYE ILUMINACIÓN")).toBe(false);
    expect(descripcionIncluyeIluminacion("Buró sin led")).toBe(false);
    expect(descripcionIncluyeIluminacion("Zoclo en lámina")).toBe(false);
    expect(descripcionIncluyeIluminacion(null)).toBe(false);
  });
});

describe("admiteElectrificacion", () => {
  it("acepta al mueble que la lleva en un componente (charola de electrificación)", () => {
    expect(
      admiteElectrificacion("MUEBLE DE CONTROL MUROS (IZQUIERDO)", [
        "CAPELO FRENTE Y ENTREPAÑO EN CRISTAL",
        "MARCO METALICO Y CHAROLA ELECTRIFICACIÓN",
      ])
    ).toBe(true);
  });
  it("acepta iluminación en el propio mueble y rechaza lo que no la lleva", () => {
    expect(admiteElectrificacion("Buró con iluminación LED")).toBe(true);
    expect(admiteElectrificacion("PORTA COLCHONETAS", ["CUERPO EN MDF"])).toBe(false);
    expect(admiteElectrificacion("Mueble", ["sin electrificación"])).toBe(false);
  });
});
