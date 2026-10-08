import { describe, expect, it } from "vitest";
import { leer } from "./leer";
import { ErrorLectura } from "./paginar";

const resp = <T>(data: T, error: { message: string } | null = null) => Promise.resolve({ data, error });

describe("leer", () => {
  it("devuelve los datos cuando la consulta salió bien", async () => {
    expect(await leer(resp([{ id: 1 }]), "pedidos")).toEqual([{ id: 1 }]);
  });

  it("devuelve null tal cual cuando no hay error (un maybeSingle que no encontró nada)", async () => {
    expect(await leer(resp(null), "el pedido")).toBeNull();
  });

  it("lanza ErrorLectura con el contexto y el motivo cuando hay error", async () => {
    const consulta = resp(null, { message: "connection refused" });
    await expect(leer(consulta, "la tabla pedidos")).rejects.toBeInstanceOf(ErrorLectura);
    await expect(leer(consulta, "la tabla pedidos")).rejects.toThrow("No se pudo leer la tabla pedidos: connection refused");
  });

  it("un error con datos parciales tampoco se ignora (no entrega una lista corta)", async () => {
    await expect(leer(resp([{ id: 1 }], { message: "timeout" }), "ítems")).rejects.toThrow("timeout");
  });

  it("acepta cualquier cosa con .then (como el constructor de consultas de Supabase)", async () => {
    const constructor = { then: (ok: (v: { data: number[]; error: null }) => void) => ok({ data: [1, 2], error: null }) };
    expect(await leer(constructor as unknown as PromiseLike<{ data: number[]; error: null }>, "x")).toEqual([1, 2]);
  });
});
