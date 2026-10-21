import { describe, expect, it } from "vitest";
import { cobrosDelMueble, hrefRecibo, resumenPago, type ReciboConRenglones } from "./pago-maquilador";

const MUEBLE = { id: "m1", modelo: "ATS-RACK B-1", descripcion: "Ballet bar", ot: "135-26" };

const recibo = (extra: Partial<ReciboConRenglones>): ReciboConRenglones => ({
  id: "r1",
  area: "armado",
  folio: "ARM-0001",
  ot: "PM135-26 ETAPA 2",
  contratista: "Maquilas López",
  estado: "pendiente",
  creado_en: "2026-10-20T10:00:00Z",
  capturado_por: "u1",
  pagado_en: null,
  pagado_por: null,
  renglones: [{ modelo: "ats rack b1", descripcion_pm: "BALLET BAR", cantidad: "5", tipo_trabajo: "normal" }],
  ...extra,
});

describe("cobrosDelMueble", () => {
  it("liga por O.T., código y descripción aunque cambien mayúsculas, signos y el formato de la O.T.", () => {
    const [c] = cobrosDelMueble(MUEBLE, [recibo({})]);
    expect(c).toMatchObject({ folio: "ARM-0001", cantidad: 5, reproceso: 0, estado: "pendiente" });
  });

  it("deja fuera otra O.T., otra variante, otro código y los recibos cancelados", () => {
    const cobros = cobrosDelMueble(MUEBLE, [
      recibo({ id: "a", ot: "136-26" }),
      recibo({ id: "b", renglones: [{ modelo: "ATS-RACK B-1", descripcion_pm: "Mesa", cantidad: 1 }] }),
      recibo({ id: "c", renglones: [{ modelo: "ATS-RACK B-2", descripcion_pm: "Ballet bar", cantidad: 1 }] }),
      recibo({ id: "d", estado: "cancelado" }),
    ]);
    expect(cobros).toEqual([]);
  });

  it("sin descripción cuenta por código; los reprocesos van aparte", () => {
    const [c] = cobrosDelMueble(MUEBLE, [
      recibo({
        renglones: [
          { modelo: "ATS-RACK B-1", descripcion_pm: null, cantidad: 2, tipo_trabajo: "normal" },
          { modelo: "ATS-RACK B-1", descripcion_pm: "Ballet bar", cantidad: 1, tipo_trabajo: "reproceso" },
        ],
      }),
    ]);
    expect(c).toMatchObject({ cantidad: 2, reproceso: 1 });
  });

  it("en Electrificación manda el mueble del renglón", () => {
    const cobros = cobrosDelMueble(MUEBLE, [
      recibo({
        id: "e",
        area: "electrificacion",
        renglones: [
          { modelo: "ATS-RACK B-1", descripcion_pm: "Ballet bar", cantidad: 3, planeacion_item_id: "otro" },
          { modelo: "X", descripcion_pm: null, cantidad: 4, planeacion_item_id: "m1" },
        ],
      }),
    ]);
    expect(cobros.map((c) => c.cantidad)).toEqual([4]);
  });
});

describe("resumenPago", () => {
  it("sin recibos", () => {
    expect(resumenPago([])).toEqual({ cobrado: 0, pagado: 0, estado: "sin_recibo", porArea: {} });
  });

  it("por pagar mientras quede un recibo sin pagar; pagado cuando todos lo están", () => {
    const cobros = cobrosDelMueble(MUEBLE, [
      recibo({ id: "1", estado: "pagado", pagado_en: "2026-10-21T10:00:00Z" }),
      recibo({ id: "2", area: "acabados", folio: "ACA-0002", estado: "revisado" }),
    ]);
    const r = resumenPago(cobros);
    expect(r).toMatchObject({ cobrado: 10, pagado: 5, estado: "por_pagar" });
    expect(r.porArea.armado).toEqual({ cobrado: 5, pagado: 5, estado: "pagado" });
    expect(r.porArea.acabados).toEqual({ cobrado: 5, pagado: 0, estado: "por_pagar" });
  });
});

describe("hrefRecibo", () => {
  it("lleva a la ficha del recibo de su área", () => {
    expect(hrefRecibo({ area: "acabados", folio: "ACA 01/2" })).toBe("/estimaciones/recibos/acabados/recibo/ACA%2001%2F2");
  });
});
