import { describe, expect, it } from "vitest";
import type { Plazo } from "./atrasos";
import { armarBitacora, hrefAsignarDeFila, repartirBitacora, restarDias, sinAsignarPorModelo, type AsignacionBitacora } from "./bitacora";
import type { MuebleInicio } from "./inicio";

function asignacion(id: string, extra: Partial<AsignacionBitacora> = {}): AsignacionBitacora {
  return {
    id,
    planeacion_item_id: `item-${id}`,
    pedido_id: "p1",
    numero_pedido: "PM149-26",
    item_code: 1,
    modelo: "M-CONT-M",
    unidad: "PZA",
    equipo_id: "e1",
    equipo: "Equipo Uno",
    encargado: "Luis",
    proceso: "armado",
    cantidad: 10,
    entregado: 0,
    fecha_asignacion: "2026-10-20",
    estado: "en_proceso",
    ultima_entrega: null,
    vez_paso: null,
    veces_proceso: null,
    parte_id: null,
    parte_descripcion: null,
    parte_unidad: null,
    ...extra,
  };
}

const HOY = "2026-11-05";
const sinPlazos = new Map<string, Plazo>();
const ots = new Map<string, string | null>([
  ["p1", "149-26"],
  ["p2", "154-26"],
]);

describe("bitácora de taller", () => {
  it("resta días a una fecha", () => {
    expect(restarDias("2026-11-05", 14)).toBe("2026-10-22");
    expect(restarDias("2026-03-02", 5)).toBe("2026-02-25");
  });

  it("lo que sigue en taller lleva palomita y cuenta lo que le falta entregar", () => {
    const [g] = armarBitacora([asignacion("a", { estado: "parcial", cantidad: 10, entregado: 4 })], sinPlazos, ots, HOY);
    expect(g.filas[0]).toMatchObject({ estaEnTaller: true, tiene: 6, ot: "149-26" });
    expect(g.enTaller).toBe(1);
  });

  it("lo ya entregado lleva tache y no tiene nada pendiente", () => {
    const [g] = armarBitacora(
      [asignacion("a", { estado: "entregada", entregado: 10, ultima_entrega: "2026-11-01" })],
      sinPlazos,
      ots,
      HOY
    );
    expect(g.filas[0]).toMatchObject({ estaEnTaller: false, tiene: 0 });
    expect(g.enTaller).toBe(0);
  });

  it("trae la palomita o el tache que eligió Producción; sin elegir, queda sin marcar", () => {
    const [g] = armarBitacora(
      [asignacion("a"), asignacion("b"), asignacion("c")],
      sinPlazos,
      ots,
      HOY,
      new Map([
        ["a", { esta: true, nota: null }],
        ["b", { esta: false, nota: "no ha llegado" }],
      ])
    );
    expect(Object.fromEntries(g.filas.map((f) => [f.id, [f.marca, f.nota]]))).toEqual({
      a: [true, null],
      b: [false, "no ha llegado"],
      c: [null, null],
    });
  });

  it("deja fuera lo cancelado y lo entregado hace más de dos semanas", () => {
    const grupos = armarBitacora(
      [
        asignacion("a", { estado: "cancelada" }),
        asignacion("b", { estado: "entregada", entregado: 10, ultima_entrega: "2026-10-01" }),
      ],
      sinPlazos,
      ots,
      HOY
    );
    expect(grupos).toEqual([]);
  });

  it("agrupa por equipo: primero el que tiene atrasos, y dentro de él lo atrasado antes que lo entregado", () => {
    const plazos = new Map<string, Plazo>([["p2", { tipo: "vencido", dias: 3 }]]);
    const grupos = armarBitacora(
      [
        asignacion("a", { equipo_id: "e1", equipo: "Equipo Uno" }),
        asignacion("b", { equipo_id: "e2", equipo: "Equipo Dos", pedido_id: "p2", numero_pedido: "PM154-26" }),
        asignacion("c", { equipo_id: "e2", equipo: "Equipo Dos", estado: "entregada", entregado: 10, ultima_entrega: "2026-11-04" }),
      ],
      plazos,
      ots,
      HOY
    );
    expect(grupos.map((g) => g.equipo)).toEqual(["Equipo Dos", "Equipo Uno"]);
    expect(grupos[0].atrasadas).toBe(1);
    expect(grupos[0].filas.map((f) => f.id)).toEqual(["b", "c"]);
    expect(grupos[0].filas[0].ot).toBe("154-26");
  });

  it("el botón Asignar lleva al panel con el PM; lo entregado pide ver todos los estados", () => {
    expect(hrefAsignarDeFila({ numero_pedido: "PM149-26", estaEnTaller: true })).toBe("/produccion/panel?q=PM149-26");
    expect(hrefAsignarDeFila({ numero_pedido: "PM149-26", estaEnTaller: false })).toBe(
      "/produccion/panel?estado=todos&q=PM149-26"
    );
  });

  it("reparte las filas entre los recuadros de los modelos a la vista y deja el resto por equipo", () => {
    const grupos = armarBitacora(
      [
        asignacion("a", { modelo: "m-cont-m" }),
        asignacion("b", { modelo: "OTRO MODELO" }),
        asignacion("c", { modelo: null, equipo_id: "e2", equipo: "Equipo Dos" }),
      ],
      sinPlazos,
      ots,
      HOY
    );
    const { porModelo, resto } = repartirBitacora(grupos, ["M-CONT-M"]);
    expect(porModelo["M-CONT-M"].map((f) => f.id)).toEqual(["a"]);
    expect(resto.map((g) => [g.equipo, g.filas.map((f) => f.id), g.enTaller])).toEqual([
      ["Equipo Uno", ["b"], 1],
      ["Equipo Dos", ["c"], 1],
    ]);
  });

  it("los muebles sin ninguna asignación también salen, con su marca, primero los que esperan equipo", () => {
    const mueble = (id: string, extra: Partial<MuebleInicio> = {}): MuebleInicio => ({
      id,
      modelo: "m-cont-m",
      descripcion: null,
      estado: "por_liberar",
      pedidoId: "p1",
      numeroPm: "PM149-26",
      ot: "149-26",
      creadoEn: "2026-10-20T10:00:00Z",
      cantidad: 13,
      unidad: "PZA",
      ...extra,
    });
    const { porModelo } = repartirBitacora(
      armarBitacora([asignacion("a", { modelo: "M-CONT-M" })], sinPlazos, ots, HOY),
      ["M-CONT-M"]
    );
    const r = sinAsignarPorModelo(
      [
        mueble("item-a"), // ya tiene su asignación: no sale aquí
        mueble("item-b", { estado: "por_liberar", numeroPm: "PM150-26" }),
        mueble("item-c", { estado: "por_asignar", numeroPm: "PM151-26" }),
        mueble("item-d", { modelo: "OTRO MODELO" }), // no está a la vista
      ],
      porModelo,
      ["M-CONT-M"],
      new Map([["item-b", { esta: false, nota: "falta barniz" }]])
    );
    expect(r["M-CONT-M"].map((f) => [f.itemId, f.estado, f.marca, f.nota])).toEqual([
      ["item-c", "por_asignar", null, null],
      ["item-b", "por_liberar", false, "falta barniz"],
    ]);
    expect(r["M-CONT-M"][0]).toMatchObject({ cantidad: 13, unidad: "PZA" });
    expect(Object.keys(r)).toEqual(["M-CONT-M"]);
  });
});
