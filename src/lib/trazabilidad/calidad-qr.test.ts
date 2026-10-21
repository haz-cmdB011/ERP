import { describe, expect, it } from "vitest";
import { panelCalidadQr } from "./calidad-qr";

describe("panelCalidadQr", () => {
  it("con la revisión final apagada solo hay entregas, abiertas", () => {
    expect(panelCalidadQr(null, true)).toEqual({ revisionFinal: null, entregasPlegadas: false });
  });

  it("con piezas listas, quien evalúa las revisa y los demás solo las ven", () => {
    const resumen = { pendientes: 3, liberado_a_obra: false };
    expect(panelCalidadQr(resumen, true)).toEqual({ revisionFinal: "revisar", entregasPlegadas: true });
    expect(panelCalidadQr(resumen, false).revisionFinal).toBe("listas");
  });

  it("sin piezas listas espera a Producción; aprobado completo, liberado a obra", () => {
    expect(panelCalidadQr({ pendientes: 0, liberado_a_obra: false }, true).revisionFinal).toBe("esperando");
    expect(panelCalidadQr({ pendientes: 0, liberado_a_obra: true }, true).revisionFinal).toBe("liberado");
  });
});
