import { describe, expect, it } from "vitest";
import {
  EDAD_MINIMA_MS,
  agruparPorCarga,
  borrarConRespaldo,
  clasificarObjetos,
  pesoLegible,
  rutasReferenciadas,
  type ObjetoStorage,
} from "./huerfanos";

const AHORA = Date.parse("2026-10-08T12:00:00Z");
const hace = (horas: number) => new Date(AHORA - horas * 3600_000).toISOString();
const obj = (ruta: string, horas = 100, bytes = 1000): ObjetoStorage => ({ ruta, bytes, creado: hace(horas) });

describe("rutasReferenciadas", () => {
  it("mantiene vivas la imagen y su versión grande (-hd)", () => {
    const refs = rutasReferenciadas(["c1/12-0.webp", "c1/hoja-2/7-1.jpg"]);
    expect(refs).toEqual(new Set(["c1/12-0.webp", "c1/12-0-hd.webp", "c1/hoja-2/7-1.jpg", "c1/hoja-2/7-1-hd.webp"]));
  });
  it("sin filas no protege nada", () => {
    expect(rutasReferenciadas([]).size).toBe(0);
  });
});

describe("clasificarObjetos", () => {
  const refs = rutasReferenciadas(["c1/1-0.webp"]);

  it("separa referenciados, huérfanos viejos y huérfanos recientes", () => {
    const r = clasificarObjetos(
      [obj("c1/1-0.webp"), obj("c1/1-0-hd.webp"), obj("c2/5-0.webp", 500), obj("c3/9-0.webp", 2)],
      refs,
      AHORA
    );
    expect(r.referenciados.map((o) => o.ruta)).toEqual(["c1/1-0.webp", "c1/1-0-hd.webp"]);
    expect(r.huerfanos.map((o) => o.ruta)).toEqual(["c2/5-0.webp"]);
    expect(r.recientes.map((o) => o.ruta)).toEqual(["c3/9-0.webp"]);
  });

  it("NUNCA borra algo de menos de 24 h (puede ser de una carga en curso: sube antes de ingerir)", () => {
    const justo = clasificarObjetos([obj("c9/1-0.webp", 23.9)], refs, AHORA);
    expect(justo.huerfanos).toEqual([]);
    expect(justo.recientes).toHaveLength(1);
    const pasado = clasificarObjetos([obj("c9/1-0.webp", 24.1)], refs, AHORA);
    expect(pasado.huerfanos).toHaveLength(1);
    expect(EDAD_MINIMA_MS).toBe(86_400_000);
  });

  it("sin fecha legible se trata como reciente: ante la duda no se borra", () => {
    const r = clasificarObjetos([{ ruta: "c9/1-0.webp", bytes: 1, creado: null }, { ruta: "c9/2-0.webp", bytes: 1, creado: "no-es-fecha" }], refs, AHORA);
    expect(r.huerfanos).toEqual([]);
    expect(r.recientes).toHaveLength(2);
  });

  it("si la base no tiene ninguna fila, todo lo viejo sería huérfano (por eso el script exige cotejar contra la base)", () => {
    const r = clasificarObjetos([obj("c1/1-0.webp")], new Set(), AHORA);
    expect(r.huerfanos).toHaveLength(1);
  });
});

describe("agruparPorCarga", () => {
  it("agrupa por la primera carpeta (la carga), cuenta, pesa y da el rango de fechas, de mayor a menor", () => {
    const g = agruparPorCarga([
      { ruta: "A/1-0.webp", bytes: 100, creado: "2026-09-01T00:00:00Z" },
      { ruta: "A/hoja-2/3-0.webp", bytes: 50, creado: "2026-09-03T00:00:00Z" },
      { ruta: "B/1-0.webp", bytes: 10, creado: "2026-09-02T00:00:00Z" },
    ]);
    expect(g.map((x) => x.carga)).toEqual(["A", "B"]);
    expect(g[0]).toEqual({ carga: "A", archivos: 2, bytes: 150, desde: "2026-09-01T00:00:00Z", hasta: "2026-09-03T00:00:00Z" });
  });
});

describe("pesoLegible", () => {
  it("da unidades legibles", () => {
    expect(pesoLegible(512)).toBe("512 B");
    expect(pesoLegible(6_277_120)).toBe("6.0 MB");
    expect(pesoLegible(2048)).toBe("2 KB");
  });
});

describe("borrarConRespaldo", () => {
  const archivos = (n: number): ObjetoStorage[] => Array.from({ length: n }, (_, i) => obj(`c/${i}.webp`));
  const operaciones = () => {
    const eventos: string[] = [];
    return {
      eventos,
      ops: {
        descargar: async (ruta: string) => { eventos.push(`bajar ${ruta}`); return new Uint8Array([1, 2, 3]); },
        guardarRespaldo: async (ruta: string) => { eventos.push(`respaldar ${ruta}`); },
        borrarLote: async (rutas: string[]) => { eventos.push(`borrar ${rutas.length}`); },
      },
    };
  };

  it("respalda TODOS los archivos antes de borrar el primero", async () => {
    const { eventos, ops } = operaciones();
    await borrarConRespaldo(archivos(3), ops);
    const primerBorrado = eventos.findIndex((e) => e.startsWith("borrar"));
    expect(eventos.slice(0, primerBorrado).filter((e) => e.startsWith("respaldar"))).toHaveLength(3);
    expect(eventos.slice(primerBorrado).some((e) => e.startsWith("respaldar"))).toBe(false);
  });

  it("borra en lotes de 100 y cuenta lo borrado", async () => {
    const { eventos, ops } = operaciones();
    const r = await borrarConRespaldo(archivos(250), ops);
    expect(r.borrados).toBe(250);
    expect(eventos.filter((e) => e.startsWith("borrar"))).toEqual(["borrar 100", "borrar 100", "borrar 50"]);
  });

  it("si falla un respaldo NO se borra nada", async () => {
    const { eventos, ops } = operaciones();
    const fallando = { ...ops, descargar: async (ruta: string) => (ruta === "c/1.webp" ? null : new Uint8Array([1])) };
    await expect(borrarConRespaldo(archivos(3), fallando)).rejects.toThrow("No se borró nada");
    expect(eventos.some((e) => e.startsWith("borrar"))).toBe(false);
  });

  it("si la descarga lanza, tampoco se borra nada", async () => {
    const { eventos, ops } = operaciones();
    const fallando = { ...ops, descargar: async () => { throw new Error("red"); } };
    await expect(borrarConRespaldo(archivos(2), fallando)).rejects.toThrow("No se borró nada");
    expect(eventos.some((e) => e.startsWith("borrar"))).toBe(false);
  });

  it("si falla el borrado de un lote se detiene e informa cuántos llevaba", async () => {
    const { ops } = operaciones();
    let llamadas = 0;
    const fallando = { ...ops, borrarLote: async () => { if (++llamadas === 2) throw new Error("timeout"); } };
    await expect(borrarConRespaldo(archivos(250), fallando)).rejects.toThrow("tras 100 archivos: timeout");
    expect(llamadas).toBe(2);
  });

  it("sin archivos no hace nada", async () => {
    const { eventos, ops } = operaciones();
    expect(await borrarConRespaldo([], ops)).toEqual({ borrados: 0 });
    expect(eventos).toEqual([]);
  });
});
