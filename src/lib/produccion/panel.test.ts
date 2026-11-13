import { describe, expect, it } from "vitest";
import type { EstadoMueble, MuebleFlujo } from "./flujo-mueble";
import {
  agruparPanel,
  conteosPanel,
  coincideTexto,
  filtrarPanel,
  leerFiltroPanel,
  leerLimitePanel,
  limitarPanel,
  MUEBLES_POR_PAGINA,
  otsDePanel,
  pasaFiltro,
  resumenOt,
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
    cliente: null,
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

  it("resume los estados de toda la O.T.", () => {
    expect(resumenOt(agruparPanel(lista)[0])).toEqual({ por_asignar: 1, en_proceso: 1, terminado: 1 });
  });

  it("cada O.T. lleva el cliente de su primer PM y se puede buscar por él", () => {
    const conCliente = [
      mueble("a", "por_asignar", { pedidoId: "p2", numeroPm: "PM2", ot: "9-24", cliente: "HOTEL B" }),
      mueble("b", "por_asignar", { pedidoId: "p1", numeroPm: "PM1", ot: "9-24", cliente: "HOTEL A" }),
      mueble("c", "por_asignar", { pedidoId: "p3", numeroPm: "PM3", ot: "10-24" }),
    ];
    expect(agruparPanel(conCliente).map((g) => g.cliente)).toEqual(["HOTEL A", null]);
    expect(filtrarPanel(conCliente, { filtro: "todos", ot: null, q: "hotel b" }).map((m) => m.flujo.id)).toEqual(["a"]);
  });

  it("lista las O.T. presentes sin repetir", () => {
    expect(otsDePanel(lista)).toEqual(["9-24", "10-24"]);
  });
});

describe("paginación del panel", () => {
  it("el límite pedido es al menos una página y tiene tope", () => {
    expect(leerLimitePanel(undefined)).toBe(MUEBLES_POR_PAGINA);
    expect(leerLimitePanel("3")).toBe(MUEBLES_POR_PAGINA);
    expect(leerLimitePanel("abc")).toBe(MUEBLES_POR_PAGINA);
    expect(leerLimitePanel("80")).toBe(80);
    expect(leerLimitePanel("999999")).toBe(2000);
  });

  it("corta en el orden en que se ven (O.T., PM, ítem), no en el de lectura", () => {
    const lista = [
      mueble("c", "por_asignar", { item_code: 3, ot: "103-24", pedidoId: "p2", numeroPm: "PM-2" }),
      mueble("b", "por_asignar", { item_code: 2 }),
      mueble("a", "por_asignar", { item_code: 1 }),
    ];
    expect(limitarPanel(lista, 2).map((m) => m.flujo.id)).toEqual(["a", "b"]);
    expect(limitarPanel(lista, 0)).toEqual([]);
    expect(limitarPanel(lista, 10)).toHaveLength(3);
  });

  it("busca en el texto de la fila antes de cargar el flujo", () => {
    const fila = {
      numeroPm: "PM-7",
      ot: "102-24",
      proyecto: "Pérgola Norte",
      cliente: null,
      modelo: "TIRAS",
      descripcion: null,
      itemCode: 12,
    };
    expect(coincideTexto(fila, "pergola")).toBe(true);
    expect(coincideTexto(fila, "pm-7")).toBe(true);
    expect(coincideTexto(fila, "sillón")).toBe(false);
    expect(coincideTexto(fila, "")).toBe(true);
  });
});
