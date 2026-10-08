import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MENSAJE_SIN_RED,
  MENSAJE_TIEMPO_AGOTADO,
  fetchJson,
  mensajeDeEstado,
} from "./fetch-json";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const respuesta = (status: number, cuerpo: unknown, json = true) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: json ? async () => cuerpo : async () => { throw new SyntaxError("Unexpected token <"); },
  }) as unknown as Response;

describe("fetchJson", () => {
  it("2xx: devuelve el cuerpo y no hay error", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ok: true, id: "x" }));
    const r = await fetchJson<{ id: string }>("/api/x", { method: "POST" });
    expect(r).toEqual({ ok: true, status: 200, data: { ok: true, id: "x" }, error: null, sinRed: false });
  });

  it("manda las opciones tal cual al fetch", async () => {
    fetchMock.mockResolvedValue(respuesta(200, {}));
    await fetchJson("/api/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/x");
    expect(init).toMatchObject({ method: "PATCH", body: "{}" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("4xx con mensaje del servidor: lo usa", async () => {
    fetchMock.mockResolvedValue(respuesta(400, { error: "Solo faltan 2." }));
    const r = await fetchJson("/api/x");
    expect(r).toMatchObject({ ok: false, status: 400, error: "Solo faltan 2.", sinRed: false });
  });

  it("4xx/5xx sin mensaje: usa uno claro según el código", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(500, {}));
    expect((await fetchJson("/api/x")).error).toBe(mensajeDeEstado(500));
    fetchMock.mockResolvedValueOnce(respuesta(403, {}));
    expect((await fetchJson("/api/x")).error).toBe("No tienes permiso para hacer esto.");
    fetchMock.mockResolvedValueOnce(respuesta(401, {}));
    expect((await fetchJson("/api/x")).error).toContain("sesión expiró");
    fetchMock.mockResolvedValueOnce(respuesta(429, {}));
    expect((await fetchJson("/api/x")).error).toContain("Demasiados intentos");
  });

  it("respuesta que no es JSON (página de error del proveedor): no lanza", async () => {
    fetchMock.mockResolvedValue(respuesta(502, null, false));
    const r = await fetchJson("/api/x");
    expect(r).toMatchObject({ ok: false, status: 502, data: {}, sinRed: false });
    expect(r.error).toBe(mensajeDeEstado(502));
  });

  it("un 200 sin JSON tampoco lanza", async () => {
    fetchMock.mockResolvedValue(respuesta(200, null, false));
    expect(await fetchJson("/api/x")).toMatchObject({ ok: true, data: {}, error: null });
  });

  it("sin red (fetch lanza): no lanza, status 0 y mensaje de conexión", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await fetchJson("/api/x");
    expect(r).toEqual({ ok: false, status: 0, data: {}, error: MENSAJE_SIN_RED, sinRed: true });
  });

  it("petición colgada: se cancela pasado el tiempo y avisa que tardó demasiado", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_ok, rechazar) => {
          init.signal?.addEventListener("abort", () => rechazar(new DOMException("Aborted", "AbortError")));
        })
    );
    const pendiente = fetchJson("/api/x", { esperaMs: 5000 });
    await vi.advanceTimersByTimeAsync(5001);
    const r = await pendiente;
    expect(r).toMatchObject({ ok: false, status: 0, sinRed: true, error: MENSAJE_TIEMPO_AGOTADO });
  });

  it("si quien llama cancela, también devuelve un resultado (no lanza)", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_ok, rechazar) => {
          init.signal?.addEventListener("abort", () => rechazar(new DOMException("Aborted", "AbortError")));
        })
    );
    const externo = new AbortController();
    const pendiente = fetchJson("/api/x", { signal: externo.signal });
    externo.abort();
    expect(await pendiente).toMatchObject({ ok: false, status: 0, error: MENSAJE_SIN_RED });
  });

  it("no deja temporizadores sueltos al terminar bien", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(respuesta(200, {}));
    await fetchJson("/api/x");
    expect(vi.getTimerCount()).toBe(0);
  });
});
