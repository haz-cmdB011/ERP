import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { turnstileActivo, verificarTurnstile } from "./turnstile";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sin clave secreta (captcha apagado)", () => {
  it("no se exige nada y no se llama a Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileActivo()).toBe(false);
    expect(await verificarTurnstile(undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("con clave secreta (captcha activo)", () => {
  beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", "secreta-de-prueba"));

  it("rechaza sin token, con token vacío, de otro tipo o demasiado largo, sin llamar a Cloudflare", async () => {
    expect(turnstileActivo()).toBe(true);
    for (const token of [undefined, null, "", 123, "x".repeat(3000)]) {
      expect(await verificarTurnstile(token)).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acepta cuando Cloudflare dice success y le manda secreto, token e IP", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    expect(await verificarTurnstile("token-bueno", "1.2.3.4")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const cuerpo = init.body as URLSearchParams;
    expect(cuerpo.get("secret")).toBe("secreta-de-prueba");
    expect(cuerpo.get("response")).toBe("token-bueno");
    expect(cuerpo.get("remoteip")).toBe("1.2.3.4");
  });

  it("no manda la IP cuando es desconocida", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await verificarTurnstile("token", "desconocida");
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it("rechaza cuando Cloudflare dice que no, responde con error o no responde", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) });
    expect(await verificarTurnstile("token-malo")).toBe(false);
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await verificarTurnstile("token")).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error("sin red"));
    expect(await verificarTurnstile("token")).toBe(false);
  });
});
