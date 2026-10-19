import { describe, expect, it } from "vitest";
import { ErrorLectura } from "./paginar";
import { leerPorLotes, partir } from "./por-lotes";

describe("partir", () => {
  it("corta la lista en lotes del tamaño pedido", () => {
    expect(partir([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(partir([], 3)).toEqual([]);
    expect(partir([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("rechaza un tamaño menor que 1", () => {
    expect(() => partir([1], 0)).toThrow();
  });
});

describe("leerPorLotes", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);

  it("pide cada lote por separado y junta las filas en orden", async () => {
    const tamanos: number[] = [];
    const filas = await leerPorLotes(ids, async (lote) => {
      tamanos.push(lote.length);
      return { data: lote.map((id) => ({ id })), error: null };
    });
    expect(tamanos).toEqual([100, 100, 50]);
    expect(filas).toHaveLength(250);
    expect(filas.map((f) => f.id)).toEqual(ids);
  });

  it("respeta el tamaño de lote y no pide más lotes a la vez que el tope", async () => {
    let enCurso = 0;
    let maximo = 0;
    await leerPorLotes(
      ids,
      async (lote) => {
        enCurso += 1;
        maximo = Math.max(maximo, enCurso);
        await new Promise((r) => setTimeout(r, 5));
        enCurso -= 1;
        return { data: lote, error: null };
      },
      { lote: 10, simultaneas: 3 }
    );
    expect(maximo).toBe(3);
  });

  it("sin valores no hace ninguna consulta", async () => {
    let llamadas = 0;
    const filas = await leerPorLotes([], async () => {
      llamadas += 1;
      return { data: [], error: null };
    });
    expect(filas).toEqual([]);
    expect(llamadas).toBe(0);
  });

  it("si un lote falla lanza el error, no devuelve una lista incompleta", async () => {
    const intento = leerPorLotes(
      ids,
      async (lote) => (lote[0] === "id-100" ? { data: null, error: { message: "URI demasiado larga" } } : { data: lote, error: null }),
      { contexto: "las imágenes" }
    );
    await expect(intento).rejects.toBeInstanceOf(ErrorLectura);
    await expect(intento).rejects.toThrow("No se pudo leer las imágenes: URI demasiado larga");
  });

  it("trata data nulo sin error como lote vacío", async () => {
    const filas = await leerPorLotes(["a"], async () => ({ data: null, error: null }));
    expect(filas).toEqual([]);
  });
});
