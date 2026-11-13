import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarAUsuarios = vi.fn();
const configurado = vi.fn();
vi.mock("./enviar", () => ({
  enviarAUsuarios: (...a: unknown[]) => enviarAUsuarios(...a),
  notificacionesConfiguradas: () => configurado(),
}));

const reclamar = vi.fn();
const leerPersonal = vi.fn();
const filtros: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      if (tabla === "avisos") {
        const cadena = {
          update: (valores: Record<string, unknown>) => (filtros.push(`update:${Object.keys(valores)}`), cadena),
          eq: (c: string, v: string) => (filtros.push(`eq:${c}=${v}`), cadena),
          is: (c: string, v: unknown) => (filtros.push(`is:${c}=${v}`), cadena),
          gte: (c: string) => (filtros.push(`gte:${c}`), cadena),
          select: () => cadena,
          returns: reclamar,
        };
        return cadena;
      }
      const personal = {
        select: () => personal,
        in: (c: string, v: string[]) => (filtros.push(`personal:${c}=${v}`), personal),
        returns: leerPersonal,
      };
      return personal;
    },
  }),
}));

import { despacharAvisos } from "./despachar";

const aviso = (extra = {}) => ({
  id: "a1",
  area: "calidad",
  destinatario_id: null,
  tipo: "entrega",
  titulo: "Producción entregó 3 pza",
  cuerpo: "MS-01",
  url: "/calidad/entregas",
  creado_por: "u1",
  ...extra,
});

beforeEach(() => {
  filtros.length = 0;
  enviarAUsuarios.mockReset().mockResolvedValue({ enviadas: 1, caducadas: [], fallidas: 0 });
  configurado.mockReset().mockReturnValue(true);
  reclamar.mockReset().mockResolvedValue({ data: [], error: null });
  leerPersonal.mockReset().mockResolvedValue({ data: [], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("despacharAvisos", () => {
  it("sin las llaves de notificaciones no toca la base", async () => {
    configurado.mockReturnValue(false);
    expect(await despacharAvisos("u1")).toBe(0);
    expect(reclamar).not.toHaveBeenCalled();
  });

  it("solo reclama los avisos de quien llama, aún sin mandar y recientes", async () => {
    await despacharAvisos("u1");
    expect(filtros).toEqual(expect.arrayContaining(["update:push_enviado_en", "eq:creado_por=u1", "is:push_enviado_en=null", "gte:creado_en"]));
  });

  it("manda un aviso de área al personal de esa área, sin quien lo provocó", async () => {
    reclamar.mockResolvedValue({ data: [aviso()], error: null });
    leerPersonal.mockResolvedValue({
      data: [
        { id: "c1", area: "calidad" },
        { id: "u1", area: "calidad" },
      ],
      error: null,
    });
    expect(await despacharAvisos("u1")).toBe(1);
    expect(enviarAUsuarios).toHaveBeenCalledTimes(1);
    expect(enviarAUsuarios).toHaveBeenCalledWith(["c1"], {
      titulo: "Producción entregó 3 pza",
      cuerpo: "MS-01",
      url: "/calidad/entregas",
      etiqueta: "a1",
    });
    // Solo administradores y trabajadores: el desarrollador ve los avisos al entrar al área.
    expect(filtros).toContain("personal:rol=administrador,trabajador");
  });

  it("un aviso de una persona no consulta al personal del área", async () => {
    reclamar.mockResolvedValue({ data: [aviso({ area: "estimaciones", destinatario_id: "maq" })], error: null });
    await despacharAvisos("u1");
    expect(leerPersonal).not.toHaveBeenCalled();
    expect(enviarAUsuarios).toHaveBeenCalledWith(["maq"], expect.objectContaining({ etiqueta: "a1" }));
  });

  it("si nadie debe recibirlo no manda nada", async () => {
    reclamar.mockResolvedValue({ data: [aviso({ area: "planeacion" })], error: null });
    expect(await despacharAvisos("u1")).toBe(1);
    expect(enviarAUsuarios).not.toHaveBeenCalled();
  });

  it("no lanza si la base falla o la migración aún no está", async () => {
    reclamar.mockResolvedValue({ data: null, error: { message: "relation avisos does not exist" } });
    expect(await despacharAvisos("u1")).toBe(0);
    reclamar.mockRejectedValue(new Error("sin red"));
    expect(await despacharAvisos("u1")).toBe(0);
  });
});
