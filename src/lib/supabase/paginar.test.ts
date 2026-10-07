import { describe, expect, it, vi } from "vitest";
import { ErrorLectura, TAMANO_PAGINA, paginarTodo } from "./paginar";

// Tabla falsa de n filas que responde por rangos, como la API.
function tabla(n: number) {
  const filas = Array.from({ length: n }, (_, i) => i);
  return vi.fn(async (desde: number, hasta: number) => ({
    data: filas.slice(desde, Math.min(hasta, desde + TAMANO_PAGINA - 1) + 1),
    error: null,
  }));
}

describe("paginarTodo", () => {
  it("trae todo cuando supera las 1000 filas", async () => {
    const pedir = tabla(2500);
    const filas = await paginarTodo(pedir);
    expect(filas).toHaveLength(2500);
    expect(filas[2499]).toBe(2499);
    expect(pedir).toHaveBeenCalledTimes(3);
  });

  it("con exactamente 1000 filas pide una página más para confirmar el final", async () => {
    const pedir = tabla(1000);
    expect(await paginarTodo(pedir)).toHaveLength(1000);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("devuelve lista vacía si de verdad no hay filas", async () => {
    expect(await paginarTodo(tabla(0))).toEqual([]);
  });

  it("lanza el error en vez de devolver una lista parcial", async () => {
    const pedir = vi
      .fn()
      .mockResolvedValueOnce({ data: Array(TAMANO_PAGINA).fill(1), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    await expect(paginarTodo(pedir, { contexto: "los recibos" })).rejects.toThrow(
      new ErrorLectura("No se pudo leer los recibos: timeout")
    );
  });

  it("respeta el tope de filas", async () => {
    const filas = await paginarTodo(tabla(5000), { maxFilas: 2000 });
    expect(filas).toHaveLength(2000);
  });
});
