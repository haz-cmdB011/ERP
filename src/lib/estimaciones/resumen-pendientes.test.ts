import { describe, expect, it } from "vitest";
import { detallePendientes, resumirPendientes } from "./resumen-pendientes";

const AHORA = new Date("2026-10-07T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86400000).toISOString();

describe("resumirPendientes", () => {
  it("cuenta urgentes, vencidos y el más antiguo", () => {
    const r = resumirPendientes(
      [
        { prioridad: "urgente", creadoEn: hace(1) },
        { prioridad: "normal", creadoEn: hace(5) },
        { prioridad: "preferente", creadoEn: hace(3) },
        { prioridad: "urgente", creadoEn: hace(0) },
      ],
      AHORA
    );
    expect(r).toEqual({ total: 4, urgentes: 2, masAntiguoDias: 5, vencidos: 1 });
  });

  it("sin pendientes no inventa antigüedad", () => {
    expect(resumirPendientes([], AHORA)).toEqual({ total: 0, urgentes: 0, masAntiguoDias: null, vencidos: 0 });
  });

  it("una fecha futura (reloj desfasado) cuenta como 0 días", () => {
    expect(resumirPendientes([{ prioridad: "normal", creadoEn: hace(-2) }], AHORA).masAntiguoDias).toBe(0);
  });
});

describe("detallePendientes", () => {
  it("resume lo importante en una línea", () => {
    expect(detallePendientes({ total: 4, urgentes: 2, masAntiguoDias: 5, vencidos: 1 })).toBe(
      "2 urgentes · 1 con más de 3 días · el más antiguo espera 5 días"
    );
  });
  it("con todo reciente deja el texto de siempre", () => {
    expect(detallePendientes({ total: 2, urgentes: 0, masAntiguoDias: 0, vencidos: 0 })).toBe(
      "esperan que aceptes o modifiques el precio"
    );
  });
  it("singulares", () => {
    expect(detallePendientes({ total: 1, urgentes: 1, masAntiguoDias: 1, vencidos: 0 })).toBe(
      "1 urgente · el más antiguo espera 1 día"
    );
  });
  it("sin pendientes", () => {
    expect(detallePendientes({ total: 0, urgentes: 0, masAntiguoDias: null, vencidos: 0 })).toBe("nada por revisar");
  });
});
