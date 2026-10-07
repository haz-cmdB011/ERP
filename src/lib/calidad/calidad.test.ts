import { describe, expect, it } from "vitest";
import { CATEGORIAS_DEFECTO, esCategoriaDefecto, nombreCategoria } from "./categorias";
import { detallePorEvaluar, resumirCalidad } from "./resumen";
import { porInspeccionar, type EntregaDeItem } from "./inspeccion";
import { hrefFolios, leerFiltrosFolios, rangoDeInstantes } from "./folios-filtros";
import { cambiosDesdeLaPantalla, mensajeEvaluacionNueva } from "./verificar-evaluacion";

const AHORA = new Date("2026-10-07T18:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();

describe("categorías", () => {
  it("reconoce solo las de la lista", () => {
    expect(esCategoriaDefecto("acabado")).toBe(true);
    expect(esCategoriaDefecto("otra")).toBe(false);
    expect(esCategoriaDefecto(null)).toBe(false);
    expect(nombreCategoria("dano")).toBe("Daño");
    expect(nombreCategoria("x")).toBeNull();
    expect(new Set(CATEGORIAS_DEFECTO.map((c) => c.valor)).size).toBe(CATEGORIAS_DEFECTO.length);
  });
});

describe("resumirCalidad", () => {
  const items = [
    { id: "a", pedidoId: "p1", liberadoEn: hace(10) },
    { id: "b", pedidoId: "p1", liberadoEn: hace(1) },
    { id: "c", pedidoId: "p2", liberadoEn: hace(5) },
    { id: "d", pedidoId: "p2", liberadoEn: hace(2) },
  ];
  const informes = [
    { itemId: "c", aprobado: false, elaboradoEn: hace(4) },
    { itemId: "d", aprobado: false, elaboradoEn: hace(3) },
    { itemId: "d", aprobado: true, elaboradoEn: hace(1) }, // el último manda
    { itemId: "z", aprobado: true, elaboradoEn: hace(60) }, // fuera de los 30 días
  ];
  const r = resumirCalidad(items, informes, AHORA);

  it("cuenta por evaluar, antiguos y el más antiguo", () => {
    expect(r.liberados).toBe(4);
    expect(r.porEvaluar).toBe(2);
    expect(r.antiguos).toBe(1);
    expect(r.masAntiguoDias).toBe(10);
  });

  it("un rechazado cuyo último informe no aprobó espera reinspección; uno re-aprobado ya no", () => {
    expect(r.porReinspeccionar).toBe(1);
    expect(r.porPedido.get("p2")).toEqual({ liberados: 2, evaluados: 2, porEvaluar: 0, porReinspeccionar: 1, antiguos: 0 });
    expect(r.porPedido.get("p1")).toEqual({ liberados: 2, evaluados: 0, porEvaluar: 2, porReinspeccionar: 0, antiguos: 1 });
    expect(r.evaluados).toBe(2);
  });

  it("la tasa de aprobación usa solo los últimos 30 días", () => {
    expect(r.evaluaciones30d).toBe(3);
    expect(r.tasaAprobacion).toBe(33);
  });

  it("sin evaluaciones no inventa una tasa", () => {
    expect(resumirCalidad([], [], AHORA)).toMatchObject({ tasaAprobacion: null, masAntiguoDias: null, porEvaluar: 0 });
  });

  it("detallePorEvaluar resume la antigüedad", () => {
    expect(detallePorEvaluar(r)).toBe("1 con 3 días o más · el más antiguo espera 10 días");
    expect(detallePorEvaluar(resumirCalidad([], [], AHORA))).toBe("todo lo liberado está evaluado");
  });
});

describe("porInspeccionar", () => {
  const e = (extra: Partial<EntregaDeItem>): EntregaDeItem => ({
    itemId: "i1",
    pedidoId: "p",
    numeroPedido: "PM-1",
    modelo: "M",
    itemCode: 1,
    entregado: 5,
    asignado: 10,
    unidad: "pz",
    ultimaEntrega: "2026-10-05",
    ...extra,
  });

  it("incluye lo nunca evaluado, lo rechazado y lo entregado después de evaluar", () => {
    const informes = new Map([
      ["rechazado", { aprobado: false, elaboradoEn: "2026-10-04T15:00:00Z" }],
      ["viejo", { aprobado: true, elaboradoEn: "2026-10-01T15:00:00Z" }],
      ["al-dia", { aprobado: true, elaboradoEn: "2026-10-06T15:00:00Z" }],
    ]);
    const lista = porInspeccionar(
      [
        e({ itemId: "nuevo" }),
        e({ itemId: "rechazado" }),
        e({ itemId: "viejo" }),
        e({ itemId: "al-dia" }),
        e({ itemId: "sin-entrega", entregado: 0 }),
      ],
      informes
    );
    expect(lista.map((x) => [x.itemId, x.motivo])).toEqual([
      ["nuevo", "sin_evaluar"],
      ["rechazado", "reinspeccion"],
      ["viejo", "entrega_nueva"],
    ]);
  });

  it("una entrega el mismo día de la evaluación (hora de México) no cuenta como nueva", () => {
    // 2026-10-06 22:00 UTC = 16:00 en México, el mismo día de la entrega.
    const informes = new Map([["i1", { aprobado: true, elaboradoEn: "2026-10-06T22:00:00Z" }]]);
    expect(porInspeccionar([e({ ultimaEntrega: "2026-10-06" })], informes)).toEqual([]);
  });

  it("ordena por la entrega más antigua primero", () => {
    const lista = porInspeccionar(
      [e({ itemId: "b", ultimaEntrega: "2026-10-06" }), e({ itemId: "a", ultimaEntrega: "2026-10-02" })],
      new Map()
    );
    expect(lista.map((x) => x.itemId)).toEqual(["a", "b"]);
  });
});

describe("filtros de folios", () => {
  it("lee y limpia los parámetros", () => {
    expect(leerFiltrosFolios({ q: " CAL-1 ", estado: "no_aprobados", desde: "2026-10-01", hasta: "2026-10-05", categoria: "dano", pagina: "2" })).toEqual({
      q: "CAL-1",
      estado: "no_aprobados",
      desde: "2026-10-01",
      hasta: "2026-10-05",
      categoria: "dano",
      pagina: 2,
    });
    expect(leerFiltrosFolios({ estado: "x", desde: "2026-13-40", categoria: "nada", pagina: "0" })).toMatchObject({
      estado: "todos",
      desde: null,
      categoria: null,
      pagina: 1,
    });
  });

  it("acomoda un rango al revés", () => {
    const f = leerFiltrosFolios({ desde: "2026-10-09", hasta: "2026-10-02" });
    expect([f.desde, f.hasta]).toEqual(["2026-10-02", "2026-10-09"]);
  });

  it("los días de México van de las 00:00 a las 24:00 en UTC-6", () => {
    expect(rangoDeInstantes({ desde: "2026-10-01", hasta: "2026-10-01" })).toEqual({
      inicio: "2026-10-01T06:00:00.000Z",
      fin: "2026-10-02T06:00:00.000Z",
    });
    expect(rangoDeInstantes({ desde: null, hasta: null })).toEqual({ inicio: null, fin: null });
  });

  it("arma el enlace sin lo vacío", () => {
    expect(hrefFolios({})).toBe("/calidad/folios");
    expect(hrefFolios({ estado: "aprobados", desde: "2026-10-01", pagina: 3 })).toBe(
      "/calidad/folios?estado=aprobados&desde=2026-10-01&pagina=3"
    );
  });
});

describe("verificar evaluación", () => {
  const inf = (id: string, folio: string, extra = {}) => ({
    id,
    folio,
    aprobado: true,
    elaboradoEn: hace(0.01),
    ...extra,
  });

  it("detecta los ítems con un informe distinto al que mostraba la pantalla", () => {
    const vistos = new Map<string, string | null>([
      ["a", null], // la pantalla no tenía informe
      ["b", "i1"], // seguía en i1
      ["c", "i2"], // seguía en i2
      ["d", null],
    ]);
    const actuales = new Map([
      ["a", inf("i9", "CAL-9")], // alguien evaluó
      ["b", inf("i1", "CAL-1")], // sin cambio
      ["c", inf("i3", "CAL-3")], // alguien volvió a evaluar
    ]);
    expect(cambiosDesdeLaPantalla(vistos, actuales).map((c) => c.itemId)).toEqual(["a", "c"]);
  });

  it("sin cambios no hay nada que avisar", () => {
    expect(cambiosDesdeLaPantalla(new Map([["a", null]]), new Map())).toEqual([]);
  });

  it("el mensaje dice quién, cuándo y cuántos", () => {
    const cambios = cambiosDesdeLaPantalla(new Map([["a", null]]), new Map([["a", inf("i9", "CAL-000009", { aprobado: false, elaboradoEn: new Date(AHORA.getTime() - 120_000).toISOString() })]]));
    const texto = mensajeEvaluacionNueva(cambios, () => 12, AHORA);
    expect(texto).toContain("ítem 12: CAL-000009 no aprobado hace 2 min");
    expect(texto).toContain("este ítem");
  });
});
