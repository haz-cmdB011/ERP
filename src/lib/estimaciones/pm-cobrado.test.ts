import { describe, expect, it } from "vitest";
import {
  aprobadoArea,
  baseArea,
  cobradoSobreCalidad,
  estadoCelda,
  estadoCobro,
  listoParaCobrar,
  porcentaje,
  resumirPorOt,
  tieneDiferencias,
  tieneDiferenciasOCalidad,
  tieneListoParaCobrar,
  tienePendienteDeCobro,
  tieneSobreCalidad,
  type FilaPmCobrado,
} from "./pm-cobrado";

function fila(parcial: Partial<FilaPmCobrado>): FilaPmCobrado {
  return {
    ot: "009-26",
    proyecto: "Azotea",
    numPms: 2,
    pms: "1PM009-26, 2PM009-26",
    modelo: "MS-01",
    descripcion: null,
    cantidadPm: 10,
    cantidadPmIluminacion: 0,
    acabados: 0,
    armado: 0,
    electrificacion: 0,
    reprocesos: 0,
    discrepanciasPendientes: 0,
    esComponente: false,
    itemCodigo: null,
    material: null,
    padreModelo: null,
    aprobadoAcabados: null,
    aprobadoArmado: null,
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

describe("cuadre con Calidad", () => {
  it("lo aprobado por área; Electrificación no se compara con Calidad", () => {
    const f = fila({ aprobadoAcabados: 4, aprobadoArmado: 2 });
    expect(aprobadoArea(f, "acabados")).toBe(4);
    expect(aprobadoArea(f, "armado")).toBe(2);
    expect(aprobadoArea(f, "electrificacion")).toBeNull();
  });

  it("listo para cobrar = aprobado por Calidad - cobrado, sin bajar de cero", () => {
    const f = fila({ aprobadoAcabados: 4, acabados: 1, aprobadoArmado: 2, armado: 5 });
    expect(listoParaCobrar(f, "acabados")).toBe(3);
    expect(listoParaCobrar(f, "armado")).toBe(0);
    expect(listoParaCobrar(f, "electrificacion")).toBe(0);
    expect(tieneListoParaCobrar(f)).toBe(true);
    expect(tieneListoParaCobrar(fila({ aprobadoAcabados: 4, acabados: 4 }))).toBe(false);
  });

  it("cobrado de más que lo aprobado se marca; sin dato de Calidad no se marca", () => {
    const f = fila({ aprobadoAcabados: 1, acabados: 50, aprobadoArmado: 0, armado: 0 });
    expect(cobradoSobreCalidad(f, "acabados")).toBe(49);
    expect(cobradoSobreCalidad(f, "armado")).toBe(0);
    expect(tieneSobreCalidad(f)).toBe(true);
    // El mueble nunca pasó por Producción: aprobado null, nada que comparar.
    expect(tieneSobreCalidad(fila({ acabados: 50 }))).toBe(false);
    expect(cobradoSobreCalidad(fila({ acabados: 50 }), "acabados")).toBe(0);
  });

  it("un recibo que no concuerda con Calidad cuenta como diferencia para la pantalla, no para el Excel del PM", () => {
    const soloCalidad = fila({ acabados: 3, aprobadoAcabados: 1 });
    expect(tieneDiferencias(soloCalidad)).toBe(false);
    expect(tieneDiferenciasOCalidad(soloCalidad)).toBe(true);
  });

  it("un componente no cuenta como pendiente de cobro según el PM", () => {
    expect(tienePendienteDeCobro(fila({ esComponente: true }))).toBe(false);
    expect(tienePendienteDeCobro(fila({}))).toBe(true);
  });
});

describe("resumirPorOt con componentes y Calidad", () => {
  it("los componentes no suman en las barras ni en los modelos, pero sí sus diferencias", () => {
    const [r] = resumirPorOt([
      fila({ modelo: "M-RED", cantidadPm: 2, aprobadoAcabados: 2, acabados: 0 }),
      fila({
        modelo: "M-RED",
        esComponente: true,
        itemCodigo: "4.02",
        cantidadPm: 8,
        acabados: 9,
        aprobadoAcabados: 8,
        aprobadoArmado: 8,
      }),
    ]);
    expect(r.modelos).toBe(1);
    expect(r.piezasPm).toBe(2);
    expect(r.avance.acabados).toEqual({ cobrado: 0, base: 2 });
    // El componente cobrado de más (9 de 8) sí es una diferencia.
    expect(r.excedidos).toBe(1);
    expect(r.sobreCalidad).toBe(1);
  });

  it("cuenta lo listo para cobrar: muebles por un lado, componentes por otro", () => {
    const [r] = resumirPorOt([
      fila({ aprobadoAcabados: 1, aprobadoArmado: 1 }),
      fila({ modelo: "P-COL", aprobadoAcabados: 1, acabados: 1, aprobadoArmado: 0 }),
      fila({ modelo: "M-RED", esComponente: true, cantidadPm: 8, aprobadoAcabados: 8, aprobadoArmado: 8 }),
    ]);
    // Primer mueble: acabados y armado; P-COL ya cobró todo; el componente: ambas áreas.
    expect(r.listoParaCobrar).toBe(2);
    expect(r.listoComponentes).toBe(2);
  });
});

describe("resumirPorOt", () => {
  it("suma el avance sin contar lo excedido y cuenta modelos con diferencias", () => {
    const [r] = resumirPorOt([
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

  it("agrupa por OT conservando el orden", () => {
    const r = resumirPorOt([fila({ ot: "193-24" }), fila({ ot: "009-26" }), fila({ ot: "193-24" })]);
    expect(r.map((x) => x.ot)).toEqual(["193-24", "009-26"]);
  });
});
