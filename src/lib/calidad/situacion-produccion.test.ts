import { describe, expect, it } from "vitest";
import { situacionDe, situacionesPorMueble, textoSituacion } from "./situacion-produccion";

const asignacion = (extra: object = {}) => ({
  planeacion_item_id: "m1",
  equipo: "Equipo Ramírez",
  cantidad: "2",
  entregado: "0",
  por_verificar: "0",
  ...extra,
});

describe("situacionDe", () => {
  it("sin asignaciones vigentes el mueble está sin asignar", () => {
    expect(situacionDe([])).toEqual({ tipo: "sin_asignar" });
  });

  it("con equipos y nada por preaprobar sigue en el taller (suma lo de todos los equipos)", () => {
    expect(
      situacionDe([
        asignacion(),
        asignacion({ equipo: "Planta", cantidad: "3", entregado: "1" }),
        asignacion({ cantidad: "1" }),
      ])
    ).toEqual({ tipo: "en_taller", equipos: ["Equipo Ramírez", "Planta"], asignadas: 6, entregadas: 1 });
  });

  it("lo entregado sin preaprobar manda: Calidad sabe que espera a Producción", () => {
    expect(situacionDe([asignacion({ entregado: "2", por_verificar: "1.5" }), asignacion({ por_verificar: "0.5" })])).toEqual({
      tipo: "por_preaprobar",
      piezas: 2,
    });
  });
});

describe("situacionesPorMueble", () => {
  it("agrupa por mueble y deja sin asignar a los que no tienen asignaciones", () => {
    const s = situacionesPorMueble(
      ["m1", "m2"],
      [asignacion(), asignacion({ planeacion_item_id: "otro" }), asignacion({ planeacion_item_id: null })]
    );
    expect(s.get("m1")).toMatchObject({ tipo: "en_taller", asignadas: 2 });
    expect(s.get("m2")).toEqual({ tipo: "sin_asignar" });
    expect(s.has("otro")).toBe(false);
  });
});

describe("textoSituacion", () => {
  it("dice qué falta y de quién depende", () => {
    expect(textoSituacion({ tipo: "sin_asignar" }, "pz")).toEqual({
      corto: "Sin asignar",
      detalle: "Producción todavía no lo asigna a un equipo.",
    });
    expect(
      textoSituacion({ tipo: "en_taller", equipos: ["Equipo Ramírez"], asignadas: 2, entregadas: 0 }, null).detalle
    ).toBe("Está con Equipo Ramírez: 0 de 2 pz entregadas. Se evalúa cuando Producción registre la entrega.");
    expect(textoSituacion({ tipo: "por_preaprobar", piezas: 3 }, "jgo").detalle).toBe(
      "Hay 3 jgo entregadas que esperan la preaprobación de Producción."
    );
  });

  it("en un componente habla de su mueble", () => {
    expect(textoSituacion({ tipo: "sin_asignar" }, "pz", true).detalle).toBe(
      "Producción todavía no asigna su mueble a un equipo."
    );
    expect(textoSituacion({ tipo: "por_preaprobar", piezas: 1 }, "pz", true).detalle).toMatch(/^Su mueble tiene 1 pz/);
  });
});
