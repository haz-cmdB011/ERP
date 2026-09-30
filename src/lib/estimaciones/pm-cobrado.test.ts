import { describe, expect, it } from "vitest";
import {
  baseArea,
  estadoCelda,
  estadoCobro,
  porcentaje,
  resumirPorPm,
  tieneDiferencias,
  tienePendienteDeCobro,
  type FilaPmCobrado,
} from "./pm-cobrado";

function fila(parcial: Partial<FilaPmCobrado>): FilaPmCobrado {
  return {
    pedidoId: "p1",
    numeroPedido: "2PM009-26",
    ordenTrabajo: "009-26",
    proyecto: "Azotea",
    modelo: "MS-01",
    descripcion: null,
    cantidadPm: 10,
    cantidadPmIluminacion: 0,
    acabados: 0,
    armado: 0,
    electrificacion: 0,
    reprocesos: 0,
    discrepanciasPendientes: 0,
    ...parcial,
  };
}

describe("estadoCobro", () => {
  it("clasifica lo cobrado contra el PM", () => {
    expect(estadoCobro(0, 10)).toBe("sin_cobro");
    expect(estadoCobro(4, 10)).toBe("parcial");
    expect(estadoCobro(10, 10)).toBe("completo");
    expect(estadoCobro(11, 10)).toBe("excedido");
  });

  it("un modelo que no está en el PM solo cuenta si se cobró", () => {
    expect(estadoCobro(2, null)).toBe("fuera_del_pm");
    expect(estadoCobro(0, null)).toBe("no_aplica");
  });

  it("con base 0 no hay nada que cobrar, salvo que se haya cobrado", () => {
    expect(estadoCobro(0, 0)).toBe("no_aplica");
    expect(estadoCobro(1, 0)).toBe("excedido");
  });
});

describe("baseArea", () => {
  it("Electrificación se compara contra los muebles con iluminación", () => {
    const f = fila({ cantidadPm: 6, cantidadPmIluminacion: 4 });
    expect(baseArea(f, "acabados")).toBe(6);
    expect(baseArea(f, "electrificacion")).toBe(4);
  });

  it("un mueble sin iluminación no aplica en Electrificación; si se electrificó, es de más", () => {
    expect(estadoCelda(fila({}), "electrificacion")).toBe("no_aplica");
    expect(estadoCelda(fila({ electrificacion: 2 }), "electrificacion")).toBe("excedido");
  });
});

describe("filtros", () => {
  it("detecta diferencias y lo pendiente de cobro", () => {
    expect(tieneDiferencias(fila({ armado: 12 }))).toBe(true);
    expect(tieneDiferencias(fila({ cantidadPm: null, acabados: 1 }))).toBe(true);
    expect(tieneDiferencias(fila({ acabados: 10, armado: 10 }))).toBe(false);
    expect(tienePendienteDeCobro(fila({ acabados: 10, armado: 10 }))).toBe(false);
    expect(tienePendienteDeCobro(fila({ acabados: 10, armado: 3 }))).toBe(true);
  });
});

describe("resumirPorPm", () => {
  it("suma el avance sin contar lo excedido y cuenta modelos con diferencias", () => {
    const [r] = resumirPorPm([
      fila({ modelo: "MS-01", cantidadPm: 10, acabados: 6, armado: 12 }),
      fila({ modelo: "LAMP-1", cantidadPm: 6, cantidadPmIluminacion: 4, electrificacion: 3 }),
      fila({ modelo: "XX-9", cantidadPm: null, acabados: 1, discrepanciasPendientes: 1 }),
    ]);
    expect(r.modelos).toBe(2);
    expect(r.piezasPm).toBe(16);
    expect(r.avance.acabados).toEqual({ cobrado: 6, base: 16 });
    // 12 de armado en MS-01 cuentan solo 10 (el PM).
    expect(r.avance.armado).toEqual({ cobrado: 10, base: 16 });
    expect(r.avance.electrificacion).toEqual({ cobrado: 3, base: 4 });
    expect(r.excedidos).toBe(1);
    expect(r.fueraDelPm).toBe(1);
    expect(r.discrepanciasPendientes).toBe(1);
    expect(porcentaje(r.avance.electrificacion)).toBe(75);
    expect(porcentaje({ cobrado: 0, base: 0 })).toBeNull();
  });

  it("agrupa por PM conservando el orden", () => {
    const r = resumirPorPm([fila({ pedidoId: "b" }), fila({ pedidoId: "a" }), fila({ pedidoId: "b" })]);
    expect(r.map((x) => x.pedidoId)).toEqual(["b", "a"]);
  });
});
