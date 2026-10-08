import { beforeEach, describe, expect, it, vi } from "vitest";

const limite = vi.fn();
const avisar = vi.fn();
const consulta = vi.fn();
vi.mock("@/lib/seguridad/limite-tasa", () => ({
  consumirLimite: (...a: unknown[]) => limite(...a),
  respuestaLimite: (m: string) => new Response(JSON.stringify({ error: m }), { status: 429 }),
}));
vi.mock("@/lib/observabilidad/alertas", async (original) => ({
  ...(await original<typeof import("@/lib/observabilidad/alertas")>()),
  avisarError: (...a: unknown[]) => avisar(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ limit: consulta }) }) }),
}));

import { POST as errores } from "./errores/route";
import { GET as salud } from "./salud/route";

const post = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  new Request("http://x/api/errores", {
    method: "POST",
    headers: { "x-forwarded-for": "1.2.3.4", ...cabeceras },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  });

beforeEach(() => {
  limite.mockReset().mockResolvedValue(true);
  avisar.mockReset().mockResolvedValue(true);
  consulta.mockReset();
});

describe("POST /api/errores", () => {
  it("reenvía un fallo del navegador al aviso, con el mensaje y la ruta limpios", async () => {
    const r = await errores(post({ mensaje: "boom ana@empresa.com", ruta: "/planeacion?x=1" }));
    expect(r.status).toBe(200);
    expect(avisar).toHaveBeenCalledWith(
      expect.objectContaining({ origen: "navegador", mensaje: "boom [correo]", ruta: "/planeacion" })
    );
  });

  it("rechaza cuerpos que no son JSON, sin mensaje o demasiado grandes", async () => {
    expect((await errores(post("no es json"))).status).toBe(400);
    expect((await errores(post({ ruta: "/x" }))).status).toBe(400);
    expect((await errores(post({ mensaje: "x".repeat(5000) }))).status).toBe(413);
    expect((await errores(post({ mensaje: "x" }, { "content-length": "99999" }))).status).toBe(413);
    expect(avisar).not.toHaveBeenCalled();
  });

  it("responde 429 al pasarse del tope por IP", async () => {
    limite.mockResolvedValue(false);
    expect((await errores(post({ mensaje: "x" }))).status).toBe(429);
    expect(avisar).not.toHaveBeenCalled();
  });
});

describe("GET /api/salud", () => {
  const llamar = () => salud(new Request("http://x/api/salud", { headers: { "x-forwarded-for": "1.2.3.4" } }));

  it("200 cuando la base responde", async () => {
    consulta.mockResolvedValue({ error: null });
    const r = await llamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, base: true });
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("503 cuando la base devuelve error o lanza", async () => {
    consulta.mockResolvedValueOnce({ error: { message: "x" } });
    expect((await llamar()).status).toBe(503);
    consulta.mockRejectedValueOnce(new Error("sin red"));
    const r = await llamar();
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, base: false });
  });

  it("429 al pasarse del tope por IP, sin consultar la base", async () => {
    limite.mockResolvedValue(false);
    expect((await llamar()).status).toBe(429);
    expect(consulta).not.toHaveBeenCalled();
  });
});
