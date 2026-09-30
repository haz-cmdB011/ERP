import { describe, expect, it } from "vitest";
import {
  atajosCoincidentes,
  hrefModelo,
  hrefOrdenTrabajo,
  hrefPedido,
  hrefRecibo,
  normalizarBusqueda,
  terminoSeguro,
} from "./global";

const interno = { maquilador: false, esDesarrollador: false };

describe("normalizarBusqueda", () => {
  it("quita acentos, mayúsculas y espacios de más", () => {
    expect(normalizarBusqueda("  Planeación   PRODUCCIÓN ")).toBe("planeacion produccion");
  });
});

describe("terminoSeguro", () => {
  it("deja pasar números de O.T., PM y folios tal cual", () => {
    expect(terminoSeguro("009-26")).toBe("009-26");
    expect(terminoSeguro("SDC-1 2PM009-26")).toBe("SDC-1 2PM009-26");
    expect(terminoSeguro("A/123.4")).toBe("A/123.4");
  });

  it("quita comodines y separadores de filtros de PostgREST", () => {
    expect(terminoSeguro("a%b_c*d")).toBe("a b c d");
    expect(terminoSeguro('x,numero_pedido.eq.1),("\\')).toBe("x numero pedido.eq.1");
  });
});

describe("enlaces", () => {
  it("abre el PM en el área donde está el usuario", () => {
    expect(hrefPedido("produccion", "abc")).toBe("/produccion/pedidos/abc");
    expect(hrefPedido("calidad", "abc")).toBe("/calidad/pedidos/abc");
    expect(hrefPedido("estimaciones", "abc")).toBe("/planeacion/pedidos/abc");
    expect(hrefPedido(null, "abc")).toBe("/planeacion/pedidos/abc");
  });

  it("codifica O.T., modelo y folio en la URL", () => {
    expect(hrefOrdenTrabajo("009-26")).toBe("/planeacion/ot/009-26");
    expect(hrefModelo("abc", "MS 01/A")).toBe("/planeacion/pedidos/abc?modelo=MS%2001%2FA");
    expect(hrefRecibo("armado", "A 12/3")).toBe("/estimaciones/recibos/armado/recibo/A%2012%2F3");
  });
});

describe("atajosCoincidentes", () => {
  it("encuentra pantallas sin importar acentos ni el orden de las palabras", () => {
    const r = atajosCoincidentes("cancelados produccion", interno);
    expect(r).toEqual([
      { tipo: "pantalla", titulo: "Cancelados", detalle: "Producción", href: "/produccion/cancelados" },
    ]);
  });

  it("busca también en las palabras clave", () => {
    expect(atajosCoincidentes("subir", interno).map((r) => r.href)).toEqual(["/planeacion/upload"]);
  });

  it("al maquilador solo le ofrece sus pantallas de Estimaciones", () => {
    expect(atajosCoincidentes("recibos", { maquilador: true, esDesarrollador: false }).map((r) => r.href)).toEqual([
      "/estimaciones/recibos",
      "/estimaciones/mis-recibos",
    ]);
    expect(atajosCoincidentes("cancelados", { maquilador: true, esDesarrollador: false })).toEqual([]);
  });

  it("Usuarios solo aparece para el desarrollador", () => {
    expect(atajosCoincidentes("usuarios", interno)).toEqual([]);
    expect(atajosCoincidentes("usuarios", { maquilador: false, esDesarrollador: true })).toHaveLength(1);
  });

  it("sin texto no sugiere nada y nunca pasa de 5", () => {
    expect(atajosCoincidentes("   ", interno)).toEqual([]);
    expect(atajosCoincidentes("e", interno).length).toBeLessThanOrEqual(5);
  });
});
