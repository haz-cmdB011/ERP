import { describe, expect, it } from "vitest";
import type { RenglonControl } from "./control-taller";
import {
  clavesMasRecientes,
  conteosColumnas,
  diaCorto,
  enColumna,
  seccionesPorOt,
  tarjetasDeControl,
} from "./tablero";

// Por omisión, un mueble liberado que espera equipo (va en "Por asignar").
function renglon(clave: string, extra: Partial<RenglonControl> = {}): RenglonControl {
  const esAsignacion = clave.startsWith("asignacion:");
  return {
    clave,
    asignacionId: esAsignacion ? clave.slice(11) : null,
    itemId: esAsignacion ? null : clave.slice(7),
    modelo: "PG-01",
    numeroPm: "PM009-26",
    pedidoId: "p1",
    ot: "009-26",
    equipo: esAsignacion ? "Emilio" : null,
    proceso: esAsignacion ? "Armado" : null,
    estado: esAsignacion ? "En taller" : "Por asignar",
    cantidad: 13,
    unidad: "PZA",
    tiene: esAsignacion ? 8 : 0,
    marca: null,
    nota: null,
    porLiberar: false,
    planeacionItemId: esAsignacion ? "item-de-" + clave.slice(11) : clave.slice(7),
    reciente: "",
    estadoInicio: esAsignacion ? null : "por_asignar",
    enTaller: esAsignacion,
    entregado: esAsignacion ? 5 : 0,
    diasEnTaller: esAsignacion ? 2 : 0,
    ultimaEntrega: null,
    fechaAsignacion: esAsignacion ? "2026-11-03" : null,
    porPartes: false,
    faltaAsignar: null,
    procesos: [],
    ...extra,
  };
}

describe("tablero de producción", () => {
  const tarjetas = tarjetasDeControl([
    renglon("asignacion:a", { marca: true, procesos: [{ etiqueta: "Armado", pct: 38, estado: "en_proceso" }] }),
    renglon("mueble:b", { modelo: "FXSV-14", ot: "010-26", numeroPm: "PM010-26" }),
  ]);

  it("lo que tiene equipo en taller va en Por entregar y el mueble liberado sin equipo, en Por asignar", () => {
    expect(tarjetas.map((t) => [t.clave, t.columna])).toEqual([
      ["asignacion:a", "por_entregar"],
      ["mueble:b", "por_asignar"],
    ]);
  });

  it("no pone lo que sigue por liberar, ni lo entregado, ni lo que ya tiene su trabajo en otro lado", () => {
    const t = tarjetasDeControl([
      renglon("mueble:liberar", { estadoInicio: "por_liberar", porLiberar: true, estado: "Por liberar" }),
      renglon("mueble:taller", { estadoInicio: "en_proceso" }),
      renglon("mueble:listo", { estadoInicio: "terminado" }),
      renglon("asignacion:entregada", { enTaller: false, estado: "Entregada" }),
      renglon("mueble:libre"),
    ]);
    expect(t.map((x) => x.clave)).toEqual(["mueble:libre"]);
  });

  it("Por asignar lleva el botón que abre el panel con ese mueble y no trae avance", () => {
    const b = tarjetas.find((t) => t.clave === "mueble:b")!;
    expect(b.hrefAsignar).toBe("/produccion/panel?ids=b");
    expect(b.hrefPanel).toBeNull();
    expect(b.avance).toBeNull();
    expect(b.subtitulo).toBeNull();
    expect(b.piezas).toBe("13 PZA");
  });

  it("Por entregar lleva cómo va y el panel de su mueble, sin botón de asignar", () => {
    const a = tarjetas.find((t) => t.clave === "asignacion:a")!;
    expect(a.hrefAsignar).toBeNull();
    expect(a.hrefPanel).toBe("/produccion/panel?ids=item-de-a");
    expect(a.subtitulo).toBe("Emilio · Armado");
    expect(a.marca).toBe(true);
    expect(a.avance).toEqual({
      entregado: 5,
      total: 13,
      unidad: "PZA",
      pct: 38,
      sinEntregar: 8,
      diasEnTaller: 2,
      ultimaEntrega: null,
      fechaAsignacion: "2026-11-03",
      porPartes: false,
      procesos: [{ etiqueta: "Armado", pct: 38, estado: "en_proceso" }],
    });
  });

  it("un mueble asignado a medias dice cuánto falta por asignar del paso en que va", () => {
    const t = tarjetasDeControl([
      renglon("mueble:a", { faltaAsignar: { cantidad: 8, total: 13, etiqueta: "Armado" } }),
      renglon("mueble:b", { faltaAsignar: { cantidad: 13, total: 13, etiqueta: "Armado" } }),
      renglon("mueble:c"),
    ]);
    expect(t.map((x) => x.piezas)).toEqual(["Faltan 8 de 13 PZA · Armado", "13 PZA", "13 PZA"]);
  });

  it("dice si la entrega del mueble se hace por partes", () => {
    const t = tarjetasDeControl([renglon("asignacion:p", { porPartes: true })]);
    expect(t[0].avance?.porPartes).toBe(true);
  });

  it("el avance no pasa de 100% ni se rompe con una cantidad de cero", () => {
    const t = tarjetasDeControl([
      renglon("asignacion:x", { cantidad: 4, entregado: 5 }),
      renglon("asignacion:y", { cantidad: 0, entregado: 0 }),
    ]);
    expect(t.map((x) => x.avance?.pct)).toEqual([100, 0]);
  });

  it("conserva los accesos de siempre: modelo al panel, O.T. a su pantalla y PM a su pedido", () => {
    expect(tarjetas[0].hrefModelo).toBe("/produccion/panel?estado=todos&q=PG-01");
    expect(tarjetas[0].hrefOt).toBe("/produccion/ot/009-26");
    expect(tarjetas[0].hrefPm).toBe("/produccion/pedidos/p1");
    const sinFormato = tarjetasDeControl([renglon("mueble:z", { ot: null, pedidoId: "p9" })]);
    expect(sinFormato[0].hrefOt).toBe("/produccion/pedidos/p9");
  });

  it("separa por O.T., la más reciente primero y lo que no tiene O.T. al final", () => {
    const todas = tarjetasDeControl([
      renglon("mueble:a", { ot: "009-26" }),
      renglon("mueble:b", { ot: "102-24", numeroPm: "PM102-24" }),
      renglon("mueble:c", { ot: null, numeroPm: "PM-X" }),
      renglon("asignacion:d", { ot: "009-26" }),
      renglon("mueble:e", { ot: "010-26" }),
    ]);
    const secciones = seccionesPorOt(todas);
    expect(secciones.map((s) => [s.titulo, s.tarjetas.map((t) => t.clave)])).toEqual([
      ["O.T. 102-24", ["mueble:b"]],
      ["O.T. 010-26", ["mueble:e"]],
      ["O.T. 009-26", ["mueble:a", "asignacion:d"]],
      ["Sin O.T.", ["mueble:c"]],
    ]);
    expect(secciones[0].hrefOt).toBe("/produccion/ot/102-24");
    expect(secciones[3].hrefOt).toBeNull();
    expect(conteosColumnas(secciones[2].tarjetas)).toEqual({ por_entregar: 1, por_asignar: 1 });
    expect(enColumna(secciones[2].tarjetas, "por_entregar").map((t) => t.clave)).toEqual(["asignacion:d"]);
  });

  it("muestra solo el PM, o solo el SDC si lo hay, y deja el nombre completo aparte", () => {
    const t = tarjetasDeControl([
      renglon("mueble:a", { numeroPm: "PM009-26 ACTUALIZACION" }),
      renglon("mueble:b", { numeroPm: "SDC-1 PM009-26" }),
      renglon("mueble:c", { numeroPm: "2PM134-26" }),
    ]);
    expect(t.map((x) => x.pmCorto)).toEqual(["PM009-26", "SDC-1", "2PM134-26"]);
    expect(t[0].numeroPm).toBe("PM009-26 ACTUALIZACION");
  });

  it("cada tarjeta lleva los anillos de su modelo, los mismos de la lista", () => {
    const conteos = { por_liberar: 1, por_asignar: 2, en_proceso: 3, terminado: 4 };
    const t = tarjetasDeControl(
      [renglon("asignacion:a", { modelo: "PSTA02  (105)" }), renglon("mueble:b", { modelo: "OTRO" })],
      { conteosPorModelo: new Map([["PSTA02 (105)", conteos]]) }
    );
    // El modelo se reconoce aunque cambien los espacios o las mayúsculas.
    expect(t[0].conteos).toEqual(conteos);
    expect(t[1].conteos).toBeNull();
    expect(tarjetasDeControl([renglon("mueble:c")])[0].conteos).toBeNull();
  });

  it("cada tarjeta lleva la imagen de su mueble, si la tiene", () => {
    const imagenes = { "item-de-a": { url: "u1", urlGrande: "g1" }, z: { url: "u2", urlGrande: null } };
    const t = tarjetasDeControl([renglon("asignacion:a"), renglon("mueble:z"), renglon("mueble:y")], { imagenes });
    expect(t[0].imagen).toEqual({ url: "u1", urlGrande: "g1" });
    expect(t[1].imagen).toEqual({ url: "u2", urlGrande: null });
    expect(t[2].imagen).toBeNull();
  });

  it("pone primero lo más reciente", () => {
    const t = tarjetasDeControl([
      renglon("mueble:viejo", { reciente: "2026-10-20T20:00:00Z" }),
      renglon("mueble:sin-fecha"),
      renglon("mueble:hoy", { reciente: "2026-11-06T16:30:00Z" }),
      renglon("mueble:ayer", { reciente: "2026-11-05" }),
    ]);
    expect(t.map((x) => x.clave)).toEqual(["mueble:hoy", "mueble:ayer", "mueble:viejo", "mueble:sin-fecha"]);
  });

  it("elige las tarjetas más recientes y, a igual momento, las primeras", () => {
    const t = tarjetasDeControl([
      renglon("mueble:a", { reciente: "2026-11-01" }),
      renglon("mueble:b", { reciente: "2026-11-04" }),
      renglon("mueble:c", { reciente: "2026-11-03" }),
      renglon("mueble:d"),
      renglon("mueble:e"),
    ]);
    expect([...clavesMasRecientes(t, 2)].sort()).toEqual(["mueble:b", "mueble:c"]);
    expect([...clavesMasRecientes(t, 4)].sort()).toEqual(["mueble:a", "mueble:b", "mueble:c", "mueble:d"]);
    expect(clavesMasRecientes(t, 99).size).toBe(5);
  });

  it("las secciones van primero las de movimiento más reciente, no las de número mayor", () => {
    const t = tarjetasDeControl([
      renglon("mueble:a", { ot: "102-24", reciente: "2026-10-01" }),
      renglon("mueble:b", { ot: "009-26", reciente: "2026-11-05" }),
      renglon("mueble:c", { ot: "009-26", reciente: "2026-11-02" }),
      renglon("mueble:d", { ot: null, reciente: "2026-11-06" }),
    ]);
    const secciones = seccionesPorOt(t);
    expect(secciones.map((s) => s.titulo)).toEqual(["O.T. 009-26", "O.T. 102-24", "Sin O.T."]);
    expect(secciones[0].reciente).toBe("2026-11-05");
  });
});

describe("diaCorto", () => {
  it("da día y mes de una fecha o de un ISO, y vacío si no es fecha", () => {
    expect(diaCorto("2026-11-04")).toBe("04/11");
    expect(diaCorto("2026-11-04T18:30:00Z")).toBe("04/11");
    expect(diaCorto(null)).toBe("");
    expect(diaCorto("ayer")).toBe("");
  });
});
