import { beforeEach, describe, expect, it, vi } from "vitest";

const usuario = vi.fn();
const limite = vi.fn();
const upsert = vi.fn();
const borrarPropia = vi.fn();
const borrarCaducadas = vi.fn();
const leerPropias = vi.fn();
const enviarASubs = vi.fn();
const configurado = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario() } }) },
    from: () => ({
      select: () => ({ returns: leerPropias }),
      delete: () => ({ eq: borrarPropia, in: borrarCaducadas }),
    }),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ upsert }) }),
}));
vi.mock("@/lib/seguridad/limite-tasa", () => ({
  consumirLimite: (...a: unknown[]) => limite(...a),
  respuestaLimite: (m: string) => new Response(JSON.stringify({ error: m }), { status: 429 }),
}));
vi.mock("@/lib/notificaciones/enviar", () => ({
  enviarASuscripciones: (...a: unknown[]) => enviarASubs(...a),
  notificacionesConfiguradas: () => configurado(),
}));

import { DELETE, POST } from "./suscribir/route";
import { POST as prueba } from "./prueba/route";

const P256DH = "B" + "A".repeat(86);
const AUTH = "A".repeat(22);
const FCM = "https://fcm.googleapis.com/fcm/send/abc";
const VALIDA = { endpoint: FCM, keys: { p256dh: P256DH, auth: AUTH } };

const pedir = (metodo: "POST" | "DELETE", cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Request("http://x/api/notificaciones/suscribir", {
    method: metodo,
    headers: { "user-agent": "Chrome en Android", ...cabeceras },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });

beforeEach(() => {
  usuario.mockReset().mockReturnValue({ id: "u1" });
  limite.mockReset().mockResolvedValue(true);
  upsert.mockReset().mockResolvedValue({ error: null });
  borrarPropia.mockReset().mockResolvedValue({ error: null });
  borrarCaducadas.mockReset().mockResolvedValue({ error: null });
  leerPropias.mockReset().mockResolvedValue({ data: [{ endpoint: FCM, p256dh: P256DH, auth: AUTH }], error: null });
  enviarASubs.mockReset().mockResolvedValue({ enviadas: 1, caducadas: [], fallidas: 0 });
  configurado.mockReset().mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/notificaciones/suscribir", () => {
  it("sin sesión responde 401 y no guarda nada", async () => {
    usuario.mockReturnValue(null);
    expect((await POST(pedir("POST", VALIDA))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("guarda la suscripción a nombre de quien tiene la sesión, aunque el cuerpo traiga otro user_id", async () => {
    const r = await POST(pedir("POST", { ...VALIDA, user_id: "otra-persona" }));
    expect(r.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      { user_id: "u1", endpoint: FCM, p256dh: P256DH, auth: AUTH, user_agent: "Chrome en Android" },
      { onConflict: "endpoint" }
    );
  });

  it("rechaza servicios no permitidos, cuerpos que no son JSON y cuerpos enormes", async () => {
    expect((await POST(pedir("POST", { ...VALIDA, endpoint: "https://evil.com/x" }))).status).toBe(400);
    expect((await POST(pedir("POST", "no es json"))).status).toBe(400);
    expect((await POST(pedir("POST", VALIDA, { "content-length": "99999" }))).status).toBe(413);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("responde 429 al pasarse del tope y 500 si la base falla", async () => {
    limite.mockResolvedValue(false);
    expect((await POST(pedir("POST", VALIDA))).status).toBe(429);
    limite.mockResolvedValue(true);
    upsert.mockResolvedValue({ error: { message: "falla" } });
    expect((await POST(pedir("POST", VALIDA))).status).toBe(500);
  });
});

describe("DELETE /api/notificaciones/suscribir", () => {
  it("quita la suscripción de la dirección dada (la base solo deja borrar las propias)", async () => {
    expect((await DELETE(pedir("DELETE", { endpoint: FCM }))).status).toBe(200);
    expect(borrarPropia).toHaveBeenCalledWith("endpoint", FCM);
  });

  it("pide sesión y una dirección válida", async () => {
    expect((await DELETE(pedir("DELETE", {}))).status).toBe(400);
    usuario.mockReturnValue(null);
    expect((await DELETE(pedir("DELETE", { endpoint: FCM }))).status).toBe(401);
  });
});

describe("POST /api/notificaciones/prueba", () => {
  it("sin sesión responde 401", async () => {
    usuario.mockReturnValue(null);
    expect((await prueba()).status).toBe(401);
  });

  it("avisa si el servidor no está configurado o si este aparato no tiene las notificaciones activadas", async () => {
    configurado.mockReturnValue(false);
    expect((await prueba()).status).toBe(503);
    configurado.mockReturnValue(true);
    leerPropias.mockResolvedValue({ data: [], error: null });
    expect((await prueba()).status).toBe(409);
    expect(enviarASubs).not.toHaveBeenCalled();
  });

  it("manda la prueba a los aparatos de la persona y responde cuántos recibieron", async () => {
    const r = await prueba();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, enviadas: 1 });
    expect(enviarASubs).toHaveBeenCalledWith(
      [{ endpoint: FCM, p256dh: P256DH, auth: AUTH }],
      expect.objectContaining({ titulo: "Notificación de prueba", url: "/cuenta" })
    );
  });

  it("limpia las suscripciones caducadas y responde 502 si no llegó a ningún aparato", async () => {
    enviarASubs.mockResolvedValue({ enviadas: 0, caducadas: [FCM], fallidas: 0 });
    expect((await prueba()).status).toBe(502);
    expect(borrarCaducadas).toHaveBeenCalledWith("endpoint", [FCM]);
  });

  it("responde 429 al pasarse del tope", async () => {
    limite.mockResolvedValue(false);
    expect((await prueba()).status).toBe(429);
  });
});
