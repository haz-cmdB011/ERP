import { describe, expect, it } from "vitest";
import type { AsignacionResumen, Proceso } from "./asignaciones";
import {
  avancePaso,
  avancePonderado,
  estadoMueble,
  estadoObra,
  opcionesDePasos,
  pasoConAsignaciones,
  pesosPartes,
  requiereDespiece,
  siguientePaso,
  totalesProceso,
  type MuebleFlujo,
} from "./flujo-mueble";
import type { PasoRuta } from "./ruta";

let n = 0;
const asig = (
  proceso: Proceso,
  cantidad: number,
  entregado: number,
  extra: Partial<AsignacionResumen> = {}
) =>
  ({
    id: `a${++n}`,
    proceso,
    cantidad,
    entregado,
    verificado: entregado,
    cancelada_en: null,
    informe_rechazo_id: null,
    paso_id: null,
    adelantada: false,
    estado: entregado >= cantidad ? "entregada" : entregado > 0 ? "parcial" : "en_proceso",
    ...extra,
  }) as AsignacionResumen;

const sugerida: PasoRuta[] = [
  { id: null, proceso: "armado" },
  { id: null, proceso: "barniz" },
];

const mueble = (asignaciones: AsignacionResumen[], ruta: PasoRuta[] = sugerida): MuebleFlujo => ({
  id: "m",
  item_code: 1,
  modelo: "CAR-02",
  unidad: "PZA",
  cantidad: 10,
  aplica: { armado: true, barniz: true, electrificacion: false, superficie_solida: false },
  ruta,
  versionRuta: 0,
  asignaciones,
});

describe("avancePaso", () => {
  it("suma lo repartido entre equipos y marca terminado al entregar todo", () => {
    const m = mueble([asig("armado", 6, 6), asig("armado", 4, 4)]);
    expect(avancePaso(m, 0)).toMatchObject({ estado: "terminado", asignado: 10, entregado: 10, disponible: 0 });
    expect(avancePaso(m, 1)).toMatchObject({ estado: "sin_asignar", disponible: 10, listo: 10 });
  });
  it("un retrabajo abierto deja el paso en proceso y no cuenta contra la cantidad", () => {
    const m = mueble([asig("armado", 10, 10), asig("armado", 2, 0, { informe_rechazo_id: "inf" })]);
    expect(avancePaso(m, 0)).toMatchObject({ estado: "en_proceso", asignado: 10, entregado: 10 });
  });
  it("listo = lo que el paso anterior entregó y Producción verificó", () => {
    const m = mueble([asig("armado", 10, 6, { verificado: 4 }), asig("barniz", 3, 0)]);
    expect(avancePaso(m, 1)).toMatchObject({ disponible: 7, listo: 1 });
  });
  it("con piezas rechazadas por Calidad sin reasignar el paso no está terminado", () => {
    const m = mueble([asig("armado", 10, 10, { rechazado_por_reasignar: 3 })]);
    expect(avancePaso(m, 0)).toMatchObject({ estado: "en_proceso", porReasignar: 3 });
    expect(siguientePaso(m)).toBe("En Armado");
    const reasignado = mueble([
      asig("armado", 10, 10),
      asig("armado", 3, 3, { informe_rechazo_id: "inf" }),
    ]);
    expect(avancePaso(reasignado, 0)).toMatchObject({ estado: "terminado", porReasignar: 0 });
  });
  it("las canceladas no cuentan", () => {
    const m = mueble([asig("armado", 10, 0, { cancelada_en: "2026-10-19" })]);
    expect(avancePaso(m, 0)).toMatchObject({ estado: "sin_asignar", disponible: 10 });
    expect(pasoConAsignaciones(m, 0)).toBe(false);
  });
});

describe("pasos repetidos", () => {
  const ruta: PasoRuta[] = [
    { id: "p1", proceso: "armado" },
    { id: "p2", proceso: "barniz" },
    { id: "p3", proceso: "armado" },
  ];
  it("cada paso tiene su propio tope y su propio avance", () => {
    const m = mueble(
      [
        asig("armado", 10, 10, { paso_id: "p1" }),
        asig("barniz", 10, 10, { paso_id: "p2" }),
        asig("armado", 4, 0, { paso_id: "p3" }),
      ],
      ruta
    );
    expect(avancePaso(m, 0).estado).toBe("terminado");
    expect(avancePaso(m, 2)).toMatchObject({ estado: "en_proceso", asignado: 4, disponible: 6, listo: 6 });
    expect(siguientePaso(m)).toBe("En Armado 2");
    expect(pasoConAsignaciones(m, 2)).toBe(true);
  });
  it("los totales cuentan el proceso cada vez que se repite", () => {
    const m = mueble([asig("armado", 10, 10, { paso_id: "p1" })], ruta);
    expect(totalesProceso([m], "armado")).toEqual({ muebles: 1, piezas: 20, asignado: 10, entregado: 10 });
  });
  it("una asignación sin paso conocido va al primer paso de su proceso", () => {
    const m = mueble([asig("armado", 10, 10, { paso_id: "viejo" })], ruta);
    expect(avancePaso(m, 0).asignado).toBe(10);
    expect(avancePaso(m, 2).asignado).toBe(0);
  });
});

describe("revisión final", () => {
  it("su retrabajo no cuenta contra el tope y deja el paso en proceso", () => {
    const m = mueble([
      asig("armado", 10, 10),
      asig("barniz", 10, 10),
      asig("barniz", 2, 0, { revision_final_rechazo_id: "fin" }),
    ]);
    expect(avancePaso(m, 1)).toMatchObject({ estado: "en_proceso", asignado: 10, disponible: 0 });
  });
  it("apagada no cambia nada; encendida, el mueble sale a obra al aprobarse completo", () => {
    const listo = mueble([asig("armado", 10, 10), asig("barniz", 10, 10)]);
    expect(estadoObra(listo)).toBeNull();
    expect(estadoObra({ ...listo, revisionFinal: { aprobadas: 6 } })).toBe("en_revision_final");
    expect(estadoObra({ ...listo, revisionFinal: { aprobadas: 10 } })).toBe("liberado");
  });
});

describe("opcionesDePasos", () => {
  it("cada paso con lo que falta asignar, lo listo y el paso anterior", () => {
    const ruta: PasoRuta[] = [
      { id: "p1", proceso: "armado" },
      { id: "p2", proceso: "barniz" },
      { id: "p3", proceso: "armado" },
    ];
    const m = mueble([asig("armado", 10, 6, { verificado: 4, paso_id: "p1" }), asig("barniz", 3, 0, { paso_id: "p2" })], ruta);
    expect(opcionesDePasos(m)).toEqual([
      { indice: 0, id: "p1", proceso: "armado", etiqueta: "Armado 1", disponible: 0, listo: 0, anterior: null, partes: [] },
      { indice: 1, id: "p2", proceso: "barniz", etiqueta: "Barniz", disponible: 7, listo: 1, anterior: "Armado 1", partes: [] },
      { indice: 2, id: "p3", proceso: "armado", etiqueta: "Armado 2", disponible: 10, listo: 0, anterior: "Barniz", partes: [] },
    ]);
  });
});

describe("por partes del despiece", () => {
  const partes = [
    { id: "madera", descripcion: "Estructura de madera", piezasPorMueble: 1, unidad: "PZA" },
    { id: "metal", descripcion: "Base de metal", piezasPorMueble: 6, unidad: "PZA" },
  ];
  const conPartes = (asignaciones: AsignacionResumen[]): MuebleFlujo => ({ ...mueble(asignaciones), partes });

  it("el paso va en lo de la parte más atrasada", () => {
    const m = conPartes([
      asig("armado", 10, 10, { parte_id: "madera" }),
      asig("armado", 10, 5, { parte_id: "metal" }),
    ]);
    const a = avancePaso(m, 0);
    expect(a).toMatchObject({ estado: "en_proceso", asignado: 10, entregado: 5, disponible: 0 });
    expect(a.partes).toEqual({
      madera: { asignado: 10, entregado: 10, disponible: 0, listo: 0 },
      metal: { asignado: 10, entregado: 5, disponible: 0, listo: 0 },
    });
  });

  it("una parte sin asignar deja el paso a medias y es lo que queda por asignar", () => {
    const m = conPartes([asig("armado", 10, 10, { parte_id: "madera" })]);
    const a = avancePaso(m, 0);
    expect(a).toMatchObject({ estado: "en_proceso", asignado: 0, entregado: 0 });
    expect(a.partes.metal).toMatchObject({ disponible: 10 });
    expect(a.partes.madera).toMatchObject({ disponible: 0 });
    // El mueble completo ya no cabe: la madera está asignada completa.
    expect(a.disponible).toBe(0);
  });

  it("lo del mueble completo cuenta para todas sus partes", () => {
    const m = conPartes([asig("armado", 4, 4), asig("armado", 6, 6, { parte_id: "madera" })]);
    const a = avancePaso(m, 0);
    expect(a).toMatchObject({ asignado: 4, entregado: 4, disponible: 0 });
    expect(a.partes.madera).toMatchObject({ asignado: 10, disponible: 0 });
    expect(a.partes.metal).toMatchObject({ asignado: 4, disponible: 6 });
  });

  it("todas las partes completas terminan el paso", () => {
    const m = conPartes([
      asig("armado", 10, 10, { parte_id: "madera" }),
      asig("armado", 10, 10, { parte_id: "metal" }),
    ]);
    expect(avancePaso(m, 0).estado).toBe("terminado");
    expect(siguientePaso(m)).toBe("Asignar a Barniz");
  });

  it("lo listo del paso siguiente es por parte: lo que esa parte ya verificó", () => {
    const m = conPartes([
      asig("armado", 10, 10, { parte_id: "madera", verificado: 8 }),
      asig("armado", 10, 3, { parte_id: "metal", verificado: 3 }),
    ]);
    const b = avancePaso(m, 1);
    expect(b.partes.madera).toMatchObject({ disponible: 10, listo: 8 });
    expect(b.partes.metal).toMatchObject({ disponible: 10, listo: 3 });
    // El mueble completo, lo de la más atrasada.
    expect(b).toMatchObject({ disponible: 10, listo: 3 });
    expect(opcionesDePasos(m)[1].partes).toEqual([
      { id: "madera", disponible: 10, listo: 8 },
      { id: "metal", disponible: 10, listo: 3 },
    ]);
  });

  it("sin leer las partes, cuentan las que ya tienen asignaciones", () => {
    const m = mueble([
      asig("armado", 10, 10, { parte_id: "madera" }),
      asig("armado", 10, 5, { parte_id: "metal" }),
    ]);
    expect(avancePaso(m, 0)).toMatchObject({ entregado: 5 });
  });
});

describe("siguientePaso y estadoMueble", () => {
  it("sigue el orden de la ruta", () => {
    expect(siguientePaso(mueble([]))).toBe("Asignar a Armado");
    expect(estadoMueble(mueble([]))).toBe("por_asignar");
    const armado = mueble([asig("armado", 10, 10)]);
    expect(siguientePaso(armado)).toBe("Asignar a Barniz");
    expect(estadoMueble(armado)).toBe("por_asignar");
    const barniz = mueble([asig("armado", 10, 10), asig("barniz", 10, 3)]);
    expect(siguientePaso(barniz)).toBe("En Barniz");
    expect(estadoMueble(barniz)).toBe("en_proceso");
    const listo = mueble([asig("armado", 10, 10), asig("barniz", 10, 10)]);
    expect(siguientePaso(listo)).toBe("Terminado");
    expect(estadoMueble(listo)).toBe("terminado");
  });
});

describe("totalesProceso", () => {
  it("solo cuenta los muebles cuya ruta lleva el proceso", () => {
    const conLuz = mueble([asig("electrificacion", 10, 5)], [...sugerida, { id: null, proceso: "electrificacion" }]);
    expect(totalesProceso([conLuz, mueble([])], "electrificacion")).toEqual({
      muebles: 1,
      piezas: 10,
      asignado: 10,
      entregado: 5,
    });
    expect(totalesProceso([conLuz, mueble([])], "armado").piezas).toBe(20);
  });
});

describe("despiece con porcentaje", () => {
  const partes = [
    { id: "madera", descripcion: "Estructura de madera", piezasPorMueble: 1, unidad: "PZA", porcentaje: 70 },
    { id: "metal", descripcion: "Base de metal", piezasPorMueble: 6, unidad: "PZA", porcentaje: 30 },
  ];

  it("el avance pondera cada parte por su %", () => {
    const m: MuebleFlujo = {
      ...mueble([asig("armado", 10, 10, { parte_id: "madera" }), asig("armado", 10, 5, { parte_id: "metal" })]),
      partes,
    };
    // 70 % entregado completo + 30 % a la mitad.
    expect(avancePonderado(m, 0)).toBe(85);
    expect(avancePonderado(m, 0, "asignado")).toBe(100);
    expect(avancePonderado(m, 1)).toBe(0);
  });
  it("lo del mueble completo cuenta entero", () => {
    const m: MuebleFlujo = { ...mueble([asig("armado", 5, 5)]), partes };
    expect(avancePonderado(m, 0)).toBe(50);
  });
  it("sin % guardado las partes valen lo mismo", () => {
    const sinPct = partes.map((p) => ({ ...p, porcentaje: null }));
    expect(pesosPartes(sinPct)).toEqual(new Map([["madera", 50], ["metal", 50]]));
  });
  it("con componentes y sin despiece no se asigna", () => {
    const m = mueble([]);
    expect(requiereDespiece({ ...m, conComponentes: true, partes: [] })).toBe(true);
    expect(requiereDespiece({ ...m, conComponentes: true, partes })).toBe(false);
    expect(requiereDespiece({ ...m, conComponentes: false, partes: [] })).toBe(false);
  });
});
