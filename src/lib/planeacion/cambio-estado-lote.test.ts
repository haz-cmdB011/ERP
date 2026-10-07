import { describe, expect, it } from "vitest";
import { agruparParaDeshacer, leerCambioLote, MAX_ITEMS_LOTE } from "./cambio-estado-lote";

const A = "0b9a7f5e-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const B = "7d6c5b4a-3f2e-4d1c-9b8a-7f6e5d4c3b2a";
const C = "11111111-2222-4333-8444-555555555555";

describe("leerCambioLote", () => {
  it("acepta marcar en revisión", () => {
    expect(leerCambioLote({ itemIds: [A, B], estado_revision: "en_revision" })).toEqual({
      ok: true,
      cambio: { itemIds: [A, B], estado: "en_revision", motivo: null },
    });
  });

  it("acepta volver a normal (estado nulo) y descarta cualquier motivo", () => {
    expect(leerCambioLote({ itemIds: [A], estado_revision: null, motivo_cancelacion: "x" })).toEqual({
      ok: true,
      cambio: { itemIds: [A], estado: null, motivo: null },
    });
    expect(leerCambioLote({ itemIds: [A] })).toMatchObject({ ok: true, cambio: { estado: null } });
  });

  it("cancelar exige motivo y lo recorta", () => {
    expect(leerCambioLote({ itemIds: [A], estado_revision: "cancelado" })).toMatchObject({ ok: false });
    expect(leerCambioLote({ itemIds: [A], estado_revision: "cancelado", motivo_cancelacion: "   " })).toMatchObject({
      ok: false,
    });
    expect(
      leerCambioLote({ itemIds: [A], estado_revision: "cancelado", motivo_cancelacion: "  cambio de diseño " })
    ).toEqual({ ok: true, cambio: { itemIds: [A], estado: "cancelado", motivo: "cambio de diseño" } });
  });

  it("rechaza estados desconocidos", () => {
    expect(leerCambioLote({ itemIds: [A], estado_revision: "borrado" })).toEqual({
      ok: false,
      error: "Estado inválido.",
    });
  });

  it("rechaza ids vacíos, repetidos de forma inválida o que no son uuid", () => {
    expect(leerCambioLote({ itemIds: [], estado_revision: null }).ok).toBe(false);
    expect(leerCambioLote({ itemIds: ["1; drop table"], estado_revision: null }).ok).toBe(false);
    expect(leerCambioLote({ itemIds: [A, 5], estado_revision: null }).ok).toBe(false);
    expect(leerCambioLote({ estado_revision: null }).ok).toBe(false);
    expect(leerCambioLote(null).ok).toBe(false);
    expect(leerCambioLote("texto").ok).toBe(false);
  });

  it("quita ids repetidos y pone tope al lote", () => {
    expect(leerCambioLote({ itemIds: [A, A, B], estado_revision: null })).toMatchObject({
      cambio: { itemIds: [A, B] },
    });
    const muchos = Array.from({ length: MAX_ITEMS_LOTE + 1 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    );
    expect(leerCambioLote({ itemIds: muchos, estado_revision: null }).ok).toBe(false);
  });

  it("limita el largo del motivo", () => {
    const largo = "x".repeat(501);
    expect(leerCambioLote({ itemIds: [A], estado_revision: "cancelado", motivo_cancelacion: largo }).ok).toBe(false);
  });
});

describe("agruparParaDeshacer", () => {
  it("agrupa por estado previo para restaurar con pocas llamadas", () => {
    const { grupos, sinMotivo } = agruparParaDeshacer([
      { id: A, estado: null, motivo: null },
      { id: B, estado: null, motivo: null },
      { id: C, estado: "en_revision", motivo: null },
    ]);
    expect(sinMotivo).toEqual([]);
    expect(grupos).toEqual([
      { estado: null, motivo: null, itemIds: [A, B] },
      { estado: "en_revision", motivo: null, itemIds: [C] },
    ]);
  });

  it("separa los cancelados por motivo", () => {
    const { grupos } = agruparParaDeshacer([
      { id: A, estado: "cancelado", motivo: "uno" },
      { id: B, estado: "cancelado", motivo: "otro" },
      { id: C, estado: "cancelado", motivo: "uno" },
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos.find((g) => g.motivo === "uno")?.itemIds).toEqual([A, C]);
  });

  it("un cancelado sin motivo no se puede restaurar y se avisa aparte", () => {
    const { grupos, sinMotivo } = agruparParaDeshacer([
      { id: A, estado: "cancelado", motivo: null },
      { id: B, estado: "cancelado", motivo: "  " },
      { id: C, estado: null, motivo: null },
    ]);
    expect(sinMotivo).toEqual([A, B]);
    expect(grupos).toEqual([{ estado: null, motivo: null, itemIds: [C] }]);
  });

  it("ignora un motivo que venga con un estado que no es cancelado", () => {
    const { grupos } = agruparParaDeshacer([{ id: A, estado: "en_revision", motivo: "sobrante" }]);
    expect(grupos).toEqual([{ estado: "en_revision", motivo: null, itemIds: [A] }]);
  });
});
