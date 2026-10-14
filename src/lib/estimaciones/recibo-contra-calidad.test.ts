import { describe, expect, it } from "vitest";
import {
  resumirContraCalidad,
  sinAprobarPorCalidad,
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
    ...parcial,
  };
}

describe("sinAprobarPorCalidad", () => {
  it("lo cobrado por encima de lo aprobado, sin bajar de cero", () => {
    expect(sinAprobarPorCalidad({ acumulado: 50, aprobado: 0 })).toBe(50);
    expect(sinAprobarPorCalidad({ acumulado: 3, aprobado: 5 })).toBe(0);
    expect(sinAprobarPorCalidad({ acumulado: 5, aprobado: 5 })).toBe(0);
  });

  it("sin dato de Calidad no hay nada que marcar", () => {
    expect(sinAprobarPorCalidad({ acumulado: 50, aprobado: null })).toBe(0);
  });
});

describe("resumirContraCalidad", () => {
  it("separa lo que no concuerda, lo que cuadra y lo que no se pudo comparar", () => {
    const r = resumirContraCalidad([
      linea({ renglonId: "a", acumulado: 50, aprobado: 0 }),
      linea({ renglonId: "b", acumulado: 1, aprobado: 1 }),
      linea({ renglonId: "c", acumulado: 2, aprobado: null }),
    ]);
    expect(r.conDiferencia.map((l) => l.renglonId)).toEqual(["a"]);
    expect(r.cuadran).toBe(1);
    expect(r.sinDato).toBe(1);
  });

  it("sin renglones, todo en cero", () => {
    expect(resumirContraCalidad([])).toEqual({ conDiferencia: [], cuadran: 0, sinDato: 0 });
  });
});
