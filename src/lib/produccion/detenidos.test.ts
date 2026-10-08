import { describe, expect, it } from "vitest";
import { avisoDetenidos, contarPendientes, diasEsperando, DIAS_SIN_VERIFICAR } from "./detenidos";

const HOY = "2026-10-08";

describe("diasEsperando", () => {
  it("cuenta días naturales en hora de México", () => {
    // 2026-10-07 23:30 en México = 2026-10-08 05:30 UTC: fue ayer, no hoy.
    expect(diasEsperando("2026-10-08T05:30:00Z", HOY)).toBe(1);
    expect(diasEsperando("2026-10-08T15:00:00Z", HOY)).toBe(0);
    expect(diasEsperando("2026-10-05T15:00:00Z", HOY)).toBe(3);
  });

  it("nunca da negativo", () => {
    expect(diasEsperando("2026-10-10T15:00:00Z", HOY)).toBe(0);
  });
});

describe("contarPendientes y avisoDetenidos", () => {
  it("separa lo detenido (umbral o más) del total", () => {
    const p = contarPendientes(
      ["2026-10-08T15:00:00Z", "2026-10-07T15:00:00Z", "2026-10-06T15:00:00Z", "2026-10-03T15:00:00Z"],
      DIAS_SIN_VERIFICAR,
      HOY
    );
    expect(p).toEqual({ total: 4, detenidos: 2, masAntiguoDias: 5 });
    expect(avisoDetenidos(p, DIAS_SIN_VERIFICAR)).toBe("2 con 2 días o más (el más antiguo, 5 días)");
  });

  it("sin nada detenido no hay aviso", () => {
    const p = contarPendientes(["2026-10-08T15:00:00Z"], DIAS_SIN_VERIFICAR, HOY);
    expect(p.detenidos).toBe(0);
    expect(avisoDetenidos(p, DIAS_SIN_VERIFICAR)).toBeNull();
    expect(contarPendientes([], DIAS_SIN_VERIFICAR, HOY)).toEqual({ total: 0, detenidos: 0, masAntiguoDias: null });
  });
});
