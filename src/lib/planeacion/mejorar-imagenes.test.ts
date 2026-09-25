import { describe, expect, it } from "vitest";
import { emparejarImagenes, enParalelo } from "./mejorar-imagenes";

const img = (t: string) => ({ buffer: Buffer.from(t) });

const itemsGuardados = [
  { id: "a", fila_excel_origen: 11, item_code: 1 },
  { id: "b", fila_excel_origen: 20, item_code: "4.00" },
  { id: "c", fila_excel_origen: null, item_code: 9 },
];
const imagenesGuardadas = [
  { planeacion_item_id: "a", storage_path: "carga/11-0.webp", orden: 0 },
  { planeacion_item_id: "b", storage_path: "carga/20-0.webp", orden: 0 },
  { planeacion_item_id: "b", storage_path: "carga/20-1.webp", orden: 1 },
];

describe("emparejarImagenes", () => {
  it("empareja por fila y posición, incluso con varias imágenes en un ítem", () => {
    const r = emparejarImagenes(itemsGuardados, imagenesGuardadas, [
      { fila_excel_origen: 11, item_code: 1, imagenes: [img("a0")] },
      { fila_excel_origen: 20, item_code: 4, imagenes: [img("b0"), img("b1")] },
    ]);
    expect(r.pares.map((p) => [p.rutaMiniatura, p.buffer.toString()])).toEqual([
      ["carga/11-0.webp", "a0"],
      ["carga/20-0.webp", "b0"],
      ["carga/20-1.webp", "b1"],
    ]);
    expect(r.itemsSinCoincidencia).toBe(0);
    expect(r.imagenesSinRegistro).toBe(0);
  });

  it("descarta la fila si el código de ítem no coincide (Excel de otra versión)", () => {
    const r = emparejarImagenes(itemsGuardados, imagenesGuardadas, [
      { fila_excel_origen: 11, item_code: 2, imagenes: [img("x")] },
    ]);
    expect(r.pares).toEqual([]);
    expect(r.itemsSinCoincidencia).toBe(1);
  });

  it("descarta filas que no existen en la versión y cuenta imágenes sin miniatura", () => {
    const r = emparejarImagenes(itemsGuardados, imagenesGuardadas, [
      { fila_excel_origen: 99, item_code: 1, imagenes: [img("x")] },
      { fila_excel_origen: 11, item_code: 1, imagenes: [img("a0"), img("a1")] },
    ]);
    expect(r.pares).toHaveLength(1);
    expect(r.itemsSinCoincidencia).toBe(1);
    expect(r.imagenesSinRegistro).toBe(1);
  });

  it("ignora los ítems del Excel que no traen imágenes", () => {
    const r = emparejarImagenes(itemsGuardados, imagenesGuardadas, [
      { fila_excel_origen: 55, item_code: 7, imagenes: [] },
    ]);
    expect(r).toEqual({ pares: [], itemsSinCoincidencia: 0, imagenesSinRegistro: 0 });
  });
});

describe("enParalelo", () => {
  it("procesa todo sin pasar del límite de tareas simultáneas", async () => {
    let activas = 0;
    let maximo = 0;
    const hechos: number[] = [];
    await enParalelo([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      activas += 1;
      maximo = Math.max(maximo, activas);
      await new Promise((r) => setTimeout(r, 5));
      hechos.push(n);
      activas -= 1;
    });
    expect(hechos.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maximo).toBeLessThanOrEqual(3);
  });
});
