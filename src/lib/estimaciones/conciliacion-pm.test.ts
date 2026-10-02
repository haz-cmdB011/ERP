import { describe, expect, it } from "vitest";
import {
  claveDescripcion,
  claveModelo,
  claveOt,
  claveSaldo,
  claveVariante,
  conciliarRenglones,
  requiereMotivo,
  saldosDeVariantes,
  type SaldoModeloPm,
} from "./conciliacion-pm";

const saldo = (cantidadPm: number, cantidadRegistrada = 0): SaldoModeloPm => ({
  cantidadPm,
  cantidadRegistrada,
});

describe("conciliarRenglones", () => {
  it("capturar de menos está bien: entregas parciales", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: 4 }], new Map([[claveModelo("MS-01"), saldo(10)]]));
    expect(r).toEqual([{ estado: "dentro", cantidadPm: 10, acumulada: 4 }]);
    expect(requiereMotivo(r[0])).toBe(false);
  });

  it("igualar el PM con lo ya registrado en otros recibos está bien", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: 6 }], new Map([[claveModelo("MS-01"), saldo(10, 4)]]));
    expect(r[0]).toEqual({ estado: "dentro", cantidadPm: 10, acumulada: 10 });
  });

  it("pasarse del PM exige motivo, con lo que sobra", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: 8 }], new Map([[claveModelo("MS-01"), saldo(10, 4)]]));
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
      new Map([[claveModelo("MS-01"), saldo(10)]])
    );
    expect(r.map(requiereMotivo)).toEqual([false, false, true]);
    expect(r[2]).toMatchObject({ acumulada: 11, excedente: 1 });
  });

  it("un modelo que no está en el PM exige motivo", () => {
    const r = conciliarRenglones([{ modelo: "XX-9", cantidad: 1 }], new Map([[claveModelo("MS-01"), saldo(10)]]));
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
      new Map([[claveModelo("MS-01"), saldo(10)]])
    );
    expect(r[0]).toBeNull();
    expect(r[1]).toBeNull();
    expect(r[2]).toEqual({ estado: "dentro", cantidadPm: 10, acumulada: 10 });
  });

  it("una cantidad vacía cuenta como 0", () => {
    const r = conciliarRenglones([{ modelo: "MS-01", cantidad: "" }], new Map([[claveModelo("MS-01"), saldo(0)]]));
    expect(r[0]).toEqual({ estado: "dentro", cantidadPm: 0, acumulada: 0 });
  });
});

describe("claveModelo", () => {
  it("ignora mayúsculas, acentos, espacios, guiones, puntos y otros signos", () => {
    for (const m of ["MS-01", "ms 01", " Ms.01 ", "MS_01", "ms/01"]) {
      expect(claveModelo(m)).toBe("MS01");
    }
    expect(claveModelo("Lámpara-Ñandú")).toBe("LAMPARAÑANDU");
    expect(claveModelo(null)).toBe("");
    expect(claveModelo(" - ")).toBe("");
  });

  it("no junta modelos que solo se parecen", () => {
    expect(claveModelo("MS-1")).not.toBe(claveModelo("MS-01"));
    expect(claveModelo("MS-01A")).not.toBe(claveModelo("MS-01"));
  });

  it("la conciliación reconoce el modelo escrito distinto", () => {
    const r = conciliarRenglones(
      [
        { modelo: "ms 01", cantidad: 6 },
        { modelo: "MS.01", cantidad: 5 },
      ],
      new Map([[claveModelo("MS-01"), saldo(10)]])
    );
    expect(r[0]).toEqual({ estado: "dentro", cantidadPm: 10, acumulada: 6 });
    expect(r[1]).toMatchObject({ estado: "excede", acumulada: 11 });
  });
});

describe("variantes de modelo (código + descripción)", () => {
  // 102-24: "MUEBLE" son muebles distintos; "TIRAS DE ROSA MORADO" tiene dos
  // descripciones (94 + 25 = 119 por código).
  const saldos = saldosDeVariantes([
    { modelo: "MUEBLE", descripcionPm: "CAMA KING", cantidadPm: 2, cantidadRegistrada: 0 },
    { modelo: "MUEBLE", descripcionPm: "MACETA METALICA BAÑO", cantidadPm: 4, cantidadRegistrada: 1 },
    { modelo: "TIRAS DE ROSA MORADO", descripcionPm: "DUELA MADERA MACIZA", cantidadPm: 94, cantidadRegistrada: 0 },
    { modelo: "TIRAS DE ROSA MORADO", descripcionPm: "a) 6 pzas 9\" de ancho", cantidadPm: 25, cantidadRegistrada: 0 },
    { modelo: "VRG-01", descripcionPm: "NICHO VIRGEN\nINCLUYE LAMPARA LED", cantidadPm: 2, cantidadRegistrada: 0 },
  ]);

  it("la descripción se compara sin mayúsculas, acentos, signos ni espacios", () => {
    expect(claveDescripcion("Zoclo en lámina de acero al carbón")).toBe(
      claveDescripcion("ZOCLO EN LAMINA DE ACERO AL CARBON")
    );
    expect(claveDescripcion("cama king")).not.toBe(claveDescripcion("cama queen"));
    expect(claveVariante("ms-01", "Espejo  900 x 600")).toBe(claveVariante("MS 01", "espejo 900x600"));
  });

  it("cada variante tiene su saldo y el código suma todas", () => {
    expect(saldos.get(claveVariante("MUEBLE", "cama king"))).toEqual({ cantidadPm: 2, cantidadRegistrada: 0 });
    expect(saldos.get(claveModelo("TIRAS DE ROSA MORADO"))).toEqual({ cantidadPm: 119, cantidadRegistrada: 0 });
  });

  it("no mezcla variantes: pasarse en una pide motivo aunque el código tenga saldo", () => {
    const r = conciliarRenglones(
      [
        { modelo: "MUEBLE", descripcionPm: "Cama King", cantidad: 3 },
        { modelo: "MUEBLE", descripcionPm: "maceta metálica baño", cantidad: 3 },
      ],
      saldos
    );
    expect(r[0]).toEqual({ estado: "excede", cantidadPm: 2, acumulada: 3, excedente: 1 });
    expect(r[1]).toEqual({ estado: "dentro", cantidadPm: 4, acumulada: 4 });
  });

  it("sin variante (escrito a mano) se compara por código, contando todo lo del código", () => {
    const r = conciliarRenglones(
      [
        { modelo: "TIRAS DE ROSA MORADO", descripcionPm: "duela madera maciza", cantidad: 90 },
        { modelo: "tiras de rosa morado", cantidad: 30 },
      ],
      saldos
    );
    expect(r[0]).toEqual({ estado: "dentro", cantidadPm: 94, acumulada: 90 });
    expect(r[1]).toEqual({ estado: "excede", cantidadPm: 119, acumulada: 120, excedente: 1 });
  });

  it("si el código tiene una sola variante, un renglón sin descripción va a esa", () => {
    const r = { modelo: "vrg 01", descripcionPm: null };
    expect(claveSaldo(r, saldos)).toBe(claveVariante("VRG-01", "NICHO VIRGEN\nINCLUYE LAMPARA LED"));
  });

  it("una descripción que ya no está en la OT cae al código", () => {
    const r = { modelo: "MUEBLE", descripcionPm: "CAMA MATRIMONIAL" };
    expect(claveSaldo(r, saldos)).toBe(claveModelo("MUEBLE"));
  });
});

describe("claveOt", () => {
  it.each([
    ["193-24", "193-24"],
    ["2PM193-24", "193-24"],
    ["SDC-1 2PM009-26", "009-26"],
    ["PM193-24 SOTANO 1", "193-24"],
    ["2PM102-24 PEDIDO (2)", "102-24"],
    ["OT 193-24", "193-24"],
    ["193-24-2 SDC17 PH MONTERREY", "193-24"],
    [" sin numero ", "SIN NUMERO"],
  ])("%s → %s", (texto, esperado) => {
    expect(claveOt(texto)).toBe(esperado);
  });

  it("vacío no es una OT", () => {
    expect(claveOt("  ")).toBeNull();
    expect(claveOt(null)).toBeNull();
  });
});
