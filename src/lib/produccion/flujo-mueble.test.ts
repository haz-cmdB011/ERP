import { describe, expect, it } from "vitest";
import type { AsignacionResumen, Proceso } from "./asignaciones";
import {
  asignacionesDelPaso,
  avanceColumna,
  columnasMueble,
  pasoEnColumna,
  avanceEnRuta,
  avancePartes,
  avancePaso,
  encuadreMueble,
  estadoMueble,
  estadoObra,
  etapasMueble,
  indiceSiguiente,
  opcionesAsignar,
  opcionesDePasos,
  partesCompletas,
  pasoConAsignaciones,
  pesosPartes,
  procesosDe,
  requiereDespiece,
  rutasDelFlujo,
  siguienteAsignable,
  siguientePaso,
  totalesProceso,
  type MuebleFlujo,
  type ParteMueble,
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
      { indice: 0, id: "p1", proceso: "armado", etiqueta: "Armado 1", disponible: 0, listo: 0, anterior: null },
      { indice: 1, id: "p2", proceso: "barniz", etiqueta: "Barniz", disponible: 7, listo: 1, anterior: "Armado 1" },
      { indice: 2, id: "p3", proceso: "armado", etiqueta: "Armado 2", disponible: 10, listo: 0, anterior: "Barniz" },
    ]);
  });
});

describe("rutas por parte (cada parte la suya, en sus piezas)", () => {
  // 10 muebles: tabla 3 por mueble (30 piezas) Armado → Barniz; herraje 1 por mueble, solo Armado.
  const tabla: ParteMueble = {
    id: "tabla",
    descripcion: "Tabla",
    piezasPorMueble: 3,
    unidad: "PZA",
    ruta: [
      { id: "t1", proceso: "armado" },
      { id: "t2", proceso: "barniz" },
    ],
  };
  const herraje: ParteMueble = {
    id: "herraje",
    descripcion: "Herraje",
    piezasPorMueble: 1,
    unidad: "JUEGO",
    ruta: [{ id: "h1", proceso: "armado" }],
  };
  // El mueble completo, ya con sus partes: se ensambla (Armado) y se barniza.
  const rutaMueble: PasoRuta[] = [
    { id: "m1", proceso: "armado" },
    { id: "m2", proceso: "barniz" },
  ];
  const conPartes = (asignaciones: AsignacionResumen[], ruta: PasoRuta[] = []): MuebleFlujo => ({
    ...mueble(asignaciones, ruta),
    partes: [tabla, herraje],
  });

  it("cada parte avanza en su ruta y en sus piezas", () => {
    const m = conPartes([
      asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1", verificado: 12 }),
      asig("barniz", 6, 0, { parte_id: "tabla", paso_id: "t2" }),
      asig("armado", 4, 4, { parte_id: "herraje", paso_id: "h1" }),
    ]);
    expect(avanceEnRuta(m, 0, tabla)).toMatchObject({ estado: "terminado", total: 30, asignado: 30, entregado: 30 });
    expect(avanceEnRuta(m, 1, tabla)).toMatchObject({ estado: "en_proceso", total: 30, disponible: 24, listo: 6 });
    expect(avanceEnRuta(m, 0, herraje)).toMatchObject({ estado: "en_proceso", total: 10, disponible: 6, listo: 6 });
  });

  it("lo de una parte no aparece en el mueble completo ni en otra parte", () => {
    const m = conPartes([asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" })], rutaMueble);
    expect(avancePaso(m, 0)).toMatchObject({ estado: "sin_asignar", asignado: 0, disponible: 10 });
    expect(avanceEnRuta(m, 0, herraje)).toMatchObject({ estado: "sin_asignar", asignado: 0 });
    expect(asignacionesDelPaso(m, 0, tabla)).toHaveLength(1);
    expect(asignacionesDelPaso(m, 0)).toHaveLength(0);
  });

  it("el primer paso del mueble va detrás de sus partes: la más atrasada en su último paso", () => {
    const m = conPartes(
      [
        asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
        asig("barniz", 30, 15, { parte_id: "tabla", paso_id: "t2", verificado: 15 }),
        asig("armado", 10, 10, { parte_id: "herraje", paso_id: "h1", verificado: 8 }),
      ],
      rutaMueble
    );
    // Tabla: 15 en Barniz = 5 muebles; herraje: 8. Para ensamblar hay 5.
    expect(partesCompletas(m, "verificado")).toBe(5);
    expect(avancePaso(m, 0)).toMatchObject({ disponible: 10, listo: 5 });
    expect(opcionesDePasos(m)[0].anterior).toBe("Las partes");
  });

  it("las partes son una etapa antes de la ruta del mueble", () => {
    const sinNada = conPartes([], rutaMueble);
    expect(etapasMueble(sinNada)).toEqual([
      { tipo: "partes" },
      { tipo: "paso", indice: 0 },
      { tipo: "paso", indice: 1 },
    ]);
    // Dice el proceso que les toca a las partes, no "partes".
    expect(siguientePaso(sinNada)).toBe("Asignar a Armado");
    expect(indiceSiguiente(sinNada)).toBeNull();
    const tablaArmada = conPartes([asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" })], rutaMueble);
    expect(siguientePaso(tablaArmada)).toBe("En Armado");
    const partesListas = conPartes(
      [
        asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
        asig("barniz", 30, 30, { parte_id: "tabla", paso_id: "t2" }),
        asig("armado", 10, 10, { parte_id: "herraje", paso_id: "h1" }),
      ],
      rutaMueble
    );
    expect(avancePartes(partesListas)).toMatchObject({ estado: "terminado", pct: 100, completas: 10 });
    expect(siguientePaso(partesListas)).toBe("Asignar a Armado");
    expect(indiceSiguiente(partesListas)).toBe(0);
    expect(estadoMueble(partesListas)).toBe("por_asignar");
  });

  it("un anillo por proceso: las partes que lo llevan (por su %) y el mueble completo si también", () => {
    const m = conPartes(
      [
        asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
        asig("barniz", 30, 15, { parte_id: "tabla", paso_id: "t2" }),
        asig("armado", 10, 5, { parte_id: "herraje", paso_id: "h1" }),
      ],
      []
    );
    expect(columnasMueble(m).map((c) => c.etiqueta)).toEqual(["Armado", "Barniz"]);
    // Armado: tabla 100 % y herraje 50 %, cada uno la mitad del mueble.
    expect(avanceColumna(m, columnasMueble(m)[0])).toMatchObject({ estado: "en_proceso", pct: 75, muebles: 5 });
    // Barniz: solo la tabla lo lleva.
    expect(avanceColumna(m, columnasMueble(m)[1])).toMatchObject({ estado: "en_proceso", pct: 50, muebles: 5 });
    expect(pasoEnColumna(herraje.ruta, { proceso: "barniz", vez: 1 })).toBe(-1);
    // El Armado del mueble completo va en la misma columna: es la 1ª vez en su ruta.
    const conMueble = conPartes([], rutaMueble);
    expect(columnasMueble(conMueble).map((c) => c.etiqueta)).toEqual(["Armado", "Barniz"]);
    expect(avanceColumna(conMueble, columnasMueble(conMueble)[0]).estado).toBe("sin_asignar");
  });

  it("sin ruta del mueble, termina cuando terminan sus partes", () => {
    const m = conPartes([
      asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
      asig("barniz", 30, 30, { parte_id: "tabla", paso_id: "t2" }),
      asig("armado", 10, 10, { parte_id: "herraje", paso_id: "h1" }),
    ]);
    expect(siguientePaso(m)).toBe("Terminado");
    expect(estadoMueble(m)).toBe("terminado");
  });

  it("el avance de las partes pondera cada parte y cada paso de su ruta", () => {
    // Tabla (50 %): Armado completo y Barniz a la mitad = 75 %; herraje (50 %): 0.
    const m = conPartes([
      asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
      asig("barniz", 30, 15, { parte_id: "tabla", paso_id: "t2" }),
    ]);
    expect(avancePartes(m)).toMatchObject({ estado: "en_proceso", pct: 38, completas: 0 });
  });

  it("una parte sin procesos no detiene al mueble", () => {
    const m: MuebleFlujo = {
      ...mueble(
        [
          asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
          asig("barniz", 30, 30, { parte_id: "tabla", paso_id: "t2" }),
        ],
        []
      ),
      partes: [tabla, { ...herraje, ruta: [] }],
    };
    expect(partesCompletas(m)).toBe(10);
    expect(siguientePaso(m)).toBe("Terminado");
  });

  it("lo que toca asignar: primero las partes, luego el mueble", () => {
    const m = conPartes([asig("armado", 30, 0, { parte_id: "tabla", paso_id: "t1" })], rutaMueble);
    const s = siguienteAsignable(m);
    expect(s?.parte?.id).toBe("tabla");
    expect(s?.paso.etiqueta).toBe("Barniz");
    expect(opcionesAsignar(m).partes.map((x) => x.pasos.length)).toEqual([2, 1]);
  });

  it("los totales cuentan cada vez que las partes llevan el proceso, por la más atrasada, y el mueble aparte", () => {
    const m = conPartes(
      [
        asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
        asig("armado", 5, 5, { parte_id: "herraje", paso_id: "h1" }),
        asig("armado", 4, 0, { paso_id: "m1" }),
      ],
      rutaMueble
    );
    // Armado de las partes: 5 (el herraje); armado del mueble: 4 asignados.
    expect(totalesProceso([m], "armado")).toEqual({ muebles: 1, piezas: 20, asignado: 9, entregado: 5 });
    expect(procesosDe([m])).toEqual(new Set(["armado", "barniz"]));
  });

  it("rutasDelFlujo: el mueble con partes nace vacío y cada parte toma la sugerida hasta guardar la suya", () => {
    const aplica = { armado: true, barniz: true, electrificacion: false, superficie_solida: false };
    const despiece = [
      { id: "tabla", descripcion: "Tabla", piezasPorMueble: 3, unidad: "PZA" },
      { id: "herraje", descripcion: "Herraje", piezasPorMueble: 1, unidad: "JUEGO", rutaGuardada: true },
    ];
    const r = rutasDelFlujo(
      { version: 3, pasos: [], partes: new Map([["herraje", [{ id: "h1", proceso: "armado" as const }]]]) },
      aplica,
      despiece
    );
    expect(r.ruta).toEqual([]);
    expect(r.partes[0].ruta.map((p) => p.proceso)).toEqual(["armado", "barniz"]);
    expect(r.partes[1].ruta).toEqual([{ id: "h1", proceso: "armado" }]);
    expect(rutasDelFlujo(undefined, aplica, []).ruta.map((p) => p.proceso)).toEqual(["armado", "barniz"]);
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
  it("sin % guardado las partes valen lo mismo", () => {
    const partes = [
      { id: "madera", descripcion: "Estructura de madera", piezasPorMueble: 1, unidad: "PZA", porcentaje: null },
      { id: "metal", descripcion: "Base de metal", piezasPorMueble: 6, unidad: "PZA", porcentaje: null },
    ];
    expect(pesosPartes(partes)).toEqual(new Map([["madera", 50], ["metal", 50]]));
  });
  it("con % guardado, cada parte pesa el suyo", () => {
    const partes: ParteMueble[] = [
      { id: "madera", descripcion: "Madera", piezasPorMueble: 1, unidad: "PZA", porcentaje: 70, ruta: [{ id: "a", proceso: "armado" }] },
      { id: "metal", descripcion: "Metal", piezasPorMueble: 6, unidad: "PZA", porcentaje: 30, ruta: [{ id: "b", proceso: "armado" }] },
    ];
    const m: MuebleFlujo = {
      ...mueble(
        [asig("armado", 10, 10, { parte_id: "madera", paso_id: "a" }), asig("armado", 60, 30, { parte_id: "metal", paso_id: "b" })],
        []
      ),
      partes,
    };
    // 70 % entregado completo + 30 % a la mitad.
    expect(avancePartes(m)?.pct).toBe(85);
  });
  it("con componentes y sin despiece no se asigna", () => {
    const m = mueble([]);
    const una: ParteMueble = { id: "x", descripcion: "X", piezasPorMueble: 1, unidad: null, ruta: [] };
    expect(requiereDespiece({ ...m, conComponentes: true, partes: [] })).toBe(true);
    expect(requiereDespiece({ ...m, conComponentes: true, partes: [una] })).toBe(false);
    expect(requiereDespiece({ ...m, conComponentes: false, partes: [] })).toBe(false);
  });
});

describe("encuadreMueble", () => {
  // PG-02: 23 muebles; tabla 3 por mueble (69) Armado → Barniz; herraje 1 por mueble, solo Armado.
  const partes: ParteMueble[] = [
    {
      id: "tabla",
      descripcion: "Tabla MDF",
      piezasPorMueble: 3,
      unidad: "PZA",
      ruta: [
        { id: "t1", proceso: "armado" },
        { id: "t2", proceso: "barniz" },
      ],
    },
    { id: "herraje", descripcion: "Herraje", piezasPorMueble: 1, unidad: "JUEGO", ruta: [{ id: "h1", proceso: "armado" }] },
  ];
  const pg02 = (asignaciones: AsignacionResumen[]): MuebleFlujo => ({ ...mueble(asignaciones, []), cantidad: 23, partes });

  it("20 tablas terminadas y ningún herraje: 0 completos y faltan 6 herrajes para los 6 que cubre la tabla", () => {
    const e = encuadreMueble(
      pg02([
        asig("armado", 20, 20, { parte_id: "tabla", paso_id: "t1" }),
        asig("barniz", 20, 20, { parte_id: "tabla", paso_id: "t2" }),
      ])
    );
    expect(e).toEqual({
      completos: 0,
      meta: 6,
      partes: [
        { id: "tabla", terminadas: 20, muebles: 6, faltan: 0 },
        { id: "herraje", terminadas: 0, muebles: 0, faltan: 6 },
      ],
    });
  });

  it("cada parte cuenta en el último paso de su ruta: el herraje en Armado, la tabla en Barniz", () => {
    const e = encuadreMueble(
      pg02([
        asig("armado", 30, 30, { parte_id: "tabla", paso_id: "t1" }),
        asig("barniz", 12, 12, { parte_id: "tabla", paso_id: "t2" }),
        asig("armado", 5, 5, { parte_id: "herraje", paso_id: "h1" }),
      ])
    );
    // Tabla: 12 en Barniz = 4 muebles; herraje: 5. Completos 4; a la tabla le faltan 3 para 5.
    expect(e.completos).toBe(4);
    expect(e.partes).toEqual([
      { id: "tabla", terminadas: 12, muebles: 4, faltan: 3 },
      { id: "herraje", terminadas: 5, muebles: 5, faltan: 0 },
    ]);
  });

  it("sin partes, los muebles entregados en el último paso", () => {
    expect(encuadreMueble(mueble([asig("armado", 10, 10), asig("barniz", 10, 7)])).completos).toBe(7);
  });
});
