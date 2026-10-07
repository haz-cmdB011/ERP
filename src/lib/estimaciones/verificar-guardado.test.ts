import { describe, expect, it, vi } from "vitest";
import {
  MENSAJE_SIN_CONFIRMAR,
  esErrorDeRed,
  guardarVerificando,
  seGuardo,
} from "./verificar-guardado";

describe("esErrorDeRed", () => {
  it("reconoce las fallas de conexión de los navegadores", () => {
    for (const m of ["Failed to fetch", "TypeError: NetworkError when attempting to fetch resource.", "Load failed", "fetch failed"]) {
      expect(esErrorDeRed(m)).toBe(true);
    }
  });

  it("no confunde un rechazo de la base con una falla de red", () => {
    expect(esErrorDeRed("El folio ya existe")).toBe(false);
    expect(esErrorDeRed("No tienes permiso para capturar recibos de Estimaciones.")).toBe(false);
    expect(esErrorDeRed(null)).toBe(false);
  });
});

describe("seGuardo", () => {
  it("es verdad solo si el folio ganó exactamente lo enviado", () => {
    expect(seGuardo(0, 3, 3)).toBe(true);
    expect(seGuardo(4, 7, 3)).toBe(true);
    expect(seGuardo(0, 0, 3)).toBe(false);
    expect(seGuardo(4, 5, 3)).toBe(false);
    expect(seGuardo(0, 0, 0)).toBe(false);
  });
});

// Cliente falso: cada llamada a la consulta devuelve el siguiente conteo.
function clienteConConteos(conteos: (number | null)[]) {
  const cola = [...conteos];
  const resultado = () => {
    const n = cola.shift();
    return n == null
      ? { data: null, error: { message: "x" } }
      : { data: [{ id: "1", renglones: [{ count: n }] }], error: null };
  };
  const cadena: Record<string, unknown> = {};
  cadena.select = () => cadena;
  cadena.eq = () => cadena;
  cadena.neq = () => cadena;
  cadena.returns = () => Promise.resolve(resultado());
  return { from: vi.fn(() => cadena) } as never;
}

const destino = { tabla: "recibos" as const, tipo: "acabados", folio: "1677" };

describe("guardarVerificando", () => {
  it("devuelve null cuando se guarda a la primera", async () => {
    const guardar = vi.fn().mockResolvedValue({ error: null });
    expect(await guardarVerificando(clienteConConteos([0]), destino, 2, guardar)).toEqual({ error: null });
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it("conserva el rechazo de la base tal cual", async () => {
    const guardar = vi.fn().mockResolvedValue({ error: "Falta el folio" });
    expect(await guardarVerificando(clienteConConteos([0]), destino, 2, guardar)).toEqual({ error: "Falta el folio" });
  });

  it("si se cae la red pero los renglones ya están, cuenta como guardado", async () => {
    const guardar = vi.fn().mockResolvedValue({ error: "Failed to fetch" });
    expect(await guardarVerificando(clienteConConteos([0, 2]), destino, 2, guardar)).toEqual({ error: null });
  });

  it("si se cae la red y no aparecieron, pide no recapturar a ciegas", async () => {
    const guardar = vi.fn().mockResolvedValue({ error: "Failed to fetch" });
    expect(await guardarVerificando(clienteConConteos([0, 0]), destino, 2, guardar)).toEqual({
      error: MENSAJE_SIN_CONFIRMAR,
    });
  });

  it("si no se pudo contar antes, no afirma que se guardó", async () => {
    const guardar = vi.fn().mockResolvedValue({ error: "Failed to fetch" });
    expect(await guardarVerificando(clienteConConteos([null, 2]), destino, 2, guardar)).toEqual({
      error: MENSAJE_SIN_CONFIRMAR,
    });
  });
});
