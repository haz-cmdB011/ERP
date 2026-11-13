import { describe, expect, it } from "vitest";
import { enParalelo, tandas } from "./tandas";

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
