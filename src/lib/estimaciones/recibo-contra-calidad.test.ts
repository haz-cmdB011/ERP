import { describe, expect, it } from "vitest";
import {
  resumirContraCalidad,
  sinLiberar,
  type RenglonContraCalidad,
} from "./recibo-contra-calidad";

function linea(parcial: Partial<RenglonContraCalidad>): RenglonContraCalidad {
  return {
    renglonId: "r1",
    numero: 1,
    modelo: "M-CHK",
    descripcion: "MINICHECK CASILLERO",
    esComponente: false,
    cantidad: 1,
    acumulado: 1,
    aprobado: 1,
    verificado: 1,
    liberado: 1,
    ...parcial,
  };
}

describe("sinLiberar", () => {
  it("lo cobrado por encima de lo liberado, sin bajar de cero", () => {
    expect(sinLiberar({ acumulado: 50, liberado: 0 })).toBe(50);
    expect(sinLiberar({ acumulado: 3, liberado: 5 })).toBe(0);
    expect(sinLiberar({ acumulado: 5, liberado: 5 })).toBe(0);
  });

  it("sin dato no hay nada que marcar", () => {
    expect(sinLiberar({ acumulado: 50, liberado: null })).toBe(0);
  });
});

describe("resumirContraCalidad", () => {
  it("separa lo que no concuerda, lo que cuadra y lo que no se pudo comparar", () => {
    const r = resumirContraCalidad([
      linea({ renglonId: "a", acumulado: 50, liberado: 0 }),
      linea({ renglonId: "b", acumulado: 1, liberado: 1 }),
      linea({ renglonId: "c", acumulado: 2, liberado: null }),
    ]);
    expect(r.conDiferencia.map((l) => l.renglonId)).toEqual(["a"]);
    expect(r.cuadran).toBe(1);
    expect(r.sinDato).toBe(1);
  });

  it("manda lo liberado, no lo que aprobó Calidad", () => {
    // Cobro según Producción: Producción verificó 3, Calidad no aprobó nada.
    const r = resumirContraCalidad([linea({ acumulado: 3, aprobado: 0, verificado: 3, liberado: 3 })]);
    expect(r.conDiferencia).toEqual([]);
    expect(r.cuadran).toBe(1);
  });

  it("sin renglones, todo en cero", () => {
    expect(resumirContraCalidad([])).toEqual({ conDiferencia: [], cuadran: 0, sinDato: 0 });
  });
});
