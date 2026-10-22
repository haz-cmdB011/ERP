import { describe, expect, it } from "vitest";
import {
  agregarAlCarrito,
  agruparCarrito,
  leerCarrito,
  MAX_ITEMS_CARRITO,
  quitarDelCarrito,
  type ItemCarrito,
} from "./carrito";

function item(id: string, extra: Partial<ItemCarrito> = {}): ItemCarrito {
  return {
    id,
    tipo: "MO",
    itemCode: 1,
    modelo: null,
    descripcion: null,
    cantidad: 1,
    unidad: "PZA",
    padreId: null,
    pedidoId: "p1",
    numeroPm: "PM-1",
    ot: "102-24",
    ...extra,
  };
}

describe("carrito de Producción", () => {
  it("no repite un ítem ya agregado", () => {
    const a = agregarAlCarrito([], [item("a"), item("b")]);
    expect(agregarAlCarrito(a, [item("b"), item("c")]).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("respeta el tope", () => {
    const muchos = Array.from({ length: MAX_ITEMS_CARRITO + 10 }, (_, n) => item(`i${n}`));
    expect(agregarAlCarrito([], muchos)).toHaveLength(MAX_ITEMS_CARRITO);
  });

  it("quitar un mueble no quita sus componentes", () => {
    const base = [item("m"), item("c", { tipo: "FU", padreId: "m" })];
    expect(quitarDelCarrito(base, ["m"]).map((i) => i.id)).toEqual(["c"]);
  });

  it("agrupa por O.T. y PM, con cada mueble seguido de sus componentes", () => {
    const grupos = agruparCarrito([
      item("h2", { tipo: "FU", itemCode: 12, padreId: "m1", pedidoId: "p2", numeroPm: "PM-10", ot: "9-24" }),
      item("m1", { itemCode: 10, pedidoId: "p2", numeroPm: "PM-10", ot: "9-24" }),
      item("x", { pedidoId: "p3", numeroPm: "PM-2", ot: null }),
      item("m0", { itemCode: 5, pedidoId: "p1", numeroPm: "PM-9", ot: "9-24" }),
      item("h1", { tipo: "FU", itemCode: 11, padreId: "m1", pedidoId: "p2", numeroPm: "PM-10", ot: "9-24" }),
    ]);
    expect(grupos.map((g) => g.ot)).toEqual(["9-24", null]);
    expect(grupos[0].pms.map((p) => p.numeroPm)).toEqual(["PM-9", "PM-10"]);
    expect(grupos[0].pms[1].items.map((i) => i.id)).toEqual(["m1", "h1", "h2"]);
    expect(grupos[0].total).toBe(4);
  });

  it("lee solo lo válido del almacenamiento", () => {
    expect(leerCarrito(null)).toEqual([]);
    expect(leerCarrito("no es json")).toEqual([]);
    expect(leerCarrito('{"a":1}')).toEqual([]);
    expect(leerCarrito(JSON.stringify([item("a"), { id: 3 }, null]))).toEqual([item("a")]);
  });
});
