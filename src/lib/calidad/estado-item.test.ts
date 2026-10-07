import { describe, expect, it } from "vitest";
import { diasSinEvaluar, estadoDe, funcionNoExiste, grupoDelItem, idsPorAprobar } from "./estado-item";

const AHORA = new Date("2026-10-07T12:00:00Z");
const item = (extra: object = {}) => ({
  id: "i",
  tipo_registro: "MO" as const,
  parent_item_id: null,
  estadoRevision: null,
  liberadoEn: "2026-10-01T12:00:00Z",
  informes: [] as { aprobado: boolean }[],
  ...extra,
});

describe("estadoDe", () => {
  it("manda el informe más reciente", () => {
    expect(estadoDe(item())).toBe("sin_evaluar");
    expect(estadoDe(item({ informes: [{ aprobado: true }, { aprobado: false }] }))).toBe("aprobado");
    expect(estadoDe(item({ informes: [{ aprobado: false }, { aprobado: true }] }))).toBe("no_aprobado");
  });

  it("un ítem cancelado lo es aunque tenga informes", () => {
    expect(estadoDe(item({ estadoRevision: "cancelado", informes: [{ aprobado: true }] }))).toBe("cancelado");
  });
});

describe("diasSinEvaluar", () => {
  it("cuenta días completos desde la liberación", () => {
    expect(diasSinEvaluar(item(), AHORA)).toBe(6);
  });
  it("es null si ya tiene informe o no hay fecha", () => {
    expect(diasSinEvaluar(item({ informes: [{ aprobado: true }] }), AHORA)).toBeNull();
    expect(diasSinEvaluar(item({ liberadoEn: null }), AHORA)).toBeNull();
  });
  it("una liberación futura (reloj desfasado) cuenta como 0", () => {
    expect(diasSinEvaluar(item({ liberadoEn: "2026-10-09T00:00:00Z" }), AHORA)).toBe(0);
  });
});

describe("idsPorAprobar", () => {
  it("solo los nunca evaluados: no rechazados, aprobados ni cancelados", () => {
    const ids = idsPorAprobar([
      item({ id: "a" }),
      item({ id: "b", informes: [{ aprobado: false }] }),
      item({ id: "c", informes: [{ aprobado: true }] }),
      item({ id: "d", estadoRevision: "cancelado" }),
      item({ id: "e" }),
    ]);
    expect(ids).toEqual(["a", "e"]);
  });
});

describe("grupoDelItem", () => {
  const items = [
    item({ id: "m1" }),
    item({ id: "f1", tipo_registro: "FU", parent_item_id: "m1" }),
    item({ id: "f2", tipo_registro: "FU", parent_item_id: "m1" }),
    item({ id: "m2" }),
    item({ id: "f3", tipo_registro: "FU", parent_item_id: "m2" }),
  ];
  it("de un mueble devuelve el mueble y sus componentes", () => {
    expect(grupoDelItem(items, "m1").map((i) => i.id)).toEqual(["m1", "f1", "f2"]);
  });
  it("de un componente devuelve el grupo de su mueble", () => {
    expect(grupoDelItem(items, "f3").map((i) => i.id)).toEqual(["m2", "f3"]);
  });
  it("si el ítem no está, nada", () => {
    expect(grupoDelItem(items, "zzz")).toEqual([]);
  });
});

describe("funcionNoExiste", () => {
  it("reconoce la función faltante de PostgREST y de Postgres", () => {
    expect(funcionNoExiste({ code: "PGRST202", message: "x" })).toBe(true);
    expect(funcionNoExiste({ code: "42883" })).toBe(true);
    expect(funcionNoExiste({ message: "Could not find the function public.x in the schema cache" })).toBe(true);
  });
  it("no confunde otros errores", () => {
    expect(funcionNoExiste({ code: "P0001", message: "Indica el motivo" })).toBe(false);
    expect(funcionNoExiste(null)).toBe(false);
  });
});
