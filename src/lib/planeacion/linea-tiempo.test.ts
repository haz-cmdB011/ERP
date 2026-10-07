import { describe, expect, it } from "vitest";
import { armarLineaTiempo, type AsignacionTiempo, type ItemTiempo } from "./linea-tiempo";

function item(id: string, extra: Partial<ItemTiempo> = {}): ItemTiempo {
  return {
    id,
    tipo_registro: "MO",
    cantidad_total: 10,
    estado_liberacion: "pendiente",
    estado_revision: null,
    eliminacion_solicitada_en: null,
    ...extra,
  };
}

function asig(itemId: string, proceso: "armado" | "barniz", cantidad: number, entregado: number, extra: Partial<AsignacionTiempo> = {}): AsignacionTiempo {
  return { planeacion_item_id: itemId, proceso, cantidad, entregado, cancelada_en: null, ...extra };
}

const liberado = { estado_liberacion: "enviado_a_produccion" };

describe("armarLineaTiempo", () => {
  it("un PM recién cargado solo tiene lo planeado", () => {
    const t = armarLineaTiempo([item("m1"), item("c1", { tipo_registro: "FU" })], [], new Set());
    expect(t).toMatchObject({
      muebles: 1,
      componentes: 1,
      itemsVigentes: 2,
      itemsLiberados: 0,
      mueblesLiberados: 0,
      asignados: { armado: 0, barniz: 0 },
      entregados: { armado: 0, barniz: 0 },
      evaluados: 0,
    });
  });

  it("no cuenta lo cancelado ni lo que está en la papelera", () => {
    const t = armarLineaTiempo(
      [
        item("m1", liberado),
        item("m2", { ...liberado, estado_revision: "cancelado" }),
        item("m3", { ...liberado, eliminacion_solicitada_en: "2026-10-01T00:00:00Z" }),
      ],
      [],
      new Set()
    );
    expect(t.muebles).toBe(1);
    expect(t.itemsLiberados).toBe(1);
  });

  it("cuenta los ítems liberados, con componentes", () => {
    const t = armarLineaTiempo(
      [item("m1", liberado), item("c1", { ...liberado, tipo_registro: "FU" }), item("m2")],
      [],
      new Set()
    );
    expect(t.itemsLiberados).toBe(2);
    expect(t.mueblesLiberados).toBe(1);
    expect(t.itemsVigentes).toBe(3);
  });

  it("un mueble cuenta como asignado cuando se asigna todo, sumando equipos", () => {
    const t = armarLineaTiempo(
      [item("m1", liberado), item("m2", liberado)],
      [
        // m1 se reparte en dos equipos y queda completo en armado.
        asig("m1", "armado", 6, 0),
        asig("m1", "armado", 4, 0),
        // m2 solo tiene la mitad en armado y todo en barniz.
        asig("m2", "armado", 5, 0),
        asig("m2", "barniz", 10, 0),
      ],
      new Set()
    );
    expect(t.asignados).toEqual({ armado: 1, barniz: 1 });
  });

  it("lo entregado se cuenta aparte de lo asignado", () => {
    const t = armarLineaTiempo(
      [item("m1", liberado)],
      [asig("m1", "armado", 10, 10), asig("m1", "barniz", 10, 4)],
      new Set()
    );
    expect(t.asignados).toEqual({ armado: 1, barniz: 1 });
    expect(t.entregados).toEqual({ armado: 1, barniz: 0 });
  });

  it("ignora las asignaciones canceladas y las que perdieron su ítem", () => {
    const t = armarLineaTiempo(
      [item("m1", liberado)],
      [
        asig("m1", "armado", 10, 10, { cancelada_en: "2026-10-02T00:00:00Z" }),
        asig("m1", "barniz", 10, 10, { planeacion_item_id: null }),
      ],
      new Set()
    );
    expect(t.asignados).toEqual({ armado: 0, barniz: 0 });
    expect(t.entregados).toEqual({ armado: 0, barniz: 0 });
  });

  it("tolera decimales de la base al comparar con la cantidad", () => {
    const t = armarLineaTiempo(
      [item("m1", { ...liberado, cantidad_total: 2.5 })],
      [asig("m1", "armado", 2.499, 0)],
      new Set()
    );
    expect(t.asignados.armado).toBe(1);
  });

  it("solo evalúa por Calidad lo que está liberado", () => {
    const t = armarLineaTiempo(
      [item("m1", liberado), item("m2"), item("c1", { ...liberado, tipo_registro: "FU" })],
      [],
      new Set(["m1", "m2"])
    );
    // m2 tiene informe pero no está liberado: no cuenta.
    expect(t.evaluados).toBe(1);
  });
});
