import { describe, expect, it, vi } from "vitest";
import {
  MAX_INTENTOS_SERVIDOR,
  cantidadEnCola,
  clasificarEstado,
  crearAlmacenMemoria,
  crearEnvio,
  enviarOEncolar,
  enviosDe,
  esperaTras,
  procesarCola,
  type NuevoEnvio,
  type Transporte,
} from "./cola-envios";

const T0 = 1_000_000;
const datos = (extra: Partial<NuevoEnvio> = {}): NuevoEnvio => ({
  etiqueta: "Mesa · 3 pza",
  usuarioId: "u1",
  url: "/api/produccion/entregas",
  campos: { asignacionId: "a1", cantidad: "3" },
  archivos: [{ campo: "foto", nombre: "folios.jpg", blob: new Blob(["foto"], { type: "image/jpeg" }) }],
  grupo: "a1",
  cantidad: 3,
  ...extra,
});
const ok: Transporte = async () => ({ status: 200 });
const sinRed: Transporte = async () => {
  throw new TypeError("Failed to fetch");
};

describe("clasificarEstado", () => {
  it("2xx es listo; fallas pasajeras se reintentan; el resto es rechazo", () => {
    expect(clasificarEstado(200)).toBe("ok");
    expect(clasificarEstado(204)).toBe("ok");
    for (const s of [408, 425, 429, 500, 502, 503, 504]) expect(clasificarEstado(s), String(s)).toBe("reintentable");
    for (const s of [400, 401, 403, 404, 409, 413, 422]) expect(clasificarEstado(s), String(s)).toBe("rechazado");
  });
});

describe("esperaTras", () => {
  it("crece con los intentos y se queda en 10 minutos", () => {
    expect(esperaTras(1)).toBe(5_000);
    expect(esperaTras(2)).toBe(15_000);
    expect(esperaTras(6)).toBe(600_000);
    expect(esperaTras(50)).toBe(600_000);
    expect(esperaTras(0)).toBe(5_000);
  });
});

describe("crearEnvio", () => {
  it("usa su id como claveEnvio para que el servidor reconozca los reintentos", () => {
    const e = crearEnvio(datos({ id: "clave-1" }), T0);
    expect(e.id).toBe("clave-1");
    expect(e.campos.claveEnvio).toBe("clave-1");
    expect(e.campos.asignacionId).toBe("a1");
    expect(e.estado).toBe("pendiente");
    expect(e.proximoIntento).toBe(T0);
  });

  it("cada envío trae una clave distinta si no se le da una", () => {
    expect(crearEnvio(datos()).id).not.toBe(crearEnvio(datos()).id);
  });
});

describe("enviarOEncolar", () => {
  it("con red y éxito: se manda y no se guarda nada", async () => {
    const almacen = crearAlmacenMemoria();
    const r = await enviarOEncolar(datos(), { almacen, transporte: ok, ahora: T0 });
    expect(r).toEqual({ estado: "enviado" });
    expect(await almacen.listar()).toEqual([]);
  });

  it("sin red (el transporte lanza): se guarda completo con la foto y se reintenta después", async () => {
    const almacen = crearAlmacenMemoria();
    const r = await enviarOEncolar(datos({ id: "k" }), { almacen, transporte: sinRed, ahora: T0 });
    expect(r).toEqual({ estado: "en-cola" });
    const [guardado] = await almacen.listar();
    expect(guardado).toMatchObject({ id: "k", estado: "pendiente", intentos: 1, error: "Sin conexión" });
    expect(guardado.proximoIntento).toBe(T0 + 5_000);
    expect(guardado.archivos).toHaveLength(1);
    expect(guardado.archivos[0].blob.size).toBeGreaterThan(0);
  });

  it("si el aparato ya sabe que no hay red, ni siquiera lo intenta", async () => {
    const almacen = crearAlmacenMemoria();
    const transporte = vi.fn(ok);
    expect(await enviarOEncolar(datos(), { almacen, transporte, enLinea: false })).toEqual({ estado: "en-cola" });
    expect(transporte).not.toHaveBeenCalled();
    expect((await almacen.listar())[0]).toMatchObject({ intentos: 0, error: "Sin conexión" });
  });

  it("falla pasajera del servidor (503): se guarda para reintentar", async () => {
    const almacen = crearAlmacenMemoria();
    const r = await enviarOEncolar(datos(), { almacen, transporte: async () => ({ status: 503 }) });
    expect(r).toEqual({ estado: "en-cola" });
  });

  it("rechazo del servidor (400 con mensaje): NO se guarda, se devuelve para corregir", async () => {
    const almacen = crearAlmacenMemoria();
    const r = await enviarOEncolar(datos(), {
      almacen,
      transporte: async () => ({ status: 400, error: "Solo faltan 2 por entregar de 5." }),
    });
    expect(r).toEqual({ estado: "rechazado", mensaje: "Solo faltan 2 por entregar de 5." });
    expect(await almacen.listar()).toEqual([]);
  });

  it("sin dónde guardar (sin IndexedDB) y sin red: avisa en vez de perder el envío en silencio", async () => {
    const r = await enviarOEncolar(datos(), { almacen: null, transporte: sinRed });
    expect(r.estado).toBe("rechazado");
    expect(r.estado === "rechazado" && r.mensaje).toContain("no puede guardar");
  });

  it("si guardar falla (sin espacio): avisa", async () => {
    const almacen = { ...crearAlmacenMemoria(), agregar: () => Promise.reject(new Error("QuotaExceededError")) };
    const r = await enviarOEncolar(datos(), { almacen, transporte: sinRed });
    expect(r.estado).toBe("rechazado");
    expect(r.estado === "rechazado" && r.mensaje).toContain("poco espacio");
  });
});

async function cola(...envios: Parameters<typeof crearEnvio>[]) {
  const almacen = crearAlmacenMemoria();
  for (const [d, t] of envios) await almacen.agregar(crearEnvio(d, t));
  return almacen;
}

describe("procesarCola", () => {
  it("manda en orden de captura, de uno en uno, y los quita al lograrlo", async () => {
    const almacen = await cola([datos({ id: "b" }), T0 + 10], [datos({ id: "a" }), T0]);
    const orden: string[] = [];
    const transporte: Transporte = async (e) => {
      orden.push(e.id);
      return { status: 200 };
    };
    const r = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 + 100 });
    expect(orden).toEqual(["a", "b"]);
    expect(r.enviados.map((e) => e.id)).toEqual(["a", "b"]);
    expect(await almacen.listar()).toEqual([]);
  });

  it("solo manda los de la persona con sesión (el servidor registraría a quien esté dentro)", async () => {
    const almacen = await cola([datos({ id: "mio", usuarioId: "u1" }), T0], [datos({ id: "ajeno", usuarioId: "u2" }), T0]);
    const transporte = vi.fn(ok);
    await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect((await almacen.listar()).map((e) => e.id)).toEqual(["ajeno"]);
  });

  it("si cae la red se detiene en el primero, con espera creciente, sin perder nada", async () => {
    const almacen = await cola([datos({ id: "a" }), T0], [datos({ id: "b" }), T0 + 1]);
    const transporte = vi.fn(sinRed);
    const r = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 + 10 });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ enviados: [], rechazados: [], pendientes: 2 });
    const guardados = await almacen.listar();
    const a = guardados.find((e) => e.id === "a")!;
    expect(a).toMatchObject({ intentos: 1, error: "Sin conexión" });
    expect(a.proximoIntento).toBe(T0 + 10 + 5_000);
  });

  it("respeta la espera: no reintenta antes de tiempo, salvo que se fuerce", async () => {
    const almacen = await cola([datos({ id: "a" }), T0]);
    await procesarCola({ almacen, transporte: sinRed, usuarioId: "u1", ahora: T0 });
    const transporte = vi.fn(ok);
    const pronto = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 + 1000 });
    expect(transporte).not.toHaveBeenCalled();
    expect(pronto.pendientes).toBe(1);
    const forzado = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 + 1000, forzar: true });
    expect(forzado.enviados).toHaveLength(1);
  });

  it("un rechazo del servidor queda marcado con su mensaje y no frena a los demás", async () => {
    const almacen = await cola([datos({ id: "malo" }), T0], [datos({ id: "bueno" }), T0 + 1]);
    const transporte: Transporte = async (e) =>
      e.id === "malo" ? { status: 400, error: "La asignación está cancelada." } : { status: 200 };
    const r = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 + 5 });
    expect(r.enviados.map((e) => e.id)).toEqual(["bueno"]);
    expect(r.rechazados.map((e) => e.id)).toEqual(["malo"]);
    const [resto] = await almacen.listar();
    expect(resto).toMatchObject({ id: "malo", estado: "rechazado", error: "La asignación está cancelada." });
  });

  it("los rechazados no se vuelven a mandar solos", async () => {
    const almacen = await cola([datos({ id: "malo" }), T0]);
    await procesarCola({ almacen, transporte: async () => ({ status: 400, error: "x" }), usuarioId: "u1", ahora: T0 });
    const transporte = vi.fn(ok);
    await procesarCola({ almacen, transporte, usuarioId: "u1", ahora: T0 + 1e9, forzar: true });
    expect(transporte).not.toHaveBeenCalled();
  });

  it("una falla del servidor que no se arregla tras varios intentos pasa a rechazada", async () => {
    const almacen = await cola([datos({ id: "a" }), T0]);
    const transporte: Transporte = async () => ({ status: 500 });
    let ahora = T0;
    let ultimo = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora, forzar: true });
    for (let i = 1; i < MAX_INTENTOS_SERVIDOR; i++) {
      ahora += 1_000_000;
      ultimo = await procesarCola({ almacen, transporte, usuarioId: "u1", ahora, forzar: true });
    }
    expect(ultimo.rechazados).toHaveLength(1);
    const [resto] = await almacen.listar();
    expect(resto.estado).toBe("rechazado");
    expect(resto.error).toContain("falló");
  });

  it("un corte de red NUNCA la pasa a rechazada, por muchos intentos que haya", async () => {
    const almacen = await cola([datos({ id: "a" }), T0]);
    for (let i = 0; i < MAX_INTENTOS_SERVIDOR * 3; i++) {
      await procesarCola({ almacen, transporte: sinRed, usuarioId: "u1", ahora: T0 + i * 1e7, forzar: true });
    }
    expect((await almacen.listar())[0].estado).toBe("pendiente");
  });
});

describe("consultas", () => {
  it("enviosDe lista solo los de la persona, en orden; cantidadEnCola suma los pendientes de un grupo", async () => {
    const almacen = await cola(
      [datos({ id: "2", cantidad: 2, grupo: "a1" }), T0 + 2],
      [datos({ id: "1", cantidad: 3, grupo: "a1" }), T0 + 1],
      [datos({ id: "x", cantidad: 9, grupo: "otra" }), T0],
      [datos({ id: "ajeno", usuarioId: "u2", cantidad: 7, grupo: "a1" }), T0]
    );
    const mios = await enviosDe(almacen, "u1");
    expect(mios.map((e) => e.id)).toEqual(["x", "1", "2"]);
    expect(cantidadEnCola(mios, "a1")).toBe(5);
    expect(cantidadEnCola(mios, "no-existe")).toBe(0);
    const rechazado = { ...mios[1], estado: "rechazado" as const };
    expect(cantidadEnCola([rechazado, mios[2]], "a1")).toBe(2);
  });
});
