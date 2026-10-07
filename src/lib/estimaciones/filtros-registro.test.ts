import { describe, expect, it } from "vitest";
import {
  contratistasDe,
  filtrarRecibos,
  hrefRegistro,
  leerFiltroRegistroGuardado,
  leerFiltros,
  ordenarParaRevision,
  paginar,
  valorFiltroRegistro,
  type FiltrosRegistro,
} from "./filtros-registro";
import type { ReciboListado } from "./listado-recibos";

const r = (extra: Partial<ReciboListado>): ReciboListado => ({
  id: extra.folio ?? "x",
  estado: "pendiente",
  tipo: "acabados",
  folio: "1",
  fecha: "2026-10-01",
  contratista: "Taller Uno",
  obra: "",
  ot: "",
  prioridad: "normal",
  guardadoEn: "2026-10-01T10:00:00Z",
  numRenglones: 1,
  numPendientes: 1,
  totalPropuesto: 0,
  totalAceptado: 0,
  ...extra,
});

const sin: FiltrosRegistro = { estado: null, q: "", tipo: null, contratista: "", pagina: 1 };

describe("leerFiltros", () => {
  it("acepta valores válidos y descarta los demás", () => {
    expect(leerFiltros({ estado: "pagado", tipo: "armado", q: "  102-24 ", pagina: "3" })).toEqual({
      estado: "pagado",
      tipo: "armado",
      q: "102-24",
      contratista: "",
      pagina: 3,
    });
    expect(leerFiltros({ estado: "raro", tipo: "otro", pagina: "-2" })).toMatchObject({
      estado: null,
      tipo: null,
      pagina: 1,
    });
  });
});

describe("filtrarRecibos", () => {
  const todos = [
    r({ folio: "10", estado: "pendiente", contratista: "Maderas Ñandú", ot: "102-24" }),
    r({ folio: "11", estado: "revisado", tipo: "armado", obra: "Hotel Reforma" }),
    r({ folio: "12", estado: "cancelado" }),
    r({ folio: "13", estado: "pagado", tipo: "electrificacion", contratista: "Luz y Más" }),
  ];

  it("sin estado muestra los vigentes y oculta los cancelados", () => {
    expect(filtrarRecibos(todos, sin).map((x) => x.folio)).toEqual(["10", "11", "13"]);
  });

  it("con estado muestra solo ese, cancelados incluidos", () => {
    expect(filtrarRecibos(todos, { ...sin, estado: "cancelado" }).map((x) => x.folio)).toEqual(["12"]);
  });

  it("busca en folio, contratista, OT y obra sin importar acentos ni mayúsculas", () => {
    expect(filtrarRecibos(todos, { ...sin, q: "nandu" }).map((x) => x.folio)).toEqual(["10"]);
    expect(filtrarRecibos(todos, { ...sin, q: "102-24" }).map((x) => x.folio)).toEqual(["10"]);
    expect(filtrarRecibos(todos, { ...sin, q: "REFORMA" }).map((x) => x.folio)).toEqual(["11"]);
    expect(filtrarRecibos(todos, { ...sin, q: "13" }).map((x) => x.folio)).toEqual(["13"]);
  });

  it("filtra por tipo y por contratista exacto", () => {
    expect(filtrarRecibos(todos, { ...sin, tipo: "armado" }).map((x) => x.folio)).toEqual(["11"]);
    expect(filtrarRecibos(todos, { ...sin, contratista: "luz y mas" }).map((x) => x.folio)).toEqual(["13"]);
  });
});

describe("ordenarParaRevision", () => {
  it("pone lo urgente primero y, a igual prioridad, lo más antiguo", () => {
    const orden = ordenarParaRevision([
      r({ folio: "1", prioridad: "normal", guardadoEn: "2026-10-01T00:00:00Z" }),
      r({ folio: "2", prioridad: "urgente", guardadoEn: "2026-10-05T00:00:00Z" }),
      r({ folio: "3", prioridad: "urgente", guardadoEn: "2026-10-03T00:00:00Z" }),
      r({ folio: "4", prioridad: "preferente", guardadoEn: "2026-09-01T00:00:00Z" }),
    ]);
    expect(orden.map((x) => x.folio)).toEqual(["3", "2", "4", "1"]);
  });
});

describe("paginar", () => {
  const items = Array.from({ length: 120 }, (_, i) => i);
  it("parte en páginas de 50", () => {
    const p = paginar(items, 3);
    expect(p).toMatchObject({ pagina: 3, totalPaginas: 3, total: 120 });
    expect(p.items).toHaveLength(20);
  });
  it("corrige una página fuera de rango y tolera listas vacías", () => {
    expect(paginar(items, 99).pagina).toBe(3);
    expect(paginar([], 1)).toMatchObject({ pagina: 1, totalPaginas: 1, items: [] });
  });
});

describe("hrefRegistro y filtro recordado", () => {
  it("omite lo vacío y la página 1", () => {
    expect(hrefRegistro({})).toBe("/estimaciones/registro");
    expect(hrefRegistro({ estado: "pagado", q: "a b", pagina: 1 })).toBe("/estimaciones/registro?estado=pagado&q=a+b");
    expect(hrefRegistro({ pagina: 2 })).toBe("/estimaciones/registro?pagina=2");
  });

  it("guarda y lee tipo y contratista, aunque llegue codificado", () => {
    const valor = valorFiltroRegistro({ tipo: "armado", contratista: "Taller Uno" });
    expect(leerFiltroRegistroGuardado(valor)).toEqual({ tipo: "armado", contratista: "Taller Uno" });
    expect(leerFiltroRegistroGuardado(encodeURIComponent(valor))).toEqual({ tipo: "armado", contratista: "Taller Uno" });
  });

  it("ignora cookies vacías o inválidas", () => {
    expect(leerFiltroRegistroGuardado(undefined)).toBeNull();
    expect(leerFiltroRegistroGuardado("tipo=nada")).toBeNull();
  });

  it("lista los contratistas sin repetir y en orden", () => {
    expect(contratistasDe([r({ contratista: "b" }), r({ contratista: "A" }), r({ contratista: "b" })])).toEqual(["A", "b"]);
  });
});
