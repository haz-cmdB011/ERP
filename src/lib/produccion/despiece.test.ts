import { describe, expect, it } from "vitest";
import {
  MAX_LINEAS,
  basePmDesdeJson,
  diferenciasConPm,
  etiquetaMaterial,
  etiquetaUnidad,
  leerCantidad,
  lineasConComponenteCaido,
  lineasDesdeJson,
  limpiarLineas,
  mismasLineas,
  repartirPorcentajes,
  sugerirDespiece,
  totalLinea,
  trasladarLineas,
  validarLineas,
  type HijoDespiece,
  type LineaDespiece,
  type PadreDespiece,
} from "./despiece";

const padre: PadreDespiece = {
  id: "p1",
  item_code: 13,
  modelo: "L-1293",
  descripcion: "MUEBLE DE PRUEBA\nsegunda línea",
  tipo_material: "HIBRIDO",
  unidad: "PZA",
  cantidad_total: 3,
};

function hijo(id: string, parcial: Partial<HijoDespiece> = {}): HijoDespiece {
  return {
    id,
    item_code: 13.01,
    modelo: "L-1293",
    descripcion: "PIEZA",
    tipo_material: "MADERA",
    unidad: "PZA",
    cantidad_x_mueble: 1,
    cantidad_total: 3,
    fila_excel_origen: 10,
    eliminacion_solicitada_en: null,
    estado_revision: null,
    ...parcial,
  };
}

describe("sugerirDespiece", () => {
  it("propone una línea por componente, en el orden del Excel, con su material y unidad", () => {
    const s = sugerirDespiece(padre, [
      hijo("c", { item_code: 13.03, descripcion: "SUPERFICIE", tipo_material: "S.S.", cantidad_x_mueble: 1, cantidad_total: 3, fila_excel_origen: 12 }),
      hijo("a", { item_code: 13.01, descripcion: "TABLERO", tipo_material: "MADERA", cantidad_x_mueble: 3, cantidad_total: 9, fila_excel_origen: 10 }),
      hijo("b", { item_code: 13.02, descripcion: "ESTRUCTURA", tipo_material: "metal", unidad: "JUEGO", cantidad_x_mueble: 1, cantidad_total: 3, fila_excel_origen: 11 }),
    ]);
    expect(s.lineas).toEqual([
      { descripcion: "TABLERO", material: "Madera", unidad: "PZA", piezas_por_mueble: 3, porcentaje: 33.33, hijo_id: "a" },
      { descripcion: "ESTRUCTURA", material: "Metal", unidad: "JUEGO", piezas_por_mueble: 1, porcentaje: 33.33, hijo_id: "b" },
      { descripcion: "SUPERFICIE", material: "Superficie sólida", unidad: "PZA", piezas_por_mueble: 1, porcentaje: 33.34, hijo_id: "c" },
    ]);
    expect(s.avisosPorLinea).toEqual([null, null, null]);
    expect(s.avisos).toEqual([]);
  });

  it("omite las filas vacías del Excel (sin descripción ni cantidad)", () => {
    const s = sugerirDespiece(padre, [
      hijo("a"),
      hijo("vacio", { item_code: 13.02, descripcion: null, cantidad_x_mueble: null, cantidad_total: 0 }),
    ]);
    expect(s.lineas.map((l) => l.hijo_id)).toEqual(["a"]);
  });

  it("ignora los componentes cancelados o enviados a la papelera", () => {
    const s = sugerirDespiece(padre, [
      hijo("a"),
      hijo("cancelado", { item_code: 13.02, estado_revision: "cancelado" }),
      hijo("papelera", { item_code: 13.03, eliminacion_solicitada_en: "2026-10-01T00:00:00Z" }),
    ]);
    expect(s.lineas.map((l) => l.hijo_id)).toEqual(["a"]);
  });

  it("sin cantidad por mueble la calcula con el total y lo avisa", () => {
    const s = sugerirDespiece(padre, [hijo("a", { cantidad_x_mueble: null, cantidad_total: 6 })]);
    expect(s.lineas[0].piezas_por_mueble).toBe(2);
    expect(s.avisosPorLinea[0]).toMatch(/calculó con el total/);
  });

  it("sin ninguna cantidad no inventa una: la deja en 0 para que se escriba", () => {
    const s = sugerirDespiece(padre, [hijo("a", { cantidad_x_mueble: null, cantidad_total: 0 })]);
    expect(s.lineas[0].piezas_por_mueble).toBe(0);
    expect(s.avisosPorLinea[0]).toMatch(/escríbela/);
    // Y por eso no se puede guardar así.
    expect(validarLineas(s.lineas)).toMatch(/cantidad por mueble/);
  });

  it("avisa cuando el total del Excel no es cantidad por mueble × muebles", () => {
    const s = sugerirDespiece(padre, [hijo("a", { cantidad_x_mueble: 1, cantidad_total: 5 })]);
    expect(s.lineas[0].piezas_por_mueble).toBe(1);
    expect(s.avisosPorLinea[0]).toMatch(/suma 5 en total, pero 1 por mueble × 3 = 3/);
  });

  it("marca los componentes repetidos sin juntarlos", () => {
    const s = sugerirDespiece(padre, [
      hijo("a", { item_code: 13.08, descripcion: "PORCELANATO PARA JALADERA" }),
      hijo("b", { item_code: 13.09, descripcion: "Porcelanato para jaladera" }),
    ]);
    expect(s.lineas).toHaveLength(2);
    expect(s.avisosPorLinea[0]).toBeNull();
    expect(s.avisosPorLinea[1]).toMatch(/Se repite: es igual al componente 13.08/);
  });

  it("deja la primera línea de una descripción con varias", () => {
    const s = sugerirDespiece(padre, [hijo("a", { descripcion: "  TABLERO   DE   MDF  \nacabado mate" })]);
    expect(s.lineas[0].descripcion).toBe("TABLERO DE MDF");
  });

  it("un componente sin descripción conserva su cantidad y se avisa", () => {
    const s = sugerirDespiece(padre, [hijo("a", { descripcion: null, item_code: 13.04 })]);
    expect(s.lineas[0].descripcion).toBe("Componente 13.04");
    expect(s.avisosPorLinea[0]).toMatch(/Sin descripción/);
  });

  it("un mueble sin componentes se propone completo, en una sola línea", () => {
    const s = sugerirDespiece(padre, []);
    expect(s.lineas).toEqual([
      { descripcion: "MUEBLE DE PRUEBA", material: "Híbrido", unidad: "PZA", piezas_por_mueble: 1, porcentaje: 100, hijo_id: null },
    ]);
    expect(s.avisos[0]).toMatch(/no tiene componentes/);
  });

  it("avisa si el PM no trae la cantidad del mueble", () => {
    const s = sugerirDespiece({ ...padre, cantidad_total: 0 }, [hijo("a")]);
    expect(s.avisos[0]).toMatch(/no trae la cantidad/);
    expect(s.lineas[0].piezas_por_mueble).toBe(1);
  });

  it("no pasa del máximo de líneas", () => {
    const muchos = Array.from({ length: MAX_LINEAS + 5 }, (_, i) =>
      hijo(`h${i}`, { item_code: 13 + (i + 1) / 1000, descripcion: `PIEZA ${i}` })
    );
    const s = sugerirDespiece(padre, muchos);
    expect(s.lineas).toHaveLength(MAX_LINEAS);
    expect(s.avisosPorLinea).toHaveLength(MAX_LINEAS);
    expect(s.avisos.some((a) => a.includes("se cortó"))).toBe(true);
    expect(s.cortada).toBe(true);
  });

  it("no marca como cortada una sugerencia completa", () => {
    expect(sugerirDespiece(padre, [hijo("a")]).cortada).toBe(false);
  });

  it("unifica la unidad escrita de distintas formas", () => {
    const s = sugerirDespiece(padre, [hijo("a", { unidad: "pzas." })]);
    expect(s.lineas[0].unidad).toBe("PZA");
  });
});

describe("etiquetaUnidad", () => {
  it("unifica sinónimos y deja el resto en mayúsculas", () => {
    expect(etiquetaUnidad("pza")).toBe("PZA");
    expect(etiquetaUnidad(" Pzas. ")).toBe("PZA");
    expect(etiquetaUnidad("pieza")).toBe("PZA");
    expect(etiquetaUnidad("jgo")).toBe("JUEGO");
    expect(etiquetaUnidad("m²")).toBe("M2");
    expect(etiquetaUnidad("tramo")).toBe("TRAMO");
    expect(etiquetaUnidad("  ")).toBeNull();
    expect(etiquetaUnidad(null)).toBeNull();
  });
});

describe("totalLinea", () => {
  it("multiplica las piezas de un mueble por la cantidad de muebles", () => {
    expect(totalLinea(3, 3)).toBe(9);
    expect(totalLinea(1, 3)).toBe(3);
    expect(totalLinea(0.1, 3)).toBe(0.3);
    expect(totalLinea(2, 0)).toBe(0);
  });
});

describe("etiquetaMaterial", () => {
  it("normaliza mayúsculas, acentos y la superficie sólida", () => {
    expect(etiquetaMaterial("MADERA")).toBe("Madera");
    expect(etiquetaMaterial("hibrido")).toBe("Híbrido");
    expect(etiquetaMaterial("S.S.")).toBe("Superficie sólida");
    expect(etiquetaMaterial(" ss ")).toBe("Superficie sólida");
    expect(etiquetaMaterial("ACRÍLICO")).toBe("Acrílico");
    expect(etiquetaMaterial("  ")).toBeNull();
    expect(etiquetaMaterial(null)).toBeNull();
  });
});

const lineaBase: LineaDespiece = {
  descripcion: "TABLERO",
  material: "Madera",
  unidad: "PZA",
  piezas_por_mueble: 3,
  hijo_id: "a",
};

describe("validarLineas", () => {
  it("acepta un despiece correcto", () => {
    expect(validarLineas([lineaBase])).toBeNull();
  });

  it("pide al menos una línea", () => {
    expect(validarLineas([])).toMatch(/al menos una línea/);
  });

  it("señala la línea con el problema", () => {
    expect(validarLineas([lineaBase, { ...lineaBase, descripcion: "   " }])).toBe("Línea 2: escribe la descripción.");
    expect(validarLineas([{ ...lineaBase, piezas_por_mueble: 0 }])).toMatch(/Línea 1: la cantidad por mueble/);
    expect(validarLineas([{ ...lineaBase, piezas_por_mueble: Number.NaN }])).toMatch(/Línea 1: la cantidad por mueble/);
    expect(validarLineas([{ ...lineaBase, piezas_por_mueble: -2 }])).toMatch(/mayor que cero/);
    expect(validarLineas([{ ...lineaBase, piezas_por_mueble: 1_000_000 }])).toMatch(/demasiado grande/);
  });

  it("no deja el mismo componente del PM en dos líneas", () => {
    expect(validarLineas([lineaBase, { ...lineaBase, descripcion: "OTRO" }])).toBe(
      "Línea 2: ese componente del PM ya está en otra línea."
    );
    expect(validarLineas([lineaBase, { ...lineaBase, hijo_id: null }, { ...lineaBase, hijo_id: null }])).toBeNull();
  });

  it("rechaza demasiadas líneas", () => {
    expect(validarLineas(Array.from({ length: MAX_LINEAS + 1 }, () => lineaBase))).toMatch(/no puede pasar/);
  });
});

describe("limpiarLineas y mismasLineas", () => {
  it("limpia espacios y redondea a dos decimales", () => {
    expect(
      limpiarLineas([{ descripcion: "  TABLERO   MDF ", material: " ", unidad: "", piezas_por_mueble: 1.005, hijo_id: null }])
    ).toEqual([
      { id: null, descripcion: "TABLERO MDF", material: null, unidad: null, piezas_por_mueble: 1.01, porcentaje: null, hijo_id: null },
    ]);
  });

  it("conserva el id de la parte para que no pierda sus asignaciones", () => {
    expect(limpiarLineas([{ ...lineaBase, id: "parte-1" }])[0].id).toBe("parte-1");
  });

  it("unifica la unidad y los materiales conocidos pero respeta lo que escribe la persona", () => {
    const [l] = limpiarLineas([
      { descripcion: "X", material: "metal", unidad: "pzas", piezas_por_mueble: 1, hijo_id: null },
    ]);
    expect(l.material).toBe("Metal");
    expect(l.unidad).toBe("PZA");
    expect(limpiarLineas([{ ...lineaBase, material: "MDF 18mm RH" }])[0].material).toBe("MDF 18mm RH");
  });

  it("reconoce la sugerencia guardada tal cual y detecta cualquier cambio", () => {
    expect(mismasLineas([lineaBase], [{ ...lineaBase, descripcion: " TABLERO " }])).toBe(true);
    expect(mismasLineas([lineaBase], [{ ...lineaBase, piezas_por_mueble: 4 }])).toBe(false);
    expect(mismasLineas([lineaBase], [{ ...lineaBase, hijo_id: null }])).toBe(false);
    expect(mismasLineas([lineaBase], [lineaBase, lineaBase])).toBe(false);
  });
});

describe("porcentajes del despiece", () => {
  it("reparte el 100 % en partes iguales y lo que sobra va en la última", () => {
    expect(repartirPorcentajes(3)).toEqual([33.33, 33.33, 33.34]);
    expect(repartirPorcentajes(1)).toEqual([100]);
    expect(repartirPorcentajes(0)).toEqual([]);
  });
  it("exige el % en todas las líneas o en ninguna, y que sume 100", () => {
    expect(validarLineas([lineaBase, { ...lineaBase, hijo_id: null }])).toBeNull();
    expect(validarLineas([{ ...lineaBase, porcentaje: 60 }, { ...lineaBase, hijo_id: null, porcentaje: 40 }])).toBeNull();
    expect(validarLineas([{ ...lineaBase, porcentaje: 60 }, { ...lineaBase, hijo_id: null }])).toMatch(/todas las líneas/);
    expect(validarLineas([{ ...lineaBase, porcentaje: 60 }, { ...lineaBase, hijo_id: null, porcentaje: 30 }])).toMatch(/suman 90/);
  });
  it("un cambio de % cuenta como cambio del despiece", () => {
    expect(mismasLineas([{ ...lineaBase, porcentaje: 50 }], [{ ...lineaBase, porcentaje: 60 }])).toBe(false);
  });
});

describe("leerCantidad", () => {
  it("acepta coma o punto y devuelve NaN si no es un número", () => {
    expect(leerCantidad("2")).toBe(2);
    expect(leerCantidad(" 1,5 ")).toBe(1.5);
    expect(leerCantidad("")).toBeNaN();
    expect(leerCantidad("abc")).toBeNaN();
  });
});

describe("lineasDesdeJson", () => {
  it("lee las líneas guardadas y descarta lo que no es una línea", () => {
    expect(
      lineasDesdeJson([
        { id: "p1", descripcion: "TABLERO", material: "Madera", unidad: null, piezas_por_mueble: 3, hijo_id: "a" },
        "basura",
        null,
        { piezas_por_mueble: "2" },
      ])
    ).toEqual([
      { id: "p1", descripcion: "TABLERO", material: "Madera", unidad: null, piezas_por_mueble: 3, porcentaje: null, hijo_id: "a" },
      { id: null, descripcion: "", material: null, unidad: null, piezas_por_mueble: 2, porcentaje: null, hijo_id: null },
    ]);
    expect(lineasDesdeJson(null)).toEqual([]);
    expect(lineasDesdeJson({})).toEqual([]);
  });
});

describe("diferenciasConPm", () => {
  const base = basePmDesdeJson({
    muebles: 3,
    hijos: [
      { id: "a", item_code: 13.01, descripcion: "TABLERO", cantidad_x_mueble: 1, cantidad_total: 3 },
      { id: "b", item_code: 13.02, descripcion: "ESTRUCTURA", cantidad_x_mueble: 2, cantidad_total: 6 },
    ],
  });
  const hijosIguales = [
    hijo("a", { item_code: 13.01, cantidad_x_mueble: 1, cantidad_total: 3 }),
    hijo("b", { item_code: 13.02, cantidad_x_mueble: 2, cantidad_total: 6 }),
  ];

  it("no avisa si el PM sigue igual o si no hay foto del PM", () => {
    expect(diferenciasConPm(base, padre, hijosIguales)).toEqual([]);
    expect(diferenciasConPm(null, padre, hijosIguales)).toEqual([]);
  });

  it("avisa de la cantidad del mueble, componentes nuevos, quitados y cantidades distintas", () => {
    const difs = diferenciasConPm(base, { ...padre, cantidad_total: 5 }, [
      hijo("a", { item_code: 13.01, cantidad_x_mueble: 4, cantidad_total: 12 }),
      hijo("c", { item_code: 13.03, descripcion: "NUEVO" }),
      hijo("b", { item_code: 13.02, estado_revision: "cancelado" }),
    ]);
    expect(difs).toHaveLength(4);
    expect(difs[0]).toMatch(/pasó de 3 a 5/);
    expect(difs.some((d) => /Cambió la cantidad del componente 13.01/.test(d))).toBe(true);
    expect(difs.some((d) => /nuevo en el PM: 13.03/.test(d))).toBe(true);
    expect(difs.some((d) => /13.02.*ya no está vigente/.test(d))).toBe(true);
  });

  it("basePmDesdeJson descarta lo que no tiene forma", () => {
    expect(basePmDesdeJson(null)).toBeNull();
    expect(basePmDesdeJson({ muebles: 1 })).toBeNull();
    expect(basePmDesdeJson({ muebles: 2, hijos: [null, { id: 5 }, { id: "x" }] })?.hijos).toHaveLength(1);
  });
});

describe("lineasConComponenteCaido", () => {
  it("encuentra las líneas ligadas a un componente que ya no está vigente", () => {
    const lineas: LineaDespiece[] = [
      { ...lineaBase, hijo_id: "a" },
      { ...lineaBase, hijo_id: "b" },
      { ...lineaBase, hijo_id: null },
    ];
    expect(lineasConComponenteCaido(lineas, [hijo("a"), hijo("b", { estado_revision: "cancelado" })])).toEqual([1]);
  });
});

describe("trasladarLineas", () => {
  it("vuelve a ligar cada línea al componente con el mismo número de ítem", () => {
    const lineas: LineaDespiece[] = [
      { ...lineaBase, hijo_id: "viejo1" },
      { ...lineaBase, hijo_id: "viejo2" },
      { ...lineaBase, hijo_id: "viejo3" },
      { ...lineaBase, hijo_id: null },
    ];
    const r = trasladarLineas(
      lineas,
      [
        { id: "viejo1", item_code: 13.01 },
        { id: "viejo2", item_code: 13.02 },
        { id: "viejo3", item_code: 13.03 },
      ],
      [
        { id: "nuevo1", item_code: 13.01 },
        // Dos con el mismo número: ambiguo, queda sin ligar.
        { id: "nuevo2a", item_code: 13.02 },
        { id: "nuevo2b", item_code: 13.02 },
      ]
    );
    expect(r.map((l) => l.hijo_id)).toEqual(["nuevo1", null, null, null]);
    expect(r[0].descripcion).toBe("TABLERO");
  });
});
