import { describe, expect, it } from "vitest";
import { codigoPedidoBuscado, filtroFoliosOr } from "./folios-consulta";

describe("codigoPedidoBuscado", () => {
  it("quita espacios y el prefijo OT para buscar el PM u OT", () => {
    expect(codigoPedidoBuscado("PM 157-26")).toBe("PM157-26");
    expect(codigoPedidoBuscado("OT 134-26")).toBe("134-26");
    expect(codigoPedidoBuscado("O.T. 134-26")).toBe("134-26");
    expect(codigoPedidoBuscado("157-26")).toBe("157-26");
  });

  it("deja el folio tal cual", () => {
    expect(codigoPedidoBuscado("CAL-000014")).toBe("CAL-000014");
  });

  it("no deja pasar caracteres que rompen el filtro", () => {
    expect(codigoPedidoBuscado("PM157-26,)*")).toBe("PM157-26");
  });

  it("sin código útil devuelve vacío", () => {
    expect(codigoPedidoBuscado("  OT  ")).toBe("");
    expect(codigoPedidoBuscado(",,,")).toBe("");
  });
});

describe("filtroFoliosOr", () => {
  it("busca el texto en el folio, en el PM y en la O.T.", () => {
    expect(filtroFoliosOr("PM157-26")).toBe(
      "folio.ilike.*PM157-26*,numero_pedido.ilike.*PM157-26*,orden_trabajo.ilike.*PM157-26*"
    );
  });

  it("con prefijo OT busca el código en el PM y en la O.T., no en el folio", () => {
    expect(filtroFoliosOr("OT 135-26")).toBe(
      "folio.ilike.*OT 135-26*,numero_pedido.ilike.*135-26*,orden_trabajo.ilike.*135-26*"
    );
  });

  it("quita lo que rompe la lista del filtro", () => {
    expect(filtroFoliosOr("a,b(c)*")).toBe("folio.ilike.*abc*,numero_pedido.ilike.*abc*,orden_trabajo.ilike.*abc*");
  });

  it("escapa los comodines de LIKE en el folio", () => {
    expect(filtroFoliosOr("50%")).toBe("folio.ilike.*50\\%*,numero_pedido.ilike.*50*,orden_trabajo.ilike.*50*");
  });

  it("sin nada que buscar, ningún folio coincide", () => {
    expect(filtroFoliosOr(",*")).toBe("id.is.null");
  });
});
