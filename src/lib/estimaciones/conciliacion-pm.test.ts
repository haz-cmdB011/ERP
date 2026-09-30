import { describe, expect, it } from "vitest";
import { conciliarRenglones, requiereMotivo, type SaldoModeloPm } from "./conciliacion-pm";

const saldo = (cantidadPm: number, cantidadRegistrada = 0): SaldoModeloPm => ({
  cantidadPm,
  cantidadRegistrada,
});

describe("conciliarRenglones", () => {
  it("capturar de menos está bien: entregas parciales", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: 4 }], new Map([["MS-01", saldo(10)]]));
    expect(r).toEqual([{ estado: "dentro", cantidadPm: 10, acumulada: 4 }]);
    expect(requiereMotivo(r[0])).toBe(false);
  });

  it("igualar el PM con lo ya registrado en otros recibos está bien", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: 6 }], new Map([["MS-01", saldo(10, 4)]]));
    expect(r[0]).toEqual({ estado: "dentro", cantidadPm: 10, acumulada: 10 });
  });

  it("pasarse del PM exige motivo, con lo que sobra", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: 8 }], new Map([["MS-01", saldo(10, 4)]]));
    expect(r[0]).toEqual({ estado: "excede", cantidadPm: 10, acumulada: 12, excedente: 2 });
    expect(requiereMotivo(r[0])).toBe(true);
  });

  it("como la base, solo exige motivo desde el renglón donde se pasa", () => {
    const r = conciliarRenglones(
      [
        { modelo: "ms-01", cantidad: 6 },
        { modelo: " MS-01 ", cantidad: 3 },
        { modelo: "MS-01", cantidad: 2 },
      ],
      new Map([["MS-01", saldo(10)]])
    );
    expect(r.map(requiereMotivo)).toEqual([false, false, true]);
    expect(r[2]).toMatchObject({ acumulada: 11, excedente: 1 });
  });

  it("un modelo que no está en el PM exige motivo", () => {
    const r = conciliarRenglones([{ modelo: "XX-9", cantidad: 1 }], new Map([["MS-01", saldo(10)]]));
    expect(r[0]).toEqual({ estado: "sin_modelo_en_pm" });
    expect(requiereMotivo(r[0])).toBe(true);
  });

  it("los reprocesos y los renglones sin modelo no se concilian ni gastan saldo", () => {
    const r = conciliarRenglones(
      [
        { modelo: "MS-01", cantidad: 50, cuentaParaPm: false },
        { modelo: "  ", cantidad: 9 },
        { modelo: "MS-01", cantidad: 10 },
      ],
      new Map([["MS-01", saldo(10)]])
    );
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
    expect(r[2]).toEqual({ estado: "dentro", cantidadPm: 10, acumulada: 10 });
  });

  it("una cantidad vacía cuenta como 0", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: "" }], new Map([["MS-01", saldo(0)]]));
    expect(r[0]).toEqual({ estado: "dentro", cantidadPm: 0, acumulada: 0 });
  });
});
