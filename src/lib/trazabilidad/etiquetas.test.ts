import { describe, expect, it } from "vitest";
import { etiquetasDeMuebles } from "./etiquetas";

describe("etiquetasDeMuebles", () => {
  const muebles = [
    { id: "a", cantidad: 3 },
    { id: "b", cantidad: 1 },
  ];

  it("una por mueble", () => {
    const { etiquetas, recortadas } = etiquetasDeMuebles(muebles, false);
    expect(etiquetas.map((e) => [e.itemId, e.pieza])).toEqual([
      ["a", null],
      ["b", null],
    ]);
    expect(recortadas).toBe(0);
  });

  it("una por pieza, numeradas", () => {
    const { etiquetas } = etiquetasDeMuebles(muebles, true);
    expect(etiquetas.map((e) => `${e.itemId} ${e.pieza?.n}/${e.pieza?.de}`)).toEqual([
      "a 1/3",
      "a 2/3",
      "a 3/3",
      "b 1/1",
    ]);
    expect(new Set(etiquetas.map((e) => e.key)).size).toBe(4);
  });

  it("cantidades fraccionarias o vacías dan al menos una", () => {
    const { etiquetas } = etiquetasDeMuebles(
      [
        { id: "m", cantidad: 2.5 },
        { id: "z", cantidad: 0 },
      ],
      true
    );
    expect(etiquetas.map((e) => e.key)).toEqual(["m-1", "m-2", "m-3", "z-1"]);
  });

  it("respeta el tope y dice cuántas quedaron fuera", () => {
    const { etiquetas, recortadas } = etiquetasDeMuebles([{ id: "x", cantidad: 10 }], true, 4);
    expect(etiquetas).toHaveLength(4);
    expect(recortadas).toBe(6);
  });
});
