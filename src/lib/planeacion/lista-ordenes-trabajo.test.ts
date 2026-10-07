import { describe, expect, it } from "vitest";
import {
  agruparPorOrdenTrabajo,
  anioDePedido,
  filtrarOrdenesTrabajo,
  hrefListaPedidos,
  ultimaEntrega,
  type PedidoConOt,
} from "./lista-ordenes-trabajo";

function pm(numero: string, extra: Partial<PedidoConOt> = {}): PedidoConOt {
  const ot = numero.match(/PM\s*(\d+-\d{2})/i)?.[1] ?? null;
  return {
    id: numero,
    numero_pedido: numero,
    orden_trabajo: ot,
    fecha_pedido: null,
    fecha_entrega: null,
    created_at: "2025-06-01T00:00:00Z",
    proyectos: { nombre: "PROYECTO", cliente: "Palacio  de hierro" },
    ...extra,
  };
}

describe("agruparPorOrdenTrabajo", () => {
  it("junta los PM de la misma O.T. donde aparece el más reciente", () => {
    const filas = agruparPorOrdenTrabajo([pm("2PM134-26"), pm("PM200-26"), pm("1PM134-26"), pm("SIN-OT")]);
    expect(filas.map((f) => [f.ot, f.pedidos.map((p) => p.numero_pedido)])).toEqual([
      ["134-26", ["2PM134-26", "1PM134-26"]],
      ["200-26", ["PM200-26"]],
      [null, ["SIN-OT"]],
    ]);
  });
});

describe("anioDePedido", () => {
  it("usa el sufijo de la O.T. y, sin O.T., la fecha", () => {
    expect(anioDePedido(pm("1PM134-26"))).toBe(2026);
    expect(anioDePedido(pm("SIN-OT", { fecha_pedido: "2024-03-01" }))).toBe(2024);
    expect(anioDePedido(pm("SIN-OT"))).toBe(2025);
  });
});

describe("filtrarOrdenesTrabajo", () => {
  const pedidos = [
    pm("1PM134-26", { proyectos: { nombre: "REMODELACIÓN", cliente: "Palacio de Hierro" } }),
    pm("1PM090-25", { proyectos: { nombre: "TIENDA", cliente: "LIVERPOOL" } }),
  ];
  it("filtra por año, cliente normalizado y búsqueda", () => {
    expect(filtrarOrdenesTrabajo(pedidos, { anio: 2026, cliente: "", busqueda: "" }).filas).toHaveLength(1);
    expect(
      filtrarOrdenesTrabajo(pedidos, { anio: null, cliente: "PALACIO DE HIERRO", busqueda: "" }).filas[0].ot
    ).toBe("134-26");
    expect(filtrarOrdenesTrabajo(pedidos, { anio: null, cliente: "", busqueda: "tienda" }).filas[0].ot).toBe(
      "090-25"
    );
  });
  it("lista años y clientes disponibles", () => {
    const r = filtrarOrdenesTrabajo(pedidos, { anio: null, cliente: "", busqueda: "" });
    expect(r.aniosDisponibles).toEqual([2026, 2025]);
    expect(r.clientesDisponibles).toEqual(["LIVERPOOL", "PALACIO DE HIERRO"]);
  });
});

describe("ultimaEntrega y hrefListaPedidos", () => {
  it("toma la fecha de entrega más tardía", () => {
    expect(
      ultimaEntrega([pm("1PM1-26", { fecha_entrega: "2026-03-01" }), pm("2PM1-26", { fecha_entrega: "2026-05-01" })])
    ).toBe("2026-05-01");
    expect(ultimaEntrega([pm("1PM1-26")])).toBeNull();
  });
  it("conserva los filtros en el enlace", () => {
    expect(hrefListaPedidos("/produccion", {})).toBe("/produccion");
    expect(hrefListaPedidos("/produccion", { q: "x", anio: "2026" })).toBe("/produccion?q=x&anio=2026");
  });
  it("conserva también el filtro de entrega", () => {
    expect(hrefListaPedidos("/planeacion", { anio: "2026", entrega: "semana" })).toBe(
      "/planeacion?anio=2026&entrega=semana"
    );
    expect(hrefListaPedidos("/planeacion", { entrega: "sin-fecha" })).toBe("/planeacion?entrega=sin-fecha");
  });
});
