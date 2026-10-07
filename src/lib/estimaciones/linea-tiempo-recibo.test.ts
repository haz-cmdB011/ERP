import { describe, expect, it } from "vitest";
import { pasoHecho, pasosDelRecibo } from "./linea-tiempo-recibo";

const base = { guardadoEn: "2026-10-01T10:00:00Z" };

describe("pasosDelRecibo", () => {
  it("un recibo pendiente solo tiene capturado", () => {
    const p = pasosDelRecibo({ ...base, estado: "pendiente" });
    expect(p.map((x) => [x.clave, x.fecha !== null, x.actual])).toEqual([
      ["capturado", true, true],
      ["revisado", false, false],
      ["pagado", false, false],
    ]);
  });

  it("revisado: ya pasó la revisión y espera el pago", () => {
    const p = pasosDelRecibo({ ...base, estado: "revisado", revisadoEn: "2026-10-03T09:00:00Z" });
    expect(p[1]).toMatchObject({ fecha: "2026-10-03T09:00:00Z", actual: true });
    expect(p[2].fecha).toBeNull();
  });

  it("pagado: los tres pasos con fecha, aunque falte la de revisión", () => {
    const p = pasosDelRecibo({ ...base, estado: "pagado", pagadoEn: "2026-10-06T12:00:00Z" });
    expect(p.every((x) => x.fecha !== null)).toBe(true);
    expect(p[1].fecha).toBe("2026-10-06T12:00:00Z");
    expect(p[2].actual).toBe(true);
  });

  it("cancelado: capturado y cancelado", () => {
    const p = pasosDelRecibo({ ...base, estado: "cancelado", canceladoEn: "2026-10-02T08:00:00Z" });
    expect(p.map((x) => x.clave)).toEqual(["capturado", "cancelado"]);
    expect(p[1]).toMatchObject({ fecha: "2026-10-02T08:00:00Z", actual: true });
  });

  it("pasoHecho cuenta el paso actual aunque no tenga fecha", () => {
    const [capturado, revisado] = pasosDelRecibo({ ...base, estado: "revisado" });
    expect(pasoHecho(capturado)).toBe(true);
    expect(pasoHecho(revisado)).toBe(true);
    expect(pasoHecho(pasosDelRecibo({ ...base, estado: "pendiente" })[2])).toBe(false);
  });
});
