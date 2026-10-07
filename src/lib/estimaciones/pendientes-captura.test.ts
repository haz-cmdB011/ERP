import { describe, expect, it } from "vitest";
import { hayPendientes, pendientesDeCaptura } from "./pendientes-captura";

describe("pendientesDeCaptura", () => {
  it("cuenta renglones sin precio y por justificar", () => {
    const p = pendientesDeCaptura([
      { propuesto: 100, banda: "auto", justificacion: "" },
      { propuesto: 0, banda: "justificar", justificacion: "" },
      { propuesto: "", banda: "estimador", justificacion: "" },
      { propuesto: 300, banda: "justificar", justificacion: "   " },
      { propuesto: 300, banda: "justificar", justificacion: "Ya negociado" },
    ]);
    expect(p).toEqual({ sinPrecio: 2, porJustificar: 2 });
  });

  it("sin banda (no ve el sugerido) nunca marca por justificar", () => {
    const p = pendientesDeCaptura([{ propuesto: 500, banda: null, justificacion: "" }]);
    expect(p.porJustificar).toBe(0);
  });

  it("hayPendientes también considera los descuadres con el PM", () => {
    expect(hayPendientes({ sinPrecio: 0, porJustificar: 0 }, 0)).toBe(false);
    expect(hayPendientes({ sinPrecio: 0, porJustificar: 0 }, 1)).toBe(true);
    expect(hayPendientes({ sinPrecio: 1, porJustificar: 0 }, 0)).toBe(true);
  });
});
