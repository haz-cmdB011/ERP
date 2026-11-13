import { describe, expect, it } from "vitest";
import {
  listoPorCalidad,
  mueblesEnCalidad,
  renglonesSueltos,
  renglonesPorLlegar,
  resumirPorArea,
  type FilaMuebleEnCalidad,
} from "./por-llegar";
import type { FilaPmCobrado } from "./pm-cobrado";
import type { RenglonHistorico } from "./datos-acabados";

function fila(parcial: Partial<FilaPmCobrado>): FilaPmCobrado {
  return {
    ot: "009-26",
    proyecto: "Azotea",
    numPms: 1,
    pms: "1PM009-26",
    modelo: "MS-01",
    descripcion: null,
    cantidadPm: 10,
    cantidadPmIluminacion: 0,
    cantidadPmAcabados: null,
    cantidadPmArmado: null,
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
    verificadoAcabados: null,
    verificadoArmado: null,
    // El cobro según Producción no cambia la vista previa: manda Calidad.
    baseCobro: "produccion",
    ...parcial,
  };
}

function pagado(modelo: string, aceptado: number, fecha: string, folio = "A-1"): RenglonHistorico {
  return {
    modelo,
    familia: "",
    acabado: "",
    acabado2: "",
    cantidad: 1,
    propuesto: aceptado,
    aceptado,
    fecha,
    folio,
    obra: "",
    ot: "",
    estado: "pagado",
  };
}

const SIN_HISTORICO = { acabados: [], armado: [] };

describe("listoPorCalidad", () => {
  it("es lo aprobado por Calidad menos lo cobrado, aunque Producción haya verificado más", () => {
    const f = fila({ aprobadoArmado: 6, verificadoArmado: 10, armado: 2 });
    expect(listoPorCalidad(f, "armado")).toBe(4);
  });

  it("no baja de cero ni cuenta sin dato o fuera del PM", () => {
    expect(listoPorCalidad(fila({ aprobadoAcabados: 3, acabados: 5 }), "acabados")).toBe(0);
    expect(listoPorCalidad(fila({ aprobadoAcabados: null }), "acabados")).toBe(0);
    expect(listoPorCalidad(fila({ cantidadPm: null, aprobadoAcabados: 3 }), "acabados")).toBe(0);
  });
});

describe("renglonesPorLlegar", () => {
  it("estima el importe con el último precio pagado del modelo en esa área", () => {
    const [r] = renglonesPorLlegar([fila({ aprobadoArmado: 5, armado: 1 })], {
      acabados: [pagado("MS-01", 999, "2026-09-01")],
      armado: [pagado("MS 01", 100, "2026-08-01"), pagado("ms-01", 120, "2026-09-15", "B-7")],
    });
    expect(r).toMatchObject({ area: "armado", listo: 4, pu: 120, folioPrecio: "B-7", importe: 480 });
  });

  it("sin precedente deja el importe vacío", () => {
    const [r] = renglonesPorLlegar([fila({ aprobadoAcabados: 2 })], SIN_HISTORICO);
    expect(r).toMatchObject({ area: "acabados", listo: 2, pu: null, importe: null });
  });

  it("omite las áreas sin nada listo", () => {
    expect(renglonesPorLlegar([fila({ aprobadoAcabados: 2, acabados: 2 })], SIN_HISTORICO)).toEqual([]);
  });
});

describe("resumirPorArea", () => {
  it("suma muebles y componentes aparte y cuenta al menos un recibo por O.T.", () => {
    const renglones = renglonesPorLlegar(
      [
        fila({ aprobadoArmado: 3 }),
        fila({ modelo: "MS-02", aprobadoArmado: 2 }),
        fila({ ot: "010-26", modelo: "MS-03", aprobadoArmado: 1 }),
        fila({ modelo: "MS-01-A", esComponente: true, aprobadoArmado: 6 }),
      ],
      { acabados: [], armado: [pagado("MS-01", 50, "2026-09-01")] }
    );
    const [acabados, armado] = resumirPorArea(renglones);
    expect(acabados).toMatchObject({ muebles: 0, renglones: 0, recibosMinimos: 0, importe: 0 });
    expect(armado).toMatchObject({
      muebles: 6,
      componentes: 6,
      renglones: 4,
      recibosMinimos: 2,
      ots: ["009-26", "010-26"],
      importe: 150,
      sinPrecio: 3,
    });
  });
});

describe("mueblesEnCalidad", () => {
  function linea(p: Partial<FilaMuebleEnCalidad>): FilaMuebleEnCalidad {
    return {
      ot: "009-26",
      itemId: "pergola",
      itemCodigo: "1.00",
      modelo: "PG-01",
      descripcion: "PÉRGOLA 240",
      cantidad: 13,
      proceso: "armado",
      parteId: "tabla",
      parte: "Tabla",
      piezasPorMueble: 3,
      entregadas: 0,
      aprobadas: 0,
      veces: 1,
      finalAprobadas: 0,
      ...p,
    };
  }
  const pergola = [
    linea({ entregadas: 39, aprobadas: 20 }),
    linea({ parteId: "herraje", parte: "Herraje", piezasPorMueble: 1, entregadas: 13, aprobadas: 0 }),
  ];

  it("muestra lo entregado aunque Calidad no lo apruebe, con el avance de cada parte", () => {
    const [m] = mueblesEnCalidad(pergola, [], []);
    expect(m).toMatchObject({
      area: "armado",
      porCobrar: 13,
      entregados: 13,
      aprobados: 0,
      enRevision: 13,
      cobrado: null,
      porLlegar: null,
    });
    expect(m.partes).toEqual([
      { parte: "Tabla", entregadas: 39, aprobadas: 20, total: 39 },
      { parte: "Herraje", entregadas: 13, aprobadas: 0, total: 13 },
    ]);
  });

  it("la revisión final aprueba el mueble entero sin pasar de lo entregado", () => {
    const [m] = mueblesEnCalidad(pergola.map((f) => ({ ...f, finalAprobadas: 20 })), [], []);
    expect(m).toMatchObject({ entregados: 13, aprobados: 13, enRevision: 0 });
  });

  it("un mueble sin despiece cuenta en muebles y el barniz es Acabados", () => {
    const [m] = mueblesEnCalidad(
      [linea({ parteId: null, parte: null, piezasPorMueble: 1, proceso: "barniz", veces: 2, entregadas: 5, aprobadas: 3 })],
      [],
      []
    );
    expect(m).toMatchObject({ area: "acabados", porCobrar: 26, entregados: 5, aprobados: 3, enRevision: 2, partes: [] });
  });

  it("toma lo cobrado y lo por cobrar del modelo en la O.T.", () => {
    const cobrado = [fila({ modelo: "PG 01", descripcion: "Pérgola 240", aprobadoArmado: 6, armado: 2 })];
    const renglones = renglonesPorLlegar(cobrado, SIN_HISTORICO);
    const muebles = mueblesEnCalidad(pergola, cobrado, renglones);
    expect(muebles[0]).toMatchObject({ cobrado: 2, porLlegar: { listo: 4 } });
    expect(renglonesSueltos(renglones, muebles)).toEqual([]);
    expect(resumirPorArea(renglones, muebles)[1]).toMatchObject({ enCalidad: 1, enRevision: 13 });
  });
});
