import { describe, expect, it } from "vitest";
import { imagenesHeredadas, type ImagenDeHijoRow } from "./imagenes";

const hija = (padre: string | null, fila: number | null, ruta: string, orden = 0): ImagenDeHijoRow => ({
  storage_path: ruta,
  orden,
  planeacion_items: { parent_item_id: padre, fila_excel_origen: fila },
});

describe("imagenesHeredadas", () => {
  it("el mueble toma la imagen de su primer componente con imagen (fila más arriba)", () => {
    const r = imagenesHeredadas([hija("P1", 14, "c.webp"), hija("P1", 12, "a.webp"), hija("P2", 20, "x.webp")]);
    expect(r).toEqual([
      { planeacion_item_id: "P1", storage_path: "a.webp", orden: 0 },
      { planeacion_item_id: "P2", storage_path: "x.webp", orden: 0 },
    ]);
  });

  it("si ese componente tiene varias imágenes, las trae todas en su orden", () => {
    const r = imagenesHeredadas([hija("P1", 12, "b.webp", 1), hija("P1", 12, "a.webp", 0), hija("P1", 13, "z.webp")]);
    expect(r.map((i) => i.storage_path)).toEqual(["a.webp", "b.webp"]);
  });

  it("ignora imágenes sin padre o sin la relación", () => {
    expect(imagenesHeredadas([hija(null, 5, "a.webp"), { storage_path: "b.webp", orden: 0, planeacion_items: null }])).toEqual([]);
  });

  it("sin filas devuelve vacío", () => {
    expect(imagenesHeredadas([])).toEqual([]);
  });
});
