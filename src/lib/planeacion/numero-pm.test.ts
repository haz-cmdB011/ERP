import { describe, expect, it } from "vitest";
import { normalizarNumeroPM, ordenDeTrabajo } from "./numero-pm";

describe("normalizarNumeroPM", () => {
  it.each([
    ["PM 107-26", "PM107-26"],
    ["PM107-26", "PM107-26"],
    ["pm-107-26", "PM107-26"],
    ["PM 107 - 26", "PM107-26"],
    ["107-26", "PM107-26"],
    ["PM 9-26", "PM009-26"],
    ["PM 107/2026", "PM107-26"],
    ["PM 1234-26", "PM1234-26"],
  ])("normaliza %s → %s", (entrada, esperado) => {
    expect(normalizarNumeroPM(entrada)).toBe(esperado);
  });

  it("toma el año del nombre del archivo si la celda no lo trae", () => {
    expect(
      normalizarNumeroPM("PM 107", { nombreArchivo: "PM 107-26 SMART FIT PLAZA PALMIRA.xlsx" })
    ).toBe("PM107-26");
  });

  it("ignora el nombre del archivo si es de otro PM", () => {
    expect(
      normalizarNumeroPM("PM 108", {
        nombreArchivo: "PM 107-26 SMART FIT.xlsx",
        fechaPedido: "2025-03-01",
      })
    ).toBe("PM108-25");
  });

  it("usa el año de la fecha del pedido como respaldo", () => {
    expect(normalizarNumeroPM("PM-999", { fechaPedido: "2026-02-06" })).toBe("PM999-26");
  });

  it("usa el año actual si no hay otra fuente", () => {
    expect(normalizarNumeroPM("PM-999", { hoy: new Date(2027, 0, 1) })).toBe("PM999-27");
  });

  it("deja el valor intacto si no trae ningún número", () => {
    expect(normalizarNumeroPM("SIN NUMERO")).toBe("SIN NUMERO");
  });

  describe("varios PM en una Orden de Trabajo", () => {
    it.each([
      ["1PM134-26", "1PM134-26"],
      ["2 PM 134-26", "2PM134-26"],
      ["02-PM-134/2026", "2PM134-26"],
      ["3pm 9-26", "3PM009-26"],
      ["102-24-2", "2PM102-24"],
      ["PM 102-24-2", "2PM102-24"],
      ["009-26-2", "2PM009-26"],
    ])("conserva el número de PM: %s → %s", (entrada, esperado) => {
      expect(normalizarNumeroPM(entrada)).toBe(esperado);
    });

    it("toma el número de PM del nombre del archivo si la celda no lo trae", () => {
      expect(
        normalizarNumeroPM("PM134-26", { nombreArchivo: "2PM 134-26 SMART FIT.xlsx" })
      ).toBe("2PM134-26");
    });

    it("toma el sufijo del nombre del archivo", () => {
      expect(
        normalizarNumeroPM("PM102-24", { nombreArchivo: "PM 102-24-2 REMODELACION CAMPESTRE II.xlsx" })
      ).toBe("2PM102-24");
    });

    it("no confunde una fecha del nombre del archivo con el número de PM", () => {
      expect(
        normalizarNumeroPM("168-25 REMODELACIÓN PH MONTERREY REPROCESOS", {
          nombreArchivo: "PM 168-25 REMODELACIÓN PH MONTERREY REPROCESOS 8.07.26.xlsx",
        })
      ).toBe("PM168-25");
    });

    it("ignora el número de PM del archivo si es de otra OT", () => {
      expect(
        normalizarNumeroPM("PM135-26", { nombreArchivo: "2PM 134-26 SMART FIT.xlsx" })
      ).toBe("PM135-26");
    });

    describe("hojas extra con etiqueta (ej. solicitud de cambio)", () => {
      it.each([
        ["SDC-1_OT 009-26-2", "SDC-1 2PM009-26"],
        ["SDC-1 OT 009-26-2", "SDC-1 2PM009-26"],
        ["sdc 2_OT. 009-26", "SDC-2 PM009-26"],
        ["SDC-1 PM 134-26", "SDC-1 PM134-26"],
        ["SDC-1_2PM134-26", "SDC-1 2PM134-26"],
      ])("conserva la etiqueta: %s → %s", (entrada, esperado) => {
        expect(normalizarNumeroPM(entrada)).toBe(esperado);
      });

      it("no toma el número de OT como etiqueta", () => {
        expect(normalizarNumeroPM("OT 009-26-2")).toBe("2PM009-26");
      });

      it("queda en la misma OT que el PM principal", () => {
        expect(ordenDeTrabajo(normalizarNumeroPM("SDC-1_OT 009-26-2"))).toBe("009-26");
      });
    });

    it.each([
      ["PM134-26", "134-26"],
      ["1PM134-26", "134-26"],
      ["2PM134-26", "134-26"],
      ["009-26-2", null],
    ])("orden de trabajo de %s → %s", (pm, ot) => {
      expect(ordenDeTrabajo(pm)).toBe(ot);
    });
  });
});
