import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { crearAlmacenIndexedDB } from "./almacen-indexeddb";
import { crearEnvio, enviarOEncolar, procesarCola, type Transporte } from "./cola-envios";

const nuevo = (id: string, creadoEn = 1000) =>
  crearEnvio(
    {
      id,
      etiqueta: `Envío ${id}`,
      usuarioId: "u1",
      url: "/api/x",
      campos: { a: "1" },
      archivos: [{ campo: "foto", nombre: "f.jpg", blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "image/jpeg" }) }],
      grupo: "g",
      cantidad: 2,
    },
    creadoEn
  );

let fabrica: IDBFactory;
beforeEach(() => {
  fabrica = new IDBFactory(); // base limpia en cada prueba
});

describe("almacén en IndexedDB", () => {
  it("devuelve null si el navegador no tiene IndexedDB", () => {
    expect(crearAlmacenIndexedDB(undefined)).toBeNull();
  });

  it("guarda, lista, actualiza y quita envíos, con la foto intacta", async () => {
    const almacen = crearAlmacenIndexedDB(fabrica)!;
    await almacen.agregar(nuevo("a"));
    await almacen.agregar(nuevo("b", 2000));

    const lista = await almacen.listar();
    expect(lista.map((e) => e.id).sort()).toEqual(["a", "b"]);
    const a = lista.find((e) => e.id === "a")!;
    expect(a.archivos[0].blob.size).toBe(5);
    expect(a.archivos[0].nombre).toBe("f.jpg");
    expect(a.campos.claveEnvio).toBe("a");

    await almacen.actualizar({ ...a, intentos: 3, error: "Sin conexión" });
    expect((await almacen.listar()).find((e) => e.id === "a")).toMatchObject({ intentos: 3, error: "Sin conexión" });

    await almacen.quitar("a");
    expect((await almacen.listar()).map((e) => e.id)).toEqual(["b"]);
  });

  it("no revive un envío que otra pestaña ya mandó (actualizar de uno borrado no lo recrea)", async () => {
    const almacen = crearAlmacenIndexedDB(fabrica)!;
    const e = nuevo("a");
    await almacen.agregar(e);
    await almacen.quitar("a");
    await almacen.actualizar({ ...e, intentos: 5 });
    expect(await almacen.listar()).toEqual([]);
  });

  it("los envíos sobreviven a cerrar y volver a abrir (misma base)", async () => {
    await crearAlmacenIndexedDB(fabrica)!.agregar(nuevo("persistente"));
    const reabierto = crearAlmacenIndexedDB(fabrica)!;
    expect((await reabierto.listar()).map((e) => e.id)).toEqual(["persistente"]);
  });

  it("flujo completo: sin red se guarda y al volver la red se manda y se limpia", async () => {
    const almacen = crearAlmacenIndexedDB(fabrica)!;
    const sinRed: Transporte = async () => {
      throw new TypeError("Failed to fetch");
    };
    const r = await enviarOEncolar(
      { id: "e1", etiqueta: "Mesa", usuarioId: "u1", url: "/api/x", campos: {}, archivos: [], cantidad: 1 },
      { almacen, transporte: sinRed, ahora: 1000 }
    );
    expect(r.estado).toBe("en-cola");

    const enviados: string[] = [];
    const conRed: Transporte = async (e) => {
      enviados.push(e.campos.claveEnvio);
      return { status: 200 };
    };
    const resumen = await procesarCola({ almacen, transporte: conRed, usuarioId: "u1", forzar: true });
    expect(enviados).toEqual(["e1"]);
    expect(resumen.enviados).toHaveLength(1);
    expect(await almacen.listar()).toEqual([]);
  });
});
