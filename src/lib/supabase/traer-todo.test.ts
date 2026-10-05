import { describe, expect, it } from "vitest";
import { traerTodo } from "./traer-todo";

describe("traerTodo", () => {
  it("pide páginas hasta que una viene incompleta", async () => {
    const total = Array.from({ length: 2300 }, (_, i) => i);
    const rangos: [number, number][] = [];
    const { data, error } = await traerTodo(async (desde, hasta) => {
      rangos.push([desde, hasta]);
      return { data: total.slice(desde, hasta + 1), error: null };
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2300);
    expect(rangos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("se detiene en el primer error", async () => {
    const { data, error } = await traerTodo<number>(async (desde) =>
      desde === 0 ? { data: Array(1000).fill(1), error: null } : { data: null, error: { message: "falló" } }
    );
    expect(error).toBe("falló");
    expect(data).toHaveLength(1000);
  });
});
