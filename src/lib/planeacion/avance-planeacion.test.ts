import { describe, expect, it } from "vitest";
import { agruparAvancePlaneacion, avancePlanVacio, sumarAvancePlan, type ItemAvancePlan } from "./avance-planeacion";

function item(pedidoId: string, extra: Partial<ItemAvancePlan> = {}): ItemAvancePlan {
  return { pedidoId, liberado: false, revision: null, ...extra };
}

describe("agruparAvancePlaneacion", () => {
  it("cuenta vigentes, liberados, en revisión y cancelados por PM", () => {
    const mapa = agruparAvancePlaneacion([
      item("A", { liberado: true }),
      item("A", { liberado: true, revision: "en_revision" }),
      item("A"),
      item("A", { revision: "cancelado" }),
      item("B", { revision: "cancelado" }),
    ]);
    expect(mapa.get("A")).toEqual({ vigentes: 3, liberados: 2, enRevision: 1, cancelados: 1 });
    expect(mapa.get("B")).toEqual({ vigentes: 0, liberados: 0, enRevision: 0, cancelados: 1 });
  });

  it("un ítem cancelado no cuenta como liberado ni como en revisión", () => {
    const mapa = agruparAvancePlaneacion([item("A", { liberado: true, revision: "cancelado" })]);
    expect(mapa.get("A")).toEqual({ vigentes: 0, liberados: 0, enRevision: 0, cancelados: 1 });
  });

  it("sin ítems no hay mapa", () => {
    expect(agruparAvancePlaneacion([]).size).toBe(0);
  });
});

describe("sumarAvancePlan", () => {
  const mapa = agruparAvancePlaneacion([
    item("A", { liberado: true }),
    item("A"),
    item("B", { revision: "en_revision" }),
    item("C", { revision: "cancelado" }),
  ]);

  it("suma el avance de los PM de una O.T.", () => {
    expect(sumarAvancePlan(mapa, ["A", "B"])).toEqual({ vigentes: 3, liberados: 1, enRevision: 1, cancelados: 0 });
  });

  it("ignora los PM sin ítems", () => {
    expect(sumarAvancePlan(mapa, ["A", "Z"])).toEqual({ vigentes: 2, liberados: 1, enRevision: 0, cancelados: 0 });
    expect(sumarAvancePlan(mapa, [])).toEqual(avancePlanVacio());
  });
});
