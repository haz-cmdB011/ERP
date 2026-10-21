import { describe, expect, it } from "vitest";
import { accionesQr, areaQrElegida, areasQrDePerfil, type MuebleQr } from "./areas-qr";

const MUEBLE: MuebleQr = {
  itemId: "item-1",
  pedidoId: "pedido-1",
  numeroPedido: "102-24",
  proyecto: "Hotel Centro",
  modelo: "TIRAS DE ROSA MORADO",
  asignable: true,
  enTaller: true,
};

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

describe("accionesQr", () => {
  it("Producción: entrega primero, luego la ruta del PM, hoja y despiece", () => {
    const acciones = accionesQr("produccion", MUEBLE);
    expect(acciones.map((a) => a.etiqueta)).toEqual([
      "Registrar entrega",
      "Ruta en el PM",
      "Hoja de viajero",
      "Despiece",
    ]);
    expect(acciones[0]).toMatchObject({ href: "/produccion/escanear/item-1", principal: true });
    expect(acciones[1].href).toBe("/produccion/pedidos/pedido-1/asignaciones");
    expect(acciones[2].href).toBe("/produccion/pedidos/pedido-1/viajero/item-1");
  });

  it("Producción: sin liberar o cancelado no lleva a la ruta del PM", () => {
    const etiquetas = accionesQr("produccion", { ...MUEBLE, asignable: false }).map((a) => a.etiqueta);
    expect(etiquetas).not.toContain("Ruta en el PM");
  });

  it("Producción: registrar entrega es la principal solo si hay algo en taller", () => {
    expect(accionesQr("produccion", { ...MUEBLE, enTaller: false })[0].principal).toBe(false);
  });

  it("Calidad: componentes en su pantalla y reportar falla prellenada", () => {
    const [componentes, reportar] = accionesQr("calidad", MUEBLE);
    expect(componentes).toMatchObject({ href: "/calidad/escanear/item-1", etiqueta: "Componentes e informes" });
    const url = new URL(reportar.href, "https://x");
    expect(url.pathname).toBe("/calidad/incidencias");
    expect(url.searchParams.get("reportar")).toBe("1");
    expect(url.searchParams.get("reportar_proyecto")).toBe("Hotel Centro");
    expect(url.searchParams.get("reportar_mueble")).toBe("TIRAS DE ROSA MORADO");
    expect(url.searchParams.has("proyecto")).toBe(false);
  });

  it("Calidad sin proyecto ni modelo no manda parámetros vacíos", () => {
    const [, reportar] = accionesQr("calidad", { ...MUEBLE, proyecto: null, modelo: null });
    expect(reportar.href).toBe("/calidad/incidencias?reportar=1");
  });

  it("Planeación y Estimaciones llevan al PM y a su O.T.", () => {
    expect(accionesQr("planeacion", MUEBLE)[0].href).toBe("/planeacion/pedidos/pedido-1");
    expect(accionesQr("estimaciones", { ...MUEBLE, numeroPedido: "102/24" })[0].href).toBe(
      "/estimaciones/pm-cobrado/102%2F24"
    );
  });
});
