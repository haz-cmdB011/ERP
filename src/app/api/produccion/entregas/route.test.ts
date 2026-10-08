import { beforeEach, describe, expect, it, vi } from "vitest";

const ASIGNACION = "11111111-1111-4111-8111-111111111111";
const CLAVE = "0b0e7a4e-6c1c-4d1e-9c5e-2f6a3b9d8e11";
const RUTA = `${ASIGNACION}/${CLAVE}.webp`;

const maybeSingle = vi.fn();
const subir = vi.fn();
const rpc = vi.fn();
const quitar = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    storage: { from: () => ({ upload: subir }) },
    rpc,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ remove: quitar }) } }),
}));
vi.mock("@/lib/auth/get-perfil", () => ({
  getPerfilActual: async () => ({ userId: "u1", rol: "trabajador", area: "produccion" }),
  puedeEditarProduccion: () => true,
}));
vi.mock("@/lib/produccion/foto-entrega", () => ({
  comprimirFotoEntrega: async () => Buffer.from("webp"),
  TAMANO_MAXIMO_FOTO: 4 * 1024 * 1024,
}));

import { POST } from "./route";

function peticion(extra: Record<string, string | null> = {}) {
  const f = new FormData();
  f.set("asignacionId", ASIGNACION);
  f.set("fecha", "2026-10-01");
  f.set("cantidad", "3");
  f.set("folios", "CAL-000123");
  f.set("foto", new File(["jpg"], "folios.jpg", { type: "image/jpeg" }));
  f.set("claveEnvio", CLAVE);
  for (const [k, v] of Object.entries(extra)) {
    if (v === null) f.delete(k);
    else f.set(k, v);
  }
  return new Request("http://x/api/produccion/entregas", { method: "POST", body: f });
}

beforeEach(() => {
  maybeSingle.mockReset().mockResolvedValue({ data: null });
  subir.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ data: "entrega-1", error: null });
  quitar.mockReset().mockResolvedValue({});
});

describe("POST /api/produccion/entregas", () => {
  it("registra la entrega con la foto en una ruta que sale de la clave de envío", async () => {
    const r = await POST(peticion());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: "entrega-1" });
    expect(subir).toHaveBeenCalledWith(RUTA, expect.anything(), expect.objectContaining({ contentType: "image/webp" }));
    expect(rpc).toHaveBeenCalledWith("registrar_entrega_produccion", expect.objectContaining({ p_foto_path: RUTA }));
  });

  it("un reintento de un envío ya registrado devuelve la misma entrega sin subir ni registrar de nuevo", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "entrega-previa" } });
    const r = await POST(peticion());
    expect(await r.json()).toEqual({ ok: true, id: "entrega-previa", repetida: true });
    expect(subir).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("si un intento anterior ya subió la foto (se cortó antes de registrar), la reutiliza y registra", async () => {
    subir.mockResolvedValue({ error: { statusCode: "409", message: "The resource already exists" } });
    const r = await POST(peticion());
    expect(r.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("dos envíos iguales a la vez: el perdedor recibe la entrega ganadora y NO se borra su foto", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value" } });
    maybeSingle.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: { id: "entrega-ganadora" } });
    const r = await POST(peticion());
    expect(await r.json()).toEqual({ ok: true, id: "entrega-ganadora", repetida: true });
    expect(quitar).not.toHaveBeenCalled();
  });

  it("una regla de la base (400) borra la foto y no se reintenta", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "ERROR: Solo faltan 2 por entregar de 5." } });
    const r = await POST(peticion());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Solo faltan 2 por entregar de 5.");
    expect(quitar).toHaveBeenCalledWith([RUTA]);
  });

  it("una falla pasajera con la base responde 500 (el celular reintenta) y limpia la foto", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    const r = await POST(peticion());
    expect(r.status).toBe(500);
    expect(quitar).toHaveBeenCalledWith([RUTA]);
  });

  it("una subida de foto que falla de verdad responde 500", async () => {
    subir.mockResolvedValue({ error: { statusCode: "500", message: "Internal error" } });
    const r = await POST(peticion());
    expect(r.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("un cliente viejo sin claveEnvio sigue funcionando (se genera una)", async () => {
    const r = await POST(peticion({ claveEnvio: null }));
    expect(r.status).toBe(200);
    const [ruta] = subir.mock.calls[0];
    expect(ruta).toMatch(new RegExp(`^${ASIGNACION}/[0-9a-f-]{36}\\.webp$`));
    expect(ruta).not.toBe(RUTA);
  });

  it("sigue validando lo de siempre: sin foto es 400", async () => {
    expect((await POST(peticion({ foto: null }))).status).toBe(400);
  });
});
