import { describe, expect, it } from "vitest";
import type { EstadoMueble, MuebleFlujo } from "./flujo-mueble";
import {
  agruparPanel,
  conteosPanel,
  filtrarPanel,
  leerFiltroPanel,
  otsDePanel,
  pasaFiltro,
  resumenPm,
  type MuebleDePanel,
} from "./panel";

function mueble(
  id: string,
  estado: EstadoMueble,
  extra: Partial<Omit<MuebleDePanel, "flujo">> & { item_code?: number; modelo?: string | null } = {}
): MuebleDePanel {
  const { item_code = 1, modelo = null, ...resto } = extra;
  return {
    flujo: { id, item_code, modelo } as MuebleFlujo,
    estado,
    descripcion: null,
    pedidoId: "p1",
    numeroPm: "PM-1",
    ot: "102-24",
    proyecto: null,
    ...resto,
  };
}

describe("filtros del panel de asignación", () => {
  it("sin filtro: lo activo, o todo lo elegido si se llega de liberar", () => {
    expect(leerFiltroPanel(undefined, false)).toBe("activos");
    expect(leerFiltroPanel(undefined, true)).toBe("todos");
    expect(leerFiltroPanel("terminado", false)).toBe("terminado");
    expect(leerFiltroPanel("cualquier cosa", false)).toBe("activos");
  });

  it("activos deja fuera solo los terminados", () => {
    expect(pasaFiltro("por_asignar", "activos")).toBe(true);
    expect(pasaFiltro("en_proceso", "activos")).toBe(true);
    expect(pasaFiltro("terminado", "activos")).toBe(false);
    expect(pasaFiltro("terminado", "todos")).toBe(true);
    expect(pasaFiltro("en_proceso", "por_asignar")).toBe(false);
  });

  it("cuenta cada filtro sobre todos los muebles", () => {
    const lista = [mueble("a", "por_asignar"), mueble("b", "en_proceso"), mueble("c", "terminado")];
    expect(conteosPanel(lista)).toEqual({
      activos: 2,
      por_asignar: 1,
      en_proceso: 1,
      terminado: 1,
      todos: 3,
    });
  });

  it("filtra por estado, O.T. y texto sin distinguir acentos", () => {
    const lista = [
      mueble("a", "por_asignar", { ot: "9-24", modelo: "PÉRGOLA" }),
      mueble("b", "por_asignar", { ot: "10-24", modelo: "Rack" }),
      mueble("c", "terminado", { ot: "9-24", modelo: "Pergola chica" }),
    ];
    expect(filtrarPanel(lista, { filtro: "activos", ot: null, q: "pergola" }).map((m) => m.flujo.id)).toEqual(["a"]);
    expect(filtrarPanel(lista, { filtro: "todos", ot: "9-24", q: "" }).map((m) => m.flujo.id)).toEqual(["a", "c"]);
    expect(filtrarPanel(lista, { filtro: "todos", ot: null, q: "10-24" }).map((m) => m.flujo.id)).toEqual(["b"]);
  });
});

describe("agrupación del panel de asignación", () => {
  const lista = [
    mueble("m2", "por_asignar", { pedidoId: "p10", numeroPm: "PM10", ot: "9-24", item_code: 2 }),
    mueble("m1", "en_proceso", { pedidoId: "p10", numeroPm: "PM10", ot: "9-24", item_code: 1 }),
    mueble("x", "terminado", { pedidoId: "p9", numeroPm: "PM9", ot: "9-24" }),
    mueble("s", "por_asignar", { pedidoId: "p3", numeroPm: "PM3", ot: null }),
    mueble("o", "por_asignar", { pedidoId: "p5", numeroPm: "PM5", ot: "10-24" }),
  ];

  it("agrupa por O.T. y PM en orden natural, con las sin O.T. al final", () => {
    const grupos = agruparPanel(lista);
    expect(grupos.map((g) => g.ot)).toEqual(["9-24", "10-24", null]);
    expect(grupos[0].pms.map((p) => p.numeroPm)).toEqual(["PM9", "PM10"]);
    expect(grupos[0].total).toBe(3);
  });

  it("ordena los muebles por su número de ítem", () => {
    const pm10 = agruparPanel(lista)[0].pms[1];
    expect(pm10.muebles.map((m) => m.flujo.id)).toEqual(["m1", "m2"]);
  });

  it("resume los estados del PM", () => {
    const pm10 = agruparPanel(lista)[0].pms[1];
    expect(resumenPm(pm10)).toEqual({ por_asignar: 1, en_proceso: 1, terminado: 0 });
  });

  it("lista las O.T. presentes sin repetir", () => {
    expect(otsDePanel(lista)).toEqual(["9-24", "10-24"]);
  });
});
