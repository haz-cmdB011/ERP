import { describe, expect, it } from "vitest";
import { formatoFechaDMA, formatoFechaHora } from "./entrega";

describe("formatoFechaDMA", () => {
  it("pone día/mes/año", () => {
    expect(formatoFechaDMA("2026-10-12")).toBe("12/10/2026");
    expect(formatoFechaDMA("2026-01-05")).toBe("05/01/2026");
  });

  it("ignora la hora si viene con marca de tiempo", () => {
    expect(formatoFechaDMA("2026-10-12T18:30:00+00:00")).toBe("12/10/2026");
  });

  it("sin fecha o inválida da un guion", () => {
    expect(formatoFechaDMA(null)).toBe("—");
    expect(formatoFechaDMA(undefined)).toBe("—");
    expect(formatoFechaDMA("")).toBe("—");
    expect(formatoFechaDMA("pronto")).toBe("—");
  });
});

describe("formatoFechaHora", () => {
  it("usa la hora de México, no la UTC", () => {
    // México (centro) es UTC-6 todo el año desde 2022.
    expect(formatoFechaHora("2026-10-07T14:23:00Z")).toBe("07/10/2026 08:23");
  });

  it("cruza al día anterior cuando en UTC ya es el siguiente", () => {
    expect(formatoFechaHora("2026-10-08T03:05:00Z")).toBe("07/10/2026 21:05");
  });

  it("la medianoche sale como 00, no 24", () => {
    expect(formatoFechaHora("2026-10-07T06:00:00Z")).toBe("07/10/2026 00:00");
  });

  it("sin dato o inválido da un guion", () => {
    expect(formatoFechaHora(null)).toBe("—");
    expect(formatoFechaHora("no-es-fecha")).toBe("—");
  });
});
