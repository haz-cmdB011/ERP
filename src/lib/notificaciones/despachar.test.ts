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
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (nombre: string) => rpc(nombre),
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

import { despacharAvisos, despacharRecordatorios, reiniciarRecordatoriosParaPruebas } from "./despachar";

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
  rpc.mockReset().mockResolvedValue({ data: 2, error: null });
  reiniciarRecordatoriosParaPruebas();
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

describe("despacharRecordatorios", () => {
  const recordatorio = (extra = {}) =>
    aviso({ id: "r1", area: "produccion", tipo: "asignado_sin_entregar", titulo: "3 asignaciones siguen sin entregarse", creado_por: null, ...extra });

  it("pide a la base que genere los recordatorios y reparte los que no provocó nadie", async () => {
    reclamar.mockResolvedValue({ data: [recordatorio()], error: null });
    leerPersonal.mockResolvedValue({ data: [{ id: "p1", area: "produccion" }, { id: "p2", area: "produccion" }], error: null });
    expect(await despacharRecordatorios(1_000_000, true)).toBe(1);
    expect(rpc).toHaveBeenCalledWith("generar_recordatorios");
    expect(filtros).toContain("is:creado_por=null");
    // A toda el área, sin excluir a nadie: no hay quien lo haya provocado.
    expect(enviarAUsuarios).toHaveBeenCalledWith(["p1", "p2"], expect.objectContaining({ titulo: "3 asignaciones siguen sin entregarse" }));
  });

  it("un recordatorio personal solo le llega a esa persona", async () => {
    reclamar.mockResolvedValue({ data: [recordatorio({ tipo: "liberado_sin_asignar", destinatario_id: "u9" })], error: null });
    await despacharRecordatorios(1_000_000, true);
    expect(leerPersonal).not.toHaveBeenCalled();
    expect(enviarAUsuarios).toHaveBeenCalledWith(["u9"], expect.anything());
  });

  it("no vuelve a pedirlos antes de que pase el intervalo", async () => {
    await despacharRecordatorios(1_000_000);
    await despacharRecordatorios(1_000_000 + 5 * 60_000);
    expect(rpc).toHaveBeenCalledTimes(1);
    await despacharRecordatorios(1_000_000 + 11 * 60_000);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("sin las llaves de notificaciones los genera (salen en la campanita) pero no los manda", async () => {
    configurado.mockReturnValue(false);
    expect(await despacharRecordatorios(1_000_000, true)).toBe(0);
    expect(rpc).toHaveBeenCalled();
    expect(reclamar).not.toHaveBeenCalled();
  });

  it("no lanza si la migración aún no está o la base falla", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function generar_recordatorios does not exist" } });
    expect(await despacharRecordatorios(1_000_000, true)).toBe(0);
    rpc.mockRejectedValue(new Error("sin red"));
    expect(await despacharRecordatorios(1_000_000, true)).toBe(0);
    expect(reclamar).not.toHaveBeenCalled();
  });
});
