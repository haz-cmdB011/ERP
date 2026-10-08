// Almacén de la cola de envíos en IndexedDB (lo único del navegador capaz de guardar fotos
// grandes). Las fotos se guardan como Blob tal cual. Si el navegador no tiene IndexedDB o
// la bloquea (algunos modos privados), `crearAlmacenIndexedDB` devuelve null y quien lo use
// debe avisar que no hay dónde guardar.

import type { AlmacenEnvios, Envio } from "./cola-envios";

const NOMBRE_BD = "erp-offline";
const VERSION = 1;
const TIENDA = "envios";

function abrir(fabrica: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const peticion = fabrica.open(NOMBRE_BD, VERSION);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains(TIENDA)) bd.createObjectStore(TIENDA, { keyPath: "id" });
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error ?? new Error("No se pudo abrir IndexedDB"));
    peticion.onblocked = () => rechazar(new Error("IndexedDB bloqueada"));
  });
}

function pedir<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error ?? new Error("Error de IndexedDB"));
  });
}

function terminar(tx: IDBTransaction): Promise<void> {
  return new Promise((resolver, rechazar) => {
    tx.oncomplete = () => resolver();
    tx.onerror = () => rechazar(tx.error ?? new Error("Error de IndexedDB"));
    tx.onabort = () => rechazar(tx.error ?? new Error("Transacción cancelada"));
  });
}

export function crearAlmacenIndexedDB(fabrica: IDBFactory | undefined = globalThis.indexedDB): AlmacenEnvios | null {
  if (!fabrica) return null;
  let abierta: Promise<IDBDatabase> | null = null;
  const bd = () => (abierta ??= abrir(fabrica).catch((e) => {
    abierta = null; // permite reintentar si falló al abrir
    throw e;
  }));

  async function escribir(operacion: (tienda: IDBObjectStore) => void): Promise<void> {
    const tx = (await bd()).transaction(TIENDA, "readwrite");
    operacion(tx.objectStore(TIENDA));
    await terminar(tx);
  }

  return {
    agregar: (envio: Envio) => escribir((t) => void t.add(envio)),
    // put y no update: el registro puede haber desaparecido si otra pestaña lo mandó; en
    // ese caso no se debe revivir (por eso se comprueba antes).
    async actualizar(envio: Envio) {
      const tx = (await bd()).transaction(TIENDA, "readwrite");
      const tienda = tx.objectStore(TIENDA);
      const existe = await pedir(tienda.count(envio.id));
      if (existe) tienda.put(envio);
      await terminar(tx);
    },
    quitar: (id: string) => escribir((t) => void t.delete(id)),
    async listar() {
      const tx = (await bd()).transaction(TIENDA, "readonly");
      const todos = await pedir(tx.objectStore(TIENDA).getAll() as IDBRequest<Envio[]>);
      return todos;
    },
  };
}
