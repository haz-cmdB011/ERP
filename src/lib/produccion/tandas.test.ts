import { describe, expect, it } from "vitest";
import { MUEBLES_POR_TANDA, enParalelo, leerEnTandas, tandas } from "./tandas";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("tandas", () => {
  it("parte la lista en tandas del tamaño pedido y la última puede quedar corta", () => {
    expect(tandas([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(tandas([], 3)).toEqual([]);
  });
});

describe("enParalelo", () => {
  it("devuelve los resultados en el orden de la lista aunque terminen desordenados", async () => {
    const r = await enParalelo([30, 5, 20, 1], async (ms, i) => {
      await espera(ms);
      return `${i}:${ms}`;
    });
    expect(r).toEqual(["0:30", "1:5", "2:20", "3:1"]);
  });

  it("nunca tiene más tareas a la vez que el límite", async () => {
    let enVuelo = 0;
    let maximo = 0;
    await enParalelo(
      Array.from({ length: 40 }, (_, i) => i),
      async () => {
        enVuelo++;
        maximo = Math.max(maximo, enVuelo);
        await espera(2);
        enVuelo--;
      },
      4
    );
    expect(maximo).toBe(4);
  });

  it("con una lista vacía no hace nada, y con límite 0 o negativo trabaja de a una", async () => {
    expect(await enParalelo([], async () => 1)).toEqual([]);
    let maximo = 0;
    let enVuelo = 0;
    await enParalelo([1, 2, 3], async () => {
      maximo = Math.max(maximo, ++enVuelo);
      await espera(1);
      enVuelo--;
    }, 0);
    expect(maximo).toBe(1);
  });

  it("si una tarea falla, falla todo y deja de lanzar las que faltaban", async () => {
    const lanzadas: number[] = [];
    await expect(
      enParalelo(
        [1, 2, 3, 4, 5, 6, 7, 8],
        async (n) => {
          lanzadas.push(n);
          await espera(2);
          if (n === 2) throw new Error("falla");
          return n;
        },
        2
      )
    ).rejects.toThrow("falla");
    expect(lanzadas.length).toBeLessThan(8);
  });
});

describe("leerEnTandas", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);

  it("pide por tandas de MUEBLES_POR_TANDA y junta las filas en orden", async () => {
    const lotes: string[][] = [];
    const filas = await leerEnTandas<string>(
      ids,
      async (lote) => {
        lotes.push(lote);
        return { data: lote, error: null };
      },
      "pruebas"
    );
    expect(lotes.map((l) => l.length)).toEqual([MUEBLES_POR_TANDA, MUEBLES_POR_TANDA, 50]);
    expect(filas).toEqual(ids);
  });

  it("si una tanda trae el tope de 1000 filas sigue pidiendo páginas (no se pierden filas)", async () => {
    const paginas: [number, number][] = [];
    const filas = await leerEnTandas<number>(
      ["a"],
      async (_lote, desde, hasta) => {
        paginas.push([desde, hasta]);
        const quedan = 1500 - desde;
        const n = Math.max(0, Math.min(hasta - desde + 1, quedan));
        return { data: Array.from({ length: n }, (_, i) => desde + i), error: null };
      },
      "pruebas"
    );
    expect(paginas).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(filas).toHaveLength(1500);
  });

  it("sin ids no consulta, y si la base falla lanza el error en vez de devolver datos parciales", async () => {
    let llamadas = 0;
    expect(await leerEnTandas<string>([], async () => (llamadas++, { data: [], error: null }), "x")).toEqual([]);
    expect(llamadas).toBe(0);
    await expect(
      leerEnTandas<string>(["a"], async () => ({ data: null, error: { message: "se cayó" } }), "las asignaciones")
    ).rejects.toThrow("No se pudo leer las asignaciones: se cayó");
  });
});
