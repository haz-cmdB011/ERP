import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));

import { consumirLimite, respuestaLimite } from "./limite-tasa";

const opciones = { clave: "registro:ip:1.2.3.4", maximo: 5, ventanaSegundos: 900 };

describe("consumirLimite", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("llama a consumir_limite con la clave, el máximo y la ventana", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await consumirLimite(opciones);
    expect(rpc).toHaveBeenCalledWith("consumir_limite", {
      p_clave: "registro:ip:1.2.3.4",
      p_maximo: 5,
      p_ventana_segundos: 900,
    });
  });

  it("permite mientras la base diga true y bloquea cuando dice false", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await consumirLimite(opciones)).toBe(true);
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await consumirLimite(opciones)).toBe(false);
  });

  it("no bloquea a nadie si la base falla o la función no existe todavía", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function not found" } });
    expect(await consumirLimite(opciones)).toBe(true);
    rpc.mockRejectedValueOnce(new Error("sin red"));
    expect(await consumirLimite(opciones)).toBe(true);
  });
});

describe("respuestaLimite", () => {
  it("responde 429 con el mensaje y Retry-After", async () => {
    const r = respuestaLimite("Espera.", 600);
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("600");
    expect(await r.json()).toEqual({ error: "Espera." });
  });

  it("sin ventana no manda Retry-After", () => {
    expect(respuestaLimite("Espera.").headers.get("Retry-After")).toBeNull();
  });
});
