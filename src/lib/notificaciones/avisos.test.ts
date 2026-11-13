import { describe, expect, it } from "vitest";
import {
  MAX_IDS_LEER,
  destinatariosDeAviso,
  esAreaAviso,
  leerIdsAviso,
  notificacionDeAviso,
  tiempoRelativo,
  type AvisoPendiente,
} from "./avisos";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

const aviso = (extra: Partial<AvisoPendiente> = {}): AvisoPendiente => ({
  id: ID,
  area: "calidad",
  destinatario_id: null,
  tipo: "entrega",
  titulo: "Producción entregó 3 pza",
  cuerpo: "MS-01 · O.T. 102-24",
  url: "/calidad/entregas",
  creado_por: "provoca",
  ...extra,
});

describe("esAreaAviso", () => {
  it("acepta las cuatro áreas con avisos y nada más", () => {
    for (const a of ["planeacion", "produccion", "calidad", "estimaciones"]) expect(esAreaAviso(a)).toBe(true);
    for (const a of ["finanzas", "usuarios", "", null, 3]) expect(esAreaAviso(a)).toBe(false);
  });
});

describe("leerIdsAviso", () => {
  it("acepta uuids y quita los repetidos", () => {
    expect(leerIdsAviso([ID, ID2, ID])).toEqual([ID, ID2]);
  });
  it("rechaza lo que no sea una lista de uuids, vacía o demasiado larga", () => {
    expect(leerIdsAviso(undefined)).toBeNull();
    expect(leerIdsAviso([])).toBeNull();
    expect(leerIdsAviso(["no-es-uuid"])).toBeNull();
    expect(leerIdsAviso([ID, 5])).toBeNull();
    const muchos = Array.from({ length: MAX_IDS_LEER + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(leerIdsAviso(muchos)).toBeNull();
    expect(leerIdsAviso(muchos.slice(0, MAX_IDS_LEER))).toHaveLength(MAX_IDS_LEER);
  });
});

describe("destinatariosDeAviso", () => {
  const personal = { calidad: ["c1", "c2", "provoca"], produccion: ["p1"] };

  it("un aviso de área le llega al personal de esa área, sin quien lo provocó", () => {
    expect(destinatariosDeAviso(aviso(), personal)).toEqual(["c1", "c2"]);
  });
  it("un aviso de una persona solo le llega a ella", () => {
    expect(destinatariosDeAviso(aviso({ area: "estimaciones", destinatario_id: "maq" }), personal)).toEqual(["maq"]);
  });
  it("si la persona del aviso es quien lo provocó no se le manda", () => {
    expect(destinatariosDeAviso(aviso({ destinatario_id: "provoca" }), personal)).toEqual([]);
  });
  it("un área sin personal no manda a nadie (el desarrollador no está en esas listas a propósito)", () => {
    expect(destinatariosDeAviso(aviso({ area: "planeacion" }), personal)).toEqual([]);
  });
  it("no repite personas", () => {
    expect(destinatariosDeAviso(aviso(), { calidad: ["c1", "c1"] })).toEqual(["c1"]);
  });
});

describe("notificacionDeAviso", () => {
  it("lleva el texto, la pantalla y una etiqueta propia del aviso", () => {
    expect(notificacionDeAviso(aviso())).toEqual({
      titulo: "Producción entregó 3 pza",
      cuerpo: "MS-01 · O.T. 102-24",
      url: "/calidad/entregas",
      etiqueta: ID,
    });
  });
  it("sin pantalla no pone dirección", () => {
    expect(notificacionDeAviso(aviso({ url: null })).url).toBeUndefined();
  });
});

describe("tiempoRelativo", () => {
  const ahora = Date.parse("2026-11-13T12:00:00Z");
  const hace = (ms: number) => new Date(ahora - ms).toISOString();
  it("dice hace cuánto fue", () => {
    expect(tiempoRelativo(hace(20_000), ahora)).toBe("hace un momento");
    expect(tiempoRelativo(hace(5 * 60_000), ahora)).toBe("hace 5 min");
    expect(tiempoRelativo(hace(3 * 3_600_000), ahora)).toBe("hace 3 h");
    expect(tiempoRelativo(hace(30 * 3_600_000), ahora)).toBe("ayer");
    expect(tiempoRelativo(hace(4 * 86_400_000), ahora)).toBe("hace 4 d");
  });
  it("pasada una semana da la fecha", () => {
    expect(tiempoRelativo(hace(10 * 86_400_000), ahora)).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
  it("una fecha dañada no rompe nada", () => {
    expect(tiempoRelativo("nada", ahora)).toBe("");
  });
});
