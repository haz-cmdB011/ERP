import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
vi.mock("web-push", () => ({ sendNotification: (...a: unknown[]) => enviar(...a) }));

const borrar = vi.fn();
const leerSuscripciones = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ in: () => ({ returns: leerSuscripciones }) }),
      delete: () => ({ in: borrar }),
    }),
  }),
}));

import { enviarASuscripciones, enviarAUsuarios, leerConfiguracionVapid, notificacionesConfiguradas } from "./enviar";

const SUBS = [
  { endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "p1", auth: "a1" },
  { endpoint: "https://fcm.googleapis.com/fcm/send/b", p256dh: "p2", auth: "a2" },
  { endpoint: "https://fcm.googleapis.com/fcm/send/c", p256dh: "p3", auth: "a3" },
];
const AVISO = { titulo: "Se liberó un mueble", cuerpo: "O.T. 009-26", url: "/produccion/panel" };

const ENTORNO = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "NEXT_PUBLIC_SITE_URL"] as const;
const guardado: Record<string, string | undefined> = {};

function configurar() {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "publica";
  process.env.VAPID_PRIVATE_KEY = "privada";
  process.env.VAPID_SUBJECT = "mailto:ti@mobiliarium.com";
}

beforeEach(() => {
  for (const k of ENTORNO) {
    guardado[k] = process.env[k];
    delete process.env[k];
  }
  enviar.mockReset().mockResolvedValue({ statusCode: 201 });
  borrar.mockReset().mockResolvedValue({ error: null });
  leerSuscripciones.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENTORNO) {
    if (guardado[k] === undefined) delete process.env[k];
    else process.env[k] = guardado[k];
  }
  vi.restoreAllMocks();
});

describe("configuración", () => {
  it("hacen falta las dos llaves y quién manda los avisos", () => {
    expect(notificacionesConfiguradas()).toBe(false);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "publica";
    process.env.VAPID_PRIVATE_KEY = "privada";
    expect(notificacionesConfiguradas()).toBe(false);
    process.env.VAPID_SUBJECT = "mailto:ti@mobiliarium.com";
    expect(leerConfiguracionVapid()).toEqual({ publica: "publica", privada: "privada", contacto: "mailto:ti@mobiliarium.com" });
  });

  it("sin VAPID_SUBJECT usa la dirección https del sitio, y rechaza un contacto que no sea mailto o https", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "publica";
    process.env.VAPID_PRIVATE_KEY = "privada";
    process.env.NEXT_PUBLIC_SITE_URL = "https://erp-becario.vercel.app";
    expect(leerConfiguracionVapid()?.contacto).toBe("https://erp-becario.vercel.app");
    process.env.VAPID_SUBJECT = "javascript:alert(1)";
    expect(leerConfiguracionVapid()?.contacto).toBe("https://erp-becario.vercel.app");
  });
});

describe("enviarASuscripciones", () => {
  it("sin configurar no manda nada y lo cuenta como fallido", async () => {
    expect(await enviarASuscripciones(SUBS, AVISO)).toEqual({ enviadas: 0, caducadas: [], fallidas: 3 });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("manda a cada aparato con el texto recortado y un enlace seguro", async () => {
    configurar();
    const r = await enviarASuscripciones(SUBS, { titulo: "t".repeat(300), cuerpo: "ok", url: "https://evil.com" });
    expect(r).toEqual({ enviadas: 3, caducadas: [], fallidas: 0 });
    expect(enviar).toHaveBeenCalledTimes(3);
    const [suscripcion, carga, opciones] = enviar.mock.calls[0];
    expect(suscripcion).toEqual({ endpoint: SUBS[0].endpoint, keys: { p256dh: "p1", auth: "a1" } });
    const dato = JSON.parse(carga as string);
    expect(dato.titulo).toHaveLength(80);
    expect(dato.url).toBe("/");
    expect(opciones.vapidDetails).toEqual({ subject: "mailto:ti@mobiliarium.com", publicKey: "publica", privateKey: "privada" });
  });

  it("separa las que caducaron (404 y 410) de las que fallaron por otra causa", async () => {
    configurar();
    enviar
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 500 });
    expect(await enviarASuscripciones(SUBS, AVISO)).toEqual({ enviadas: 1, caducadas: [SUBS[1].endpoint], fallidas: 1 });
  });
});

describe("enviarAUsuarios", () => {
  it("no hace nada sin personas o sin configurar", async () => {
    expect(await enviarAUsuarios([], AVISO)).toEqual({ enviadas: 0, caducadas: [], fallidas: 0 });
    expect(await enviarAUsuarios(["u1"], AVISO)).toEqual({ enviadas: 0, caducadas: [], fallidas: 0 });
    expect(leerSuscripciones).not.toHaveBeenCalled();
  });

  it("manda a los aparatos de esas personas y borra las suscripciones caducadas", async () => {
    configurar();
    leerSuscripciones.mockResolvedValue({ data: SUBS.slice(0, 2), error: null });
    enviar.mockResolvedValueOnce({ statusCode: 201 }).mockRejectedValueOnce({ statusCode: 404 });
    const r = await enviarAUsuarios(["u1", "u2"], AVISO);
    expect(r).toEqual({ enviadas: 1, caducadas: [SUBS[1].endpoint], fallidas: 0 });
    expect(borrar).toHaveBeenCalledWith("endpoint", [SUBS[1].endpoint]);
  });

  it("si no puede leer las suscripciones no manda nada ni tumba a quien lo llamó", async () => {
    configurar();
    leerSuscripciones.mockResolvedValue({ data: null, error: { message: "falla" } });
    expect(await enviarAUsuarios(["u1"], AVISO)).toEqual({ enviadas: 0, caducadas: [], fallidas: 0 });
    expect(enviar).not.toHaveBeenCalled();
  });
});
