import { describe, expect, it } from "vitest";
import { escalaParaFicha } from "./generar-pdf-carta";

describe("escalaParaFicha", () => {
  it("usa la escala máxima (3) en fichas normales", () => {
    expect(escalaParaFicha(900)).toBe(3);
    expect(escalaParaFicha(2500)).toBe(3);
  });

  it("baja la escala en fichas muy largas para no pasar del tope de píxeles de iOS", () => {
    const alto = 6000;
    const escala = escalaParaFicha(alto);
    expect(escala).toBeLessThan(3);
    expect(escala).toBeGreaterThanOrEqual(1);
    // ancho x escala por alto x escala nunca pasa de 16 777 216 (límite de canvas en iOS).
    expect(640 * escala * alto * escala).toBeLessThanOrEqual(16_777_216);
  });

  it("nunca baja de 1 ni falla con alturas raras", () => {
    expect(escalaParaFicha(100_000)).toBe(1);
    expect(escalaParaFicha(0)).toBe(3);
    expect(escalaParaFicha(-5)).toBe(3);
  });
});
