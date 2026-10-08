import { describe, expect, it } from "vitest";
import {
  diasEnProceso,
  diasEntre,
  estadoAsignacion,
  formatoFecha,
  hoyMexico,
  leerCantidad,
  leerFecha,
  revisionEntrega,
} from "./asignaciones";

describe("revisionEntrega", () => {
  const base = { anulada_en: null, rechazada_en: null, verificada_en: null };
  it("una entrega nueva espera la revisión del trabajador", () => {
    expect(revisionEntrega(base)).toBe("por_verificar");
  });
  it("verificada pasa a Calidad; rechazada regresa al equipo", () => {
    expect(revisionEntrega({ ...base, verificada_en: "2026-10-08T12:00:00Z" })).toBe("verificada");
    expect(revisionEntrega({ ...base, rechazada_en: "2026-10-08T12:00:00Z" })).toBe("rechazada");
  });
  it("anulada gana sobre todo lo demás", () => {
    expect(revisionEntrega({ ...base, verificada_en: "2026-10-08T12:00:00Z", anulada_en: "2026-10-09T12:00:00Z" })).toBe(
      "anulada"
    );
  });
});

describe("estadoAsignacion", () => {
  it("cancelada gana sobre lo entregado", () => {
    expect(estadoAsignacion(10, 10, true)).toBe("cancelada");
  });
  it("sin entregas está en proceso", () => {
    expect(estadoAsignacion(60, 0, false)).toBe("en_proceso");
  });
  it("entrega parcial", () => {
    expect(estadoAsignacion(60, 30, false)).toBe("parcial");
  });
  it("completa", () => {
    expect(estadoAsignacion(60, 60, false)).toBe("entregada");
  });
});

describe("fechas", () => {
  it("diasEntre cruza meses", () => {
    expect(diasEntre("2026-09-28", "2026-10-05")).toBe(7);
  });
  it("hoyMexico usa la zona de México, no UTC", () => {
    // 03:00 UTC del 6 de octubre son las 21:00 del 5 en Ciudad de México.
    expect(hoyMexico(new Date("2026-10-06T03:00:00Z"))).toBe("2026-10-05");
  });
  it("formatoFecha", () => {
    expect(formatoFecha("2026-10-05")).toBe("05/10/2026");
    expect(formatoFecha(null)).toBe("—");
  });
  it("leerFecha rechaza fechas imposibles", () => {
    expect(leerFecha("2026-10-05")).toBe("2026-10-05");
    expect(leerFecha("2026-02-31")).toBeNull();
    expect(leerFecha("05/10/2026")).toBeNull();
  });
});

describe("diasEnProceso", () => {
  it("cuenta hasta hoy si sigue en proceso", () => {
    expect(
      diasEnProceso({ fecha_asignacion: "2026-10-01", estado: "parcial", ultima_entrega: "2026-10-03" }, "2026-10-05")
    ).toBe(4);
  });
  it("cuenta hasta la última entrega si ya se entregó", () => {
    expect(
      diasEnProceso({ fecha_asignacion: "2026-10-01", estado: "entregada", ultima_entrega: "2026-10-03" }, "2026-10-05")
    ).toBe(2);
  });
  it("cancelada no cuenta", () => {
    expect(
      diasEnProceso({ fecha_asignacion: "2026-10-01", estado: "cancelada", ultima_entrega: null }, "2026-10-05")
    ).toBeNull();
  });
});

describe("leerCantidad", () => {
  it("acepta coma decimal y redondea a 2", () => {
    expect(leerCantidad("12,5")).toBe(12.5);
    expect(leerCantidad("3.456")).toBe(3.46);
  });
  it("rechaza cero, negativos y texto", () => {
    expect(leerCantidad("0")).toBeNull();
    expect(leerCantidad("-4")).toBeNull();
    expect(leerCantidad("abc")).toBeNull();
    expect(leerCantidad("")).toBeNull();
  });
});
