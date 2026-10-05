import { describe, expect, it } from "vitest";
import { estadoEntrega } from "./entrega";
import {
  agruparAvance,
  estadoCalidad,
  estadoLiberacion,
  sumarAvance,
  type ItemAvance,
} from "./avance-items";

describe("estadoEntrega", () => {
  const hoy = "2026-10-05";
  it("clasifica por días a la fecha", () => {
    expect(estadoEntrega("2026-10-05", hoy)).toBe("semana");
    expect(estadoEntrega("2026-10-12", hoy)).toBe("semana");
    expect(estadoEntrega("2026-10-13", hoy)).toBe("mes");
    expect(estadoEntrega("2026-11-04", hoy)).toBe("mes");
    expect(estadoEntrega("2026-11-05", hoy)).toBe("futura");
    expect(estadoEntrega("2026-10-04", hoy)).toBe("pasada");
  });
  it("sin fecha o fecha inválida", () => {
    expect(estadoEntrega(null, hoy)).toBe("sin-fecha");
    expect(estadoEntrega("", hoy)).toBe("sin-fecha");
    expect(estadoEntrega("no-es-fecha", hoy)).toBe("sin-fecha");
  });
  it("acepta marcas de tiempo completas", () => {
    expect(estadoEntrega("2026-10-06T00:00:00", hoy)).toBe("semana");
  });
});

describe("avance de ítems", () => {
  const items: ItemAvance[] = [
    { id: "1", pedidoId: "A", liberado: true },
    { id: "2", pedidoId: "A", liberado: true },
    { id: "3", pedidoId: "A", liberado: false },
    { id: "4", pedidoId: "B", liberado: false },
    { id: "5", pedidoId: "C", liberado: true },
  ];
  const mapa = agruparAvance(items, new Set(["1", "5"]));

  it("agrupa por pedido", () => {
    expect(mapa.get("A")).toEqual({ total: 3, liberados: 2, porLiberar: 1, evaluados: 1, porEvaluar: 1 });
    expect(mapa.get("B")).toEqual({ total: 1, liberados: 0, porLiberar: 1, evaluados: 0, porEvaluar: 0 });
  });
  it("suma los totales", () => {
    expect(sumarAvance(mapa)).toEqual({ total: 5, liberados: 3, porLiberar: 2, evaluados: 2, porEvaluar: 1 });
  });
  it("estado de liberación", () => {
    expect(estadoLiberacion(mapa.get("A"))).toBe("en-proceso");
    expect(estadoLiberacion(mapa.get("B"))).toBe("sin-liberar");
    expect(estadoLiberacion(mapa.get("C"))).toBe("liberado");
    expect(estadoLiberacion(undefined)).toBe("sin-items");
  });
  it("estado de calidad", () => {
    expect(estadoCalidad(mapa.get("A"))).toBe("en-proceso");
    expect(estadoCalidad(mapa.get("B"))).toBe("sin-liberados");
    expect(estadoCalidad(mapa.get("C"))).toBe("evaluado");
    const sinEvaluar = agruparAvance([{ id: "9", pedidoId: "D", liberado: true }], new Set());
    expect(estadoCalidad(sinEvaluar.get("D"))).toBe("sin-evaluar");
  });
});
