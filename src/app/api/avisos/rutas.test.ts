import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (f: () => unknown) => void f(),
}));

const usuario = vi.fn();
const leerAvisos = vi.fn();
const leerMarcas = vi.fn();
const upsert = vi.fn();
const filtros: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: usuario() } }) },
    from: (tabla: string) => {
      if (tabla === "avisos") {
        const c = {
          select: () => c,
          eq: (col: string, v: string) => (filtros.push(`${col}=${v}`), c),
          gte: () => c,
          order: () => c,
          limit: () => c,
          returns: leerAvisos,
        };
        return c;
      }
      return {
        select: () => ({ in: () => ({ returns: leerMarcas }) }),
        upsert,
      };
    },
  }),
}));

const despachar = vi.fn();
vi.mock("@/lib/notificaciones/despachar", () => ({ despacharAvisos: (...a: unknown[]) => despachar(...a) }));

import { GET } from "./route";
import { POST } from "./leer/route";

const ID = "11111111-1111-4111-8111-111111111111";
const fila = (id: string, extra = {}) => ({
  id,
  area: "produccion",
  tipo: "liberado",
  titulo: "Se liberó 1 mueble a Producción",
  cuerpo: "O.T. 102-24",
  url: "/produccion/panel",
  creado_en: "2026-11-13T12:00:00Z",
  ...extra,
});
const pedir = (area?: string) => new Request(`http://x/api/avisos${area ? `?area=${area}` : ""}`);
const marcar = (cuerpo: unknown) =>
  new Request("http://x/api/avisos/leer", { method: "POST", body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

beforeEach(() => {
  filtros.length = 0;
  usuario.mockReset().mockReturnValue({ id: "u1" });
  leerAvisos.mockReset().mockResolvedValue({ data: [], error: null });
  leerMarcas.mockReset().mockResolvedValue({ data: [], error: null });
  upsert.mockReset().mockResolvedValue({ error: null });
  despachar.mockReset().mockResolvedValue(0);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/avisos", () => {
  it("sin sesión da 401 y sin área válida, 400", async () => {
    usuario.mockReturnValue(null);
    expect((await GET(pedir("produccion"))).status).toBe(401);
    usuario.mockReturnValue({ id: "u1" });
    expect((await GET(pedir())).status).toBe(400);
    expect((await GET(pedir("finanzas"))).status).toBe(400);
  });

  it("trae los avisos del área con cuáles ya leyó y cuántos le faltan", async () => {
    leerAvisos.mockResolvedValue({ data: [fila(ID), fila("22222222-2222-4222-8222-222222222222")], error: null });
    leerMarcas.mockResolvedValue({ data: [{ aviso_id: ID }], error: null });
    const res = await GET(pedir("produccion"));
    const cuerpo = await res.json();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(filtros).toContain("area=produccion");
    expect(cuerpo.disponible).toBe(true);
    expect(cuerpo.noLeidos).toBe(1);
    expect(cuerpo.avisos[0]).toMatchObject({ id: ID, titulo: "Se liberó 1 mueble a Producción", creadoEn: "2026-11-13T12:00:00Z", leido: true });
    expect(cuerpo.avisos[1].leido).toBe(false);
  });

  it("reparte al celular los avisos que esta persona provocó", async () => {
    await GET(pedir("calidad"));
    expect(despachar).toHaveBeenCalledWith("u1");
  });

  it("si la tabla de avisos no existe todavía responde 'no disponible' sin romper", async () => {
    leerAvisos.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });
    const res = await GET(pedir("produccion"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ disponible: false, avisos: [], noLeidos: 0 });
  });
});

describe("POST /api/avisos/leer", () => {
  it("sin sesión da 401, con cuerpo roto o ids malos, 400", async () => {
    usuario.mockReturnValue(null);
    expect((await POST(marcar({ ids: [ID] }))).status).toBe(401);
    usuario.mockReturnValue({ id: "u1" });
    expect((await POST(marcar("{no es json"))).status).toBe(400);
    expect((await POST(marcar({ ids: ["x"] }))).status).toBe(400);
    expect((await POST(marcar({ ids: [] }))).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("marca a nombre de quien tiene la sesión, ignorando repetidos", async () => {
    const res = await POST(marcar({ ids: [ID, ID] }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith([{ aviso_id: ID, user_id: "u1" }], { onConflict: "aviso_id,user_id", ignoreDuplicates: true });
  });

  it("si la base falla responde 500", async () => {
    upsert.mockResolvedValue({ error: { message: "falla" } });
    expect((await POST(marcar({ ids: [ID] }))).status).toBe(500);
  });
});
