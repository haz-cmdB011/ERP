import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VENTANA_MS,
  avisarError,
  claveAlerta,
  debeAvisar,
  digestDe,
  esFalloEsperado,
  limpiarMensaje,
  limpiarRuta,
  mensajeDe,
  reiniciarAlertas,
  textoAlerta,
} from "./alertas";

const webhook = "https://hooks.example.com/abc";
const falla = {
  origen: "servidor" as const,
  mensaje: "Falló guardar el recibo",
  digest: "123",
  ruta: "/estimaciones?q=1",
  metodo: "POST",
};
const respuestaOk = () => Promise.resolve({ ok: true } as Response);

beforeEach(() => {
  reiniciarAlertas();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ALERTA_WEBHOOK_URL", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("limpieza de datos", () => {
  it("tapa correos, recorta y junta espacios", () => {
    expect(limpiarMensaje("No existe ana@empresa.com   en\nla base")).toBe("No existe [correo] en la base");
    expect(limpiarMensaje("x".repeat(500)).length).toBeLessThanOrEqual(300);
  });

  it("quita parámetros y fragmentos de la ruta", () => {
    expect(limpiarRuta("/planeacion/pedidos/abc?q=secreto#x")).toBe("/planeacion/pedidos/abc");
    expect(limpiarRuta(undefined)).toBe("");
  });

  it("saca mensaje y digest de cualquier valor lanzado", () => {
    expect(mensajeDe(new Error("boom"))).toBe("boom");
    expect(mensajeDe("texto")).toBe("texto");
    expect(digestDe(Object.assign(new Error("x"), { digest: 42 }))).toBe("42");
    expect(digestDe(new Error("x"))).toBeUndefined();
    expect(digestDe(null)).toBeUndefined();
  });

  it("no cuenta como fallo los redirects ni los 'no encontrado' de Next", () => {
    expect(esFalloEsperado({ mensaje: "x", digest: "NEXT_REDIRECT;replace;/login" })).toBe(true);
    expect(esFalloEsperado({ mensaje: "NEXT_NOT_FOUND" })).toBe(true);
    expect(esFalloEsperado({ mensaje: "boom", digest: "999" })).toBe(false);
  });
});

describe("no repetir el mismo aviso", () => {
  it("avisa una vez por ventana y de nuevo cuando pasa", () => {
    const t0 = 1_000_000;
    expect(debeAvisar("a", t0)).toBe(true);
    expect(debeAvisar("a", t0 + 1000)).toBe(false);
    expect(debeAvisar("b", t0 + 1000)).toBe(true);
    expect(debeAvisar("a", t0 + VENTANA_MS + 1)).toBe(true);
  });

  it("usa el digest como identidad cuando existe", () => {
    expect(claveAlerta({ ...falla, mensaje: "uno" })).toBe(claveAlerta({ ...falla, mensaje: "uno" }));
    expect(claveAlerta(falla)).not.toBe(claveAlerta({ ...falla, digest: "999" }));
  });
});

describe("textoAlerta", () => {
  it("lleva entorno, dónde, qué y digest, sin parámetros de la ruta", () => {
    const t = textoAlerta(falla, "production");
    expect(t).toContain("production");
    expect(t).toContain("POST /estimaciones");
    expect(t).not.toContain("q=1");
    expect(t).toContain("Falló guardar el recibo");
    expect(t).toContain("123");
  });
});

describe("avisarError", () => {
  it("no hace nada sin webhook o si no es https", async () => {
    const enviar = vi.fn(respuestaOk);
    expect(await avisarError(falla, { enviar })).toBe(false);
    expect(await avisarError(falla, { webhook: "http://inseguro.example.com", enviar })).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("manda el mensaje (text y content) cuando hay webhook", async () => {
    const enviar = vi.fn(respuestaOk);
    expect(await avisarError(falla, { webhook, entorno: "production", enviar })).toBe(true);
    const [url, init] = enviar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(webhook);
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.text).toBe(cuerpo.content);
    expect(cuerpo.text).toContain("Falló guardar el recibo");
  });

  it("no repite el mismo fallo dentro de la ventana", async () => {
    const enviar = vi.fn(respuestaOk);
    expect(await avisarError(falla, { webhook, enviar })).toBe(true);
    expect(await avisarError(falla, { webhook, enviar })).toBe(false);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("no avisa en desarrollo ni de redirects", async () => {
    const enviar = vi.fn(respuestaOk);
    vi.stubEnv("NODE_ENV", "development");
    expect(await avisarError(falla, { webhook, enviar })).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(await avisarError({ ...falla, digest: "NEXT_REDIRECT;replace;/x" }, { webhook, enviar })).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("nunca lanza, aunque el webhook falle o no responda", async () => {
    expect(await avisarError(falla, { webhook, enviar: () => Promise.reject(new Error("sin red")) })).toBe(false);
    reiniciarAlertas();
    expect(await avisarError(falla, { webhook, enviar: () => Promise.resolve({ ok: false } as Response) })).toBe(false);
  });
});
