import { describe, expect, it } from "vitest";
import { compararFolios, elegirVigente, resumirRecibo, type ReciboConRenglones } from "./recibos-db";
import { aReciboListado, ordenarPorFolio } from "./listado-recibos";

describe("compararFolios", () => {
  it("ordena los numéricos como número y los demás después, alfabéticos", () => {
    const folios = ["9001", "099-26", "1677", "A-5", "200"];
    expect([...folios].sort(compararFolios)).toEqual(["200", "1677", "9001", "099-26", "A-5"]);
  });

  it("es 0 para el mismo folio", () => {
    expect(compararFolios("1677", "1677")).toBe(0);
  });
});

describe("elegirVigente", () => {
  it("prefiere el recibo vigente sobre uno cancelado más reciente", () => {
    const filas = [
      { id: "nuevo-cancelado", estado: "cancelado" as const },
      { id: "vigente", estado: "pendiente" as const },
    ];
    expect(elegirVigente(filas)?.id).toBe("vigente");
  });

  it("si todos están cancelados, el más reciente (el primero)", () => {
    const filas = [
      { id: "a", estado: "cancelado" as const },
      { id: "b", estado: "cancelado" as const },
    ];
    expect(elegirVigente(filas)?.id).toBe("a");
  });

  it("devuelve null sin filas", () => {
    expect(elegirVigente([])).toBeNull();
  });
});

const recibo = (renglones: ReciboConRenglones["renglones"]): ReciboConRenglones => ({
  id: "r1",
  estado: "pendiente",
  tipo: "acabados",
  folio: "1677",
  fecha_recibo: "2026-09-30",
  contratista: "Taller Uno",
  obra: null,
  ot: "102-24",
  prioridad: "normal",
  creado_en: "2026-09-30T10:00:00Z",
  renglones,
});

describe("resumirRecibo", () => {
  it("suma cantidad por precio propuesto y por aceptado, y cuenta lo sin decidir", () => {
    const r = resumirRecibo(
      recibo([
        { cantidad: 10, pu_propuesto: 20, pu_aceptado: 18, decision: "modificado" },
        { cantidad: "4" as unknown as number, pu_propuesto: 250, pu_aceptado: 0, decision: null },
      ])
    );
    expect(r.totalPropuesto).toBe(10 * 20 + 4 * 250);
    expect(r.totalAceptado).toBe(10 * 18);
    expect(r.numRenglones).toBe(2);
    expect(r.numPendientes).toBe(1);
  });

  it("deja vacíos los datos opcionales y no falla sin renglones", () => {
    const r = resumirRecibo({ ...recibo([]), ot: null });
    expect(r).toMatchObject({ obra: "", ot: "", numRenglones: 0, numPendientes: 0, totalPropuesto: 0 });
  });
});

describe("listado de recibos", () => {
  it("convierte una fila de la vista (los numeric llegan como texto)", () => {
    const l = aReciboListado({
      id: "1",
      tipo: "electrificacion",
      estado: "revisado",
      folio: "55",
      fecha_recibo: "2026-10-01",
      contratista: "X",
      obra: null,
      ot: null,
      prioridad: "urgente",
      creado_en: "2026-10-01T00:00:00Z",
      num_renglones: 3,
      num_pendientes: 0,
      total_propuesto: "1500.50",
      total_aceptado: "1400",
    });
    expect(l).toMatchObject({ totalPropuesto: 1500.5, totalAceptado: 1400, obra: "", ot: "", numRenglones: 3 });
  });

  it("ordena por folio y, a igual folio, por tipo", () => {
    const orden = ordenarPorFolio([
      { folio: "10", tipo: "armado" },
      { folio: "9", tipo: "acabados" },
      { folio: "10", tipo: "acabados" },
    ]);
    expect(orden.map((x) => `${x.folio}-${x.tipo}`)).toEqual(["9-acabados", "10-acabados", "10-armado"]);
  });
});
