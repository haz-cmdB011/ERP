import { describe, expect, it } from "vitest";
import type { Plazo } from "./atrasos";
import { armarBitacora, type AsignacionBitacora } from "./bitacora";
import {
  armarControl,
  conteosControl,
  filtrarControl,
  filtrarHistorial,
  leerFiltroMarca,
  renglonesDeTablero,
} from "./control-taller";
import { describirCambio, diaMexico, formatoFechaHora, limpiarNota, NOTA_MAX, type EventoMarca } from "./historial-marcas";
import type { MuebleInicio } from "./inicio";

const HOY = "2026-11-05";
const sinPlazos = new Map<string, Plazo>();
const ots = new Map<string, string | null>([["p1", "009-26"]]);

function asignacion(id: string, extra: Partial<AsignacionBitacora> = {}): AsignacionBitacora {
  return {
    id,
    planeacion_item_id: `item-${id}`,
    pedido_id: "p1",
    numero_pedido: "PM009-26",
    item_code: 1,
    modelo: "PG-01",
    unidad: "PZA",
    equipo_id: "e1",
    equipo: "Emilio",
    encargado: null,
    proceso: "armado",
    cantidad: 13,
    entregado: 0,
    fecha_asignacion: "2026-11-01",
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

function mueble(id: string, extra: Partial<MuebleInicio> = {}): MuebleInicio {
  return {
    id,
    modelo: "PSTA-01 (75)",
    descripcion: null,
    estado: "por_liberar",
    pedidoId: "p1",
    numeroPm: "PM009-26",
    ot: "009-26",
    cantidad: 2,
    unidad: "PZA",
    creadoEn: "2026-10-20T10:00:00Z",
    ...extra,
  };
}

describe("lista de control de la bitácora", () => {
  const grupos = armarBitacora(
    [asignacion("a", { modelo: "PG-01" }), asignacion("b", { modelo: "PG-02", equipo_id: "e2", equipo: "Luis" })],
    sinPlazos,
    ots,
    HOY,
    new Map([
      ["a", { esta: true, nota: null }],
      ["b", { esta: false, nota: "no ha llegado" }],
    ])
  );
  const muebles = [
    mueble("item-a", { modelo: "PG-01" }), // ya tiene su asignación: no se repite
    mueble("item-c"),
    mueble("item-d", { estado: "por_asignar", numeroPm: "PM010-26", ot: "010-26", modelo: "PSTA-02" }),
  ];
  const renglones = armarControl(muebles, grupos, new Map([["item-d", { esta: true, nota: null }]]));

  it("junta asignaciones y muebles sin asignación, cada mueble una sola vez", () => {
    expect(renglones.map((r) => r.clave).sort()).toEqual(["asignacion:a", "asignacion:b", "mueble:item-c", "mueble:item-d"]);
  });

  it("primero lo que no está, luego lo que falta marcar y al final lo que sí está", () => {
    expect(renglones.map((r) => [r.clave, r.marca])).toEqual([
      ["asignacion:b", false],
      ["mueble:item-c", null],
      ["asignacion:a", true],
      ["mueble:item-d", true],
    ]);
  });

  it("los muebles sin equipo traen su cantidad, su estado y 0 en taller", () => {
    const c = renglones.find((r) => r.clave === "mueble:item-c");
    expect(c).toMatchObject({ equipo: null, cantidad: 2, unidad: "PZA", tiene: 0, estado: "Por liberar", porLiberar: true });
  });

  it("filtra por marca y por texto (sin acentos ni mayúsculas)", () => {
    expect(filtrarControl(renglones, { marca: "no", q: "" }).map((r) => r.clave)).toEqual(["asignacion:b"]);
    expect(filtrarControl(renglones, { marca: "sin", q: "" }).map((r) => r.clave)).toEqual(["mueble:item-c"]);
    expect(filtrarControl(renglones, { marca: "todas", q: "luis" }).map((r) => r.clave)).toEqual(["asignacion:b"]);
    expect(filtrarControl(renglones, { marca: "todas", q: "NO HA LLEGADO" }).map((r) => r.clave)).toEqual(["asignacion:b"]);
    expect(filtrarControl(renglones, { marca: "todas", q: "010-26" }).map((r) => r.clave)).toEqual(["mueble:item-d"]);
  });

  it("cuenta cada filtro y lee el filtro de la dirección", () => {
    expect(conteosControl(renglones)).toEqual({ todas: 4, no: 1, sin: 1, si: 2 });
    expect(leerFiltroMarca("no")).toBe("no");
    expect(leerFiltroMarca("raro")).toBe("todas");
    expect(leerFiltroMarca(undefined)).toBe("todas");
  });
});

describe("historial de marcas", () => {
  const evento = (id: string, extra: Partial<EventoMarca> = {}): EventoMarca => ({
    id,
    asignacion_id: "a",
    item_id: null,
    esta_anterior: null,
    esta: false,
    nota: null,
    modelo: "PG-01",
    numero_pedido: "PM009-26",
    orden_trabajo: "009-26",
    equipo: "Emilio",
    hecho_por_nombre: "Luis Pérez",
    hecho_en: "2026-11-05T16:30:00Z",
    ...extra,
  });

  it("describe el cambio con palabras", () => {
    expect(describirCambio({ esta_anterior: null, esta: false })).toBe("Sin marca → No está");
    expect(describirCambio({ esta_anterior: false, esta: true })).toBe("No está → Sí está");
    expect(describirCambio({ esta_anterior: true, esta: null })).toBe("Sí está → Sin marca");
    expect(describirCambio({ esta_anterior: false, esta: false })).toBe("No está (cambió la nota)");
  });

  it("muestra la fecha y la hora de México (UTC-6)", () => {
    expect(formatoFechaHora("2026-11-05T16:30:00Z")).toBe("05/11/2026 10:30");
    // 03:00 UTC del día 6 todavía es el 5 en México.
    expect(diaMexico("2026-11-06T03:00:00Z")).toBe("2026-11-05");
  });

  it("filtra por cambio, texto y rango de días", () => {
    const eventos = [
      evento("1", { esta: false, nota: "falta barniz" }),
      evento("2", { esta: true, esta_anterior: false, hecho_en: "2026-11-07T18:00:00Z", equipo: "Luis" }),
      evento("3", { esta: null, esta_anterior: true, hecho_en: "2026-11-02T18:00:00Z" }),
    ];
    const base = { cambio: "todos" as const, q: "", desde: null, hasta: null };
    expect(filtrarHistorial(eventos, { ...base, cambio: "no" }).map((e) => e.id)).toEqual(["1"]);
    expect(filtrarHistorial(eventos, { ...base, cambio: "quitada" }).map((e) => e.id)).toEqual(["3"]);
    expect(filtrarHistorial(eventos, { ...base, q: "BARNIZ" }).map((e) => e.id)).toEqual(["1"]);
    expect(filtrarHistorial(eventos, { ...base, desde: "2026-11-05", hasta: "2026-11-06" }).map((e) => e.id)).toEqual(["1"]);
    expect(filtrarHistorial(eventos, { ...base, desde: "2026-11-06" }).map((e) => e.id)).toEqual(["2"]);
  });

  it("limpia la nota: sin espacios, vacía es sin nota y no pasa del largo", () => {
    expect(limpiarNota("  falta barniz  ")).toEqual({ ok: true, nota: "falta barniz" });
    expect(limpiarNota("   ")).toEqual({ ok: true, nota: null });
    expect(limpiarNota(undefined)).toEqual({ ok: true, nota: null });
    expect(limpiarNota(null)).toEqual({ ok: true, nota: null });
    expect(limpiarNota("x".repeat(NOTA_MAX))).toEqual({ ok: true, nota: "x".repeat(NOTA_MAX) });
    expect(limpiarNota("x".repeat(NOTA_MAX + 1))).toEqual({ ok: false });
    expect(limpiarNota(5)).toEqual({ ok: false });
  });
});

describe("renglones del tablero", () => {
  const grupos = armarBitacora(
    [
      asignacion("a", { modelo: "PG-01", cantidad: 13, entregado: 5, estado: "parcial", ultima_entrega: "2026-11-04" }),
      // Ya entregó todo su proceso: no sigue en taller.
      asignacion("b", { modelo: "PG-02", cantidad: 4, entregado: 4, estado: "entregada", ultima_entrega: "2026-11-03" }),
    ],
    sinPlazos,
    ots,
    HOY
  );
  const procesos = [{ etiqueta: "Armado", pct: 38, estado: "en_proceso" as const }];
  const muebles = [
    mueble("item-a", { modelo: "PG-01", estado: "en_proceso", procesos }),
    // Su primer proceso ya se entregó (tiene fila de asignación) y el que sigue está por asignar.
    mueble("item-b", { modelo: "PG-02", estado: "por_asignar" }),
    mueble("item-c", { estado: "por_asignar" }),
    mueble("item-d", { estado: "por_liberar" }),
  ];
  const renglones = renglonesDeTablero(muebles, grupos);

  it("lleva lo que sigue en taller y todo mueble por asignar, tenga o no un proceso entregado", () => {
    expect(renglones.map((r) => r.clave).sort()).toEqual(["asignacion:a", "mueble:item-b", "mueble:item-c"]);
  });

  it("la asignación en taller trae lo entregado, su última entrega y cómo va su mueble", () => {
    const a = renglones.find((r) => r.clave === "asignacion:a");
    expect(a).toMatchObject({ enTaller: true, entregado: 5, tiene: 8, ultimaEntrega: "2026-11-04", procesos });
  });

  it("dice desde cuándo se asignó y si su entrega se hace por partes del despiece", () => {
    expect(renglones.find((r) => r.clave === "asignacion:a")).toMatchObject({ fechaAsignacion: "2026-11-01", porPartes: false });
    const conPartes = renglonesDeTablero(
      [mueble("item-a", { estado: "en_proceso", entregaPorPartes: ["a"] })],
      grupos
    );
    expect(conPartes.find((r) => r.clave === "asignacion:a")?.porPartes).toBe(true);
  });
});
