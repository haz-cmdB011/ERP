import { describe, expect, it } from "vitest";
import type { AsignacionResumen } from "./asignaciones";
import type { MuebleFlujo } from "./flujo-mueble";
import { contarInicio, modelosRecientes, otsConPendientes, procesosDeMueble, type MuebleInicio } from "./inicio";

function mueble(id: string, extra: Partial<MuebleInicio> = {}): MuebleInicio {
  return {
    id,
    modelo: "M-CONT-M",
    descripcion: "Mueble de control",
    estado: "por_liberar",
    pedidoId: "p1",
    numeroPm: "PM149-26",
    ot: "149-26",
    creadoEn: "2026-10-20T10:00:00Z",
    ...extra,
  };
}

describe("inicio de Producción", () => {
  const muebles = [
    mueble("a"),
    mueble("b", { estado: "en_proceso", pedidoId: "p2", numeroPm: "PM154-26", ot: "154-26", modelo: " m-cont-m ", creadoEn: "2026-10-25T10:00:00Z" }),
    mueble("c", { estado: "terminado", pedidoId: "p3", numeroPm: "PM10-26", ot: "10-26", creadoEn: "2026-01-05T10:00:00Z" }),
    mueble("d", { modelo: "SIGN HOLDER" }),
    mueble("e", { modelo: null, pedidoId: "p2", numeroPm: "PM154-26", ot: "154-26", estado: "por_asignar", creadoEn: "2026-10-25T10:00:00Z" }),
  ];

  it("cuenta los muebles por estado", () => {
    expect(contarInicio(muebles)).toEqual({ por_liberar: 2, por_asignar: 1, en_proceso: 1, terminado: 1 });
  });

  it("junta cada modelo de todos sus PM (sin importar mayúsculas ni espacios), el más reciente primero", () => {
    const r = modelosRecientes(muebles);
    // SIGN HOLDER está en un solo PM y también sale: un mueble nuevo no espera a repetirse.
    expect(r.map((m) => m.modelo)).toEqual(["M-CONT-M", "SIGN HOLDER"]);
    expect(r[0].pms.map((p) => p.numeroPm)).toEqual(["PM154-26", "PM149-26", "PM10-26"]);
    expect(r[0].reciente).toBe("2026-10-25T10:00:00Z");
    expect(r[0].conteos).toEqual({ por_liberar: 1, por_asignar: 0, en_proceso: 1, terminado: 1 });
  });

  it("un modelo de un PM viejo con movimiento reciente sale primero", () => {
    const r = modelosRecientes([
      ...muebles,
      mueble("f", { modelo: "TABLE C-3", pedidoId: "p9", creadoEn: "2026-10-01T10:00:00Z", actividad: "2026-10-29T09:00:00Z" }),
    ]);
    expect(r[0].modelo).toBe("TABLE C-3");
    expect(r[0].reciente).toBe("2026-10-29T09:00:00Z");
  });

  it("cada modelo dice de qué fue su último movimiento (por omisión, la subida del PM)", () => {
    const r = modelosRecientes([
      mueble("a", { modelo: "SILLA", actividad: "2026-10-29T09:00:00Z", actividadTipo: "entrega" }),
      mueble("b", { modelo: "SILLA", pedidoId: "p2", actividad: "2026-10-28T09:00:00Z", actividadTipo: "asignacion" }),
      mueble("c", { modelo: "MESA" }),
    ]);
    expect(r.map((m) => [m.modelo, m.tipoReciente])).toEqual([
      ["SILLA", "entrega"],
      ["MESA", "pm"],
    ]);
  });

  it("lista solo las O.T. con algo pendiente, la más reciente primero", () => {
    const r = otsConPendientes(muebles);
    expect(r.map((o) => [o.ot, o.pms])).toEqual([
      ["154-26", 1],
      ["149-26", 1],
    ]);
  });

  it("una O.T. de un PM viejo con movimiento reciente sale primero", () => {
    const r = otsConPendientes([
      ...muebles,
      mueble("g", { pedidoId: "p9", numeroPm: "PM50-26", ot: "50-26", creadoEn: "2026-03-01T10:00:00Z", actividad: "2026-10-29T09:00:00Z" }),
    ]);
    expect(r.map((o) => o.ot)).toEqual(["50-26", "154-26", "149-26"]);
  });
});

describe("procesos de un mueble", () => {
  const flujo = (asignaciones: AsignacionResumen[]): MuebleFlujo => ({
    id: "m",
    item_code: 1,
    modelo: "CAR-02",
    unidad: "PZA",
    cantidad: 10,
    aplica: { armado: true, barniz: true, electrificacion: false, superficie_solida: false },
    ruta: [
      { id: null, proceso: "armado" },
      { id: null, proceso: "barniz" },
    ],
    versionRuta: 0,
    asignaciones,
  });
  const armado = {
    id: "a1",
    proceso: "armado",
    cantidad: 10,
    entregado: 4,
    verificado: 4,
    cancelada_en: null,
    informe_rechazo_id: null,
    paso_id: null,
    adelantada: false,
    estado: "parcial",
  } as AsignacionResumen;

  it("da el avance de cada proceso de la ruta, en orden", () => {
    expect(procesosDeMueble(flujo([armado]))).toEqual([
      { etiqueta: "Armado", pct: 40, estado: "en_proceso" },
      { etiqueta: "Barniz", pct: 0, estado: "sin_asignar" },
    ]);
  });

  it("sin asignaciones, todos los procesos van en cero", () => {
    expect(procesosDeMueble(flujo([])).map((p) => [p.pct, p.estado])).toEqual([
      [0, "sin_asignar"],
      [0, "sin_asignar"],
    ]);
  });
});
