import { describe, expect, it } from "vitest";
import {
  agruparPorCliente,
  filtrarPorEstado,
  leerEstadoLista,
  paramEstadoLista,
} from "./vista-lista";

describe("leerEstadoLista", () => {
  it("por omisión son las activas, y con búsqueda todas", () => {
    expect(leerEstadoLista(undefined, false)).toBe("activos");
    expect(leerEstadoLista(undefined, true)).toBe("todos");
  });
  it("respeta un estado válido y ignora uno inventado", () => {
    expect(leerEstadoLista("terminados", true)).toBe("terminados");
    expect(leerEstadoLista("x", false)).toBe("activos");
  });
});

describe("paramEstadoLista", () => {
  it("omite el estado de por omisión", () => {
    expect(paramEstadoLista("activos", false)).toBeUndefined();
    expect(paramEstadoLista("todos", false)).toBe("todos");
    expect(paramEstadoLista("todos", true)).toBeUndefined();
    expect(paramEstadoLista("activos", true)).toBe("activos");
  });
});

describe("filtrarPorEstado", () => {
  const filas = [{ t: true }, { t: false }, { t: false }];
  it("separa terminadas de activas", () => {
    expect(filtrarPorEstado(filas, "activos", (f) => f.t)).toHaveLength(2);
    expect(filtrarPorEstado(filas, "terminados", (f) => f.t)).toHaveLength(1);
    expect(filtrarPorEstado(filas, "todos", (f) => f.t)).toHaveLength(3);
  });
});

describe("agruparPorCliente", () => {
  it("agrupa por cliente en orden alfabético, con Sin cliente al final", () => {
    const filas = [
      { c: "ZETA", n: 1 },
      { c: null, n: 2 },
      { c: "ALFA", n: 3 },
      { c: "ZETA", n: 4 },
    ];
    const grupos = agruparPorCliente(filas, (f) => f.c);
    expect(grupos.map((g) => g.cliente)).toEqual(["ALFA", "ZETA", "Sin cliente"]);
    expect(grupos[1].filas.map((f) => f.n)).toEqual([1, 4]);
  });
});
