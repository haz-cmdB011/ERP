import { describe, expect, it } from "vitest";
import {
  contarPorEstado,
  filtrarMuebles,
  materialesDe,
  padresConHijosCoincidentes,
  type FiltrosItems,
  type ItemFiltrable,
  type MuebleFiltrable,
} from "./filtrar-items";

const sinFiltros: FiltrosItems = { texto: "", material: null, estado: "todos" };

function item(extra: Partial<ItemFiltrable> = {}): ItemFiltrable {
  return { tipo_material: null, modelo: null, estado_revision: null, ...extra };
}

function mueble(id: string, extra: Partial<ItemFiltrable>, hijos: ItemFiltrable[] = []): MuebleFiltrable & { id: string } {
  return { id, ...item(extra), hijos };
}

const silla = mueble("m1", { modelo: "Silla Bruna", tipo_material: "madera" }, [
  item({ modelo: "Pata", tipo_material: "METAL" }),
  item({ modelo: "Respaldo", tipo_material: "TAPIZ", estado_revision: "en_revision" }),
]);
const mesa = mueble("m2", { modelo: "Mesa Norte", tipo_material: "Metal", estado_revision: "en_revision" }, [
  item({ modelo: "Tapa", tipo_material: "MADERA" }),
]);
const todos = [silla, mesa];

describe("filtrarMuebles", () => {
  it("sin filtros muestra todo", () => {
    const r = filtrarMuebles(todos, sinFiltros);
    expect(r.map((x) => x.mueble.id)).toEqual(["m1", "m2"]);
    expect(r[0].hijos).toHaveLength(2);
  });

  it("por texto: si coincide el mueble salen todos sus componentes", () => {
    const r = filtrarMuebles(todos, { ...sinFiltros, texto: "silla" });
    expect(r.map((x) => x.mueble.id)).toEqual(["m1"]);
    expect(r[0].hijos).toHaveLength(2);
  });

  it("por texto: si coincide solo un componente salen el mueble y ese componente", () => {
    const r = filtrarMuebles(todos, { ...sinFiltros, texto: "respaldo" });
    expect(r.map((x) => x.mueble.id)).toEqual(["m1"]);
    expect(r[0].hijos.map((h) => h.modelo)).toEqual(["Respaldo"]);
  });

  it("por material, sin distinguir mayúsculas", () => {
    const r = filtrarMuebles(todos, { ...sinFiltros, material: "METAL" });
    // La silla es de madera pero tiene una pata de metal; la mesa es de metal.
    expect(r.map((x) => x.mueble.id)).toEqual(["m1", "m2"]);
    expect(r[0].hijos.map((h) => h.modelo)).toEqual(["Pata"]);
    expect(r[1].hijos).toHaveLength(1);
  });

  it("por estado de revisión", () => {
    const enRevision = filtrarMuebles(todos, { ...sinFiltros, estado: "en_revision" });
    expect(enRevision.map((x) => x.mueble.id)).toEqual(["m1", "m2"]);
    expect(enRevision[0].hijos.map((h) => h.modelo)).toEqual(["Respaldo"]);
    const normales = filtrarMuebles(todos, { ...sinFiltros, estado: "normal" });
    expect(normales.map((x) => x.mueble.id)).toEqual(["m1", "m2"]);
    expect(normales[1].mueble.id).toBe("m2");
    expect(normales[1].hijos.map((h) => h.modelo)).toEqual(["Tapa"]);
  });

  it("combina todos los filtros a la vez", () => {
    const r = filtrarMuebles(todos, { texto: "mesa", material: "METAL", estado: "en_revision" });
    expect(r.map((x) => x.mueble.id)).toEqual(["m2"]);
    expect(filtrarMuebles(todos, { texto: "mesa", material: "TAPIZ", estado: "todos" })).toEqual([]);
  });
});

describe("padresConHijosCoincidentes", () => {
  it("abre los muebles con un componente que cumple el filtro", () => {
    expect(padresConHijosCoincidentes(todos, { ...sinFiltros, texto: "respaldo" })).toEqual(new Set(["m1"]));
    expect(padresConHijosCoincidentes(todos, { ...sinFiltros, material: "MADERA" })).toEqual(new Set(["m2"]));
  });

  it("sin filtros no abre nada", () => {
    expect(padresConHijosCoincidentes(todos, sinFiltros)).toEqual(new Set());
  });
});

describe("materialesDe / contarPorEstado", () => {
  it("junta los materiales de muebles y componentes, en mayúsculas y ordenados", () => {
    expect(materialesDe(todos)).toEqual(["MADERA", "METAL", "TAPIZ"]);
    expect(materialesDe([mueble("x", { tipo_material: "  " })])).toEqual([]);
  });

  it("cuenta lo que está en revisión y lo normal", () => {
    expect(contarPorEstado(todos)).toEqual({ enRevision: 2, normales: 3 });
  });
});
