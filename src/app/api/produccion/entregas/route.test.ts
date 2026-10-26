import { beforeEach, describe, expect, it, vi } from "vitest";

const ASIGNACION = "11111111-1111-4111-8111-111111111111";
const CLAVE = "0b0e7a4e-6c1c-4d1e-9c5e-2f6a3b9d8e11";

const maybeSingle = vi.fn();
const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    rpc,
  }),
}));
vi.mock("@/lib/auth/get-perfil", () => ({
  getPerfilActual: async () => ({ userId: "u1", rol: "trabajador", area: "produccion" }),
  puedeEditarProduccion: () => true,
}));

import { POST } from "./route";

function peticion(extra: Record<string, string | null> = {}) {
  const f = new FormData();
  f.set("asignacionId", ASIGNACION);
  f.set("fecha", "2026-10-01");
  f.set("cantidad", "3");
  f.set("folios", "CAL-000123");
  f.set("claveEnvio", CLAVE);
  for (const [k, v] of Object.entries(extra)) {
    if (v === null) f.delete(k);
    else f.set(k, v);
  }
  return new Request("http://x/api/produccion/entregas", { method: "POST", body: f });
}

beforeEach(() => {
  maybeSingle.mockReset().mockResolvedValue({ data: null });
  rpc.mockReset().mockResolvedValue({ data: "entrega-1", error: null });
});

describe("POST /api/produccion/entregas", () => {
  it("registra la entrega con su clave de envío, sin foto ni calificación", async () => {
    const r = await POST(peticion());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, id: "entrega-1" });
    expect(rpc).toHaveBeenCalledWith("registrar_entrega_produccion", {
      p_asignacion_id: ASIGNACION,
      p_fecha_entrega: "2026-10-01",
      p_cantidad: 3,
      p_folios_calidad: "CAL-000123",
      p_clave_envio: CLAVE,
    });
  });

  it("una captura vieja con foto y calificación se registra igual (se ignoran)", async () => {
    const f = await peticion({ resultado: "no_cumple", motivo: "Rayones" }).formData();
    f.set("foto", new File(["jpg"], "folios.jpg", { type: "image/jpeg" }));
    const r = await POST(new Request("http://x/api/produccion/entregas", { method: "POST", body: f }));
    expect(r.status).toBe(200);
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_resultado");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_foto_path");
  });

  it("dos envíos iguales a la vez: el perdedor recibe la entrega ganadora", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key value" } });
    maybeSingle.mockResolvedValue({ data: { id: "entrega-ganadora" } });
    const r = await POST(peticion());
    expect(await r.json()).toEqual({ ok: true, id: "entrega-ganadora", repetida: true });
  });

  it("una regla de la base es 400 y no se reintenta", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "ERROR: Solo faltan 2 por entregar de 5." } });
    const r = await POST(peticion());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Solo faltan 2 por entregar de 5.");
  });

  it("una falla pasajera con la base responde 500 (el celular reintenta)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "08006", message: "connection failure" } });
    expect((await POST(peticion())).status).toBe(500);
  });

  it("un cliente viejo sin claveEnvio sigue funcionando (se genera una)", async () => {
    const r = await POST(peticion({ claveEnvio: null }));
    expect(r.status).toBe(200);
    const clave = rpc.mock.calls[0][1].p_clave_envio;
    expect(clave).toMatch(/^[0-9a-f-]{36}$/);
    expect(clave).not.toBe(CLAVE);
  });

  it("sigue validando lo de siempre: sin folio es 400", async () => {
    expect((await POST(peticion({ folios: "  " }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
