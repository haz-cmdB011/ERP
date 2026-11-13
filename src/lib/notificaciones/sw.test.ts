import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Ejecuta public/sw.js con un `self` simulado y deja ver qué hace con un aviso y con un toque en él.
const CODIGO = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGEN = "https://erp.example";

interface Ventana {
  url: string;
  focus: () => Promise<Ventana>;
  navigate?: (url: string) => Promise<Ventana>;
}

function cargar(ventanas: Ventana[] = []) {
  const escuchas: Record<string, (e: unknown) => void> = {};
  const mostradas: [string, Record<string, unknown>][] = [];
  const abiertas: string[] = [];
  const self = {
    addEventListener: (tipo: string, f: (e: unknown) => void) => (escuchas[tipo] = f),
    skipWaiting: vi.fn(),
    location: { origin: ORIGEN },
    clients: {
      claim: vi.fn(),
      matchAll: async () => ventanas,
      openWindow: async (url: string) => void abiertas.push(url),
    },
    registration: {
      showNotification: (titulo: string, opciones: Record<string, unknown>) => {
        mostradas.push([titulo, opciones]);
        return Promise.resolve();
      },
    },
  };
  runInNewContext(CODIGO, { self, URL });
  return { escuchas, mostradas, abiertas, self };
}

async function disparar(manejador: (e: unknown) => void, evento: Record<string, unknown>) {
  const promesas: Promise<unknown>[] = [];
  manejador({ ...evento, waitUntil: (p: Promise<unknown>) => promesas.push(p) });
  await Promise.all(promesas);
}

const aviso = (datos: unknown) => ({ data: { json: () => datos } });
const toque = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });

describe("service worker de notificaciones", () => {
  it("solo atiende avisos y toques: no intercepta peticiones ni usa caché", () => {
    const { escuchas } = cargar();
    expect(Object.keys(escuchas).sort()).toEqual(["activate", "install", "notificationclick", "push"]);
  });

  it("al recibir un aviso muestra el título, el texto, el ícono y guarda la pantalla a abrir", async () => {
    const { escuchas, mostradas } = cargar();
    await disparar(escuchas.push, aviso({ titulo: "Se liberó un mueble", cuerpo: "O.T. 009-26", url: "/produccion/panel", etiqueta: "liberado" }));
    expect(mostradas).toEqual([
      [
        "Se liberó un mueble",
        { body: "O.T. 009-26", icon: "/icons/icon-192.png", tag: "liberado", data: { url: "/produccion/panel" } },
      ],
    ]);
  });

  it("siempre muestra algo (el navegador lo exige), aunque el aviso llegue vacío o dañado", async () => {
    const vacio = cargar();
    await disparar(vacio.escuchas.push, { data: null });
    expect(vacio.mostradas[0][0]).toBe("ERP Mobiliarium");

    const danado = cargar();
    await disparar(danado.escuchas.push, {
      data: {
        json: () => {
          throw new Error("no es JSON");
        },
      },
    });
    expect(danado.mostradas[0][0]).toBe("ERP Mobiliarium");
    expect(danado.mostradas[0][1].data).toEqual({ url: "/" });
  });

  it("recorta títulos y textos largos", async () => {
    const { escuchas, mostradas } = cargar();
    await disparar(escuchas.push, aviso({ titulo: "t".repeat(300), cuerpo: "c".repeat(900) }));
    expect(mostradas[0][0]).toHaveLength(80);
    expect((mostradas[0][1].body as string).length).toBe(200);
  });

  it("al tocarlo abre la pantalla del aviso si la app no estaba abierta", async () => {
    const { escuchas, abiertas } = cargar();
    const evento = toque("/produccion/panel?ids=1");
    await disparar(escuchas.notificationclick, evento);
    expect(evento.notification.close).toHaveBeenCalled();
    expect(abiertas).toEqual([`${ORIGEN}/produccion/panel?ids=1`]);
  });

  it("si la app ya estaba abierta la enfoca y la lleva a la pantalla del aviso", async () => {
    const llevada: string[] = [];
    const ventana: Ventana = {
      url: `${ORIGEN}/planeacion`,
      focus: async () => ventana,
      navigate: async (url) => (llevada.push(url), ventana),
    };
    const { escuchas, abiertas } = cargar([ventana]);
    await disparar(escuchas.notificationclick, toque("/calidad"));
    expect(llevada).toEqual([`${ORIGEN}/calidad`]);
    expect(abiertas).toEqual([]);
  });

  it("nunca abre una dirección de otro sitio: cualquier otra lleva al inicio", async () => {
    for (const mala of ["https://evil.com/x", "//evil.com", "javascript:alert(1)", 5, null]) {
      const { escuchas, abiertas } = cargar();
      await disparar(escuchas.notificationclick, toque(mala));
      expect(abiertas, String(mala)).toEqual([`${ORIGEN}/`]);
    }
  });
});
