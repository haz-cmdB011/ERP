import { describe, expect, it } from "vitest";
import { areaQrElegida, areasQrDePerfil, panelQr, type AccionQr, type EstadoQr } from "./areas-qr";

const ESTADO: EstadoQr = {
  mueble: {
    itemId: "item-1",
    pedidoId: "pedido-1",
    numeroPedido: "102-24",
    proyecto: "Hotel Centro",
    modelo: "TIRAS DE ROSA MORADO",
    activo: true,
  },
  unidad: "PZA",
  produccion: { puedeAsignar: true, porEntregar: 0, porAsignar: { paso: "Armado", cantidad: 2 } },
  calidad: { revisionFinal: "esperando", pendientes: 0, cantidad: 7, entregasPorRevisar: 0 },
  pago: { estado: "sin_recibo", cobrado: 0, pagado: 0, recibos: 0 },
};

const etiquetas = (lista: AccionQr[]) => lista.map((a) => a.etiqueta);
const href = (a: AccionQr | null | undefined) => (a?.tipo === "enlace" ? a.href : null);

describe("areasQrDePerfil", () => {
  it("el desarrollador ve todas las áreas", () => {
    expect(areasQrDePerfil({ rol: "desarrollador", area: null })).toEqual([
      "produccion",
      "calidad",
      "planeacion",
      "estimaciones",
    ]);
  });

  it("administrador y trabajador ven solo la suya", () => {
    expect(areasQrDePerfil({ rol: "trabajador", area: "produccion" })).toEqual(["produccion"]);
    expect(areasQrDePerfil({ rol: "administrador", area: "calidad" })).toEqual(["calidad"]);
  });

  it("maquilador, usuario sin asignar, Finanzas o sin sesión no ven pestañas", () => {
    expect(areasQrDePerfil({ rol: "maquilador", area: "estimaciones" })).toEqual([]);
    expect(areasQrDePerfil({ rol: "usuario", area: null })).toEqual([]);
    expect(areasQrDePerfil({ rol: "trabajador", area: "finanzas" })).toEqual([]);
    expect(areasQrDePerfil(null)).toEqual([]);
  });
});

describe("areaQrElegida", () => {
  it("respeta la pedida si la persona la tiene", () => {
    expect(areaQrElegida(["produccion", "calidad"], "calidad")).toBe("calidad");
  });

  it("si no la tiene o no existe, abre la primera suya", () => {
    expect(areaQrElegida(["calidad"], "produccion")).toBe("calidad");
    expect(areaQrElegida(["produccion", "calidad"], "otra")).toBe("produccion");
    expect(areaQrElegida(["produccion"], undefined)).toBe("produccion");
    expect(areaQrElegida([], "calidad")).toBeNull();
  });
});

describe("panelQr · Producción", () => {
  it("sin nada en taller, lo que sigue es asignar", () => {
    const p = panelQr("produccion", ESTADO);
    expect(p.principal).toEqual({ tipo: "asignar", etiqueta: "Asignar a un equipo" });
    expect(p.ayuda).toBe("Armado: faltan 2 PZA por asignar.");
    expect(etiquetas(p.otras)).toEqual(["Registrar entrega", "Ruta en el PM", "Hoja de viajero", "Despiece"]);
    expect(href(p.otras[0])).toBe("/produccion/escanear/item-1");
    expect(href(p.otras[1])).toBe("/produccion/pedidos/pedido-1/asignaciones");
    expect(href(p.otras[2])).toBe("/produccion/pedidos/pedido-1/viajero/item-1");
    expect(href(p.otras[3])).toBe("/produccion/pedidos/pedido-1/despiece/item-1");
  });

  it("con piezas en taller, lo que sigue es registrar la entrega y asignar queda como opción", () => {
    const p = panelQr("produccion", { ...ESTADO, produccion: { ...ESTADO.produccion, porEntregar: 3 } });
    expect(href(p.principal)).toBe("/produccion/escanear/item-1");
    expect(p.ayuda).toBe("Faltan 3 PZA por entregar y 2 por asignar en Armado.");
    expect(etiquetas(p.otras)).toEqual(["Asignar a un equipo", "Ruta en el PM", "Hoja de viajero", "Despiece"]);
  });

  it("todo asignado y entregado: sin acción principal, nada se pierde", () => {
    const p = panelQr("produccion", {
      ...ESTADO,
      produccion: { puedeAsignar: true, porEntregar: 0, porAsignar: null },
    });
    expect(p.principal).toBeNull();
    expect(p.ayuda).toBe("Todo está asignado y entregado.");
    expect(etiquetas(p.otras)).toEqual(["Registrar entrega", "Ruta en el PM", "Hoja de viajero", "Despiece"]);
  });

  it("sin liberar o cancelado no asigna ni lleva a la ruta del PM", () => {
    const p = panelQr("produccion", {
      ...ESTADO,
      mueble: { ...ESTADO.mueble, activo: false },
      produccion: { ...ESTADO.produccion, puedeAsignar: false },
    });
    expect(p.principal).toBeNull();
    expect(p.ayuda).toBeNull();
    expect(etiquetas(p.otras)).toEqual(["Registrar entrega", "Hoja de viajero", "Despiece"]);
  });
});

describe("panelQr · Calidad", () => {
  it("con piezas listas y permiso, lo que sigue es la revisión final", () => {
    const p = panelQr("calidad", {
      ...ESTADO,
      calidad: { ...ESTADO.calidad, revisionFinal: "revisar", pendientes: 2 },
    });
    expect(p.principal).toEqual({ tipo: "revision_final", etiqueta: "Hacer la revisión final" });
    expect(p.ayuda).toBe("2 PZA listas: ya pasaron por toda la ruta.");
  });

  it("los demás estados solo explican, y siempre quedan componentes y reportar falla", () => {
    const estado = (revisionFinal: EstadoQr["calidad"]["revisionFinal"]) =>
      panelQr("calidad", { ...ESTADO, calidad: { ...ESTADO.calidad, revisionFinal, pendientes: 2 } });
    expect(estado("listas").ayuda).toBe("2 PZA listas para la revisión final. Tu usuario no puede evaluar.");
    expect(estado("esperando").ayuda).toMatch(/falta que Producción termine la ruta/);
    expect(estado("liberado").ayuda).toBe("Liberado a obra: Calidad aprobó las 7 PZA.");
    expect(estado(null).ayuda).toBe("No hay entregas por revisar.");
    for (const r of ["listas", "esperando", "liberado", null] as const) {
      expect(estado(r).principal).toBeNull();
      expect(etiquetas(estado(r).otras)).toEqual(["Componentes e informes", "Reportar falla"]);
    }
  });

  it("reportar falla va prellenada, sin parámetros vacíos", () => {
    const url = new URL(href(panelQr("calidad", ESTADO).otras[1])!, "https://x");
    expect(url.pathname).toBe("/calidad/incidencias");
    expect(url.searchParams.get("reportar")).toBe("1");
    expect(url.searchParams.get("reportar_proyecto")).toBe("Hotel Centro");
    expect(url.searchParams.get("reportar_mueble")).toBe("TIRAS DE ROSA MORADO");
    expect(url.searchParams.has("proyecto")).toBe(false);
    const vacio = panelQr("calidad", { ...ESTADO, mueble: { ...ESTADO.mueble, proyecto: null, modelo: null } });
    expect(href(vacio.otras[1])).toBe("/calidad/incidencias?reportar=1");
  });
});

describe("panelQr · Planeación y Estimaciones", () => {
  it("Planeación lleva al PM", () => {
    const p = panelQr("planeacion", ESTADO);
    expect(p.principal).toBeNull();
    expect(href(p.otras[0])).toBe("/planeacion/pedidos/pedido-1");
  });

  it("Estimaciones dice cuánto se ha pagado y lleva a su O.T.", () => {
    expect(panelQr("estimaciones", ESTADO).ayuda).toBe("Ningún maquilador lo ha cobrado todavía.");
    const p = panelQr("estimaciones", {
      ...ESTADO,
      mueble: { ...ESTADO.mueble, numeroPedido: "102/24" },
      pago: { estado: "por_pagar", cobrado: 10, pagado: 5, recibos: 2 },
    });
    expect(p.ayuda).toBe("Pagado 5 de 10 PZA cobradas en 2 recibo(s).");
    expect(href(p.otras[0])).toBe("/estimaciones/pm-cobrado/102%2F24");
  });
});
