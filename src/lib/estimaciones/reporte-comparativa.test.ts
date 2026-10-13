import { describe, expect, it } from "vitest";
import { compararPeriodos } from "./reporte-comparativa";
import type { Periodo } from "./reporte-periodos";
import type { ReciboPagado } from "./reporte-semanal";

function recibo(parcial: Partial<ReciboPagado>): ReciboPagado {
  return {
    tipo: "acabados",
    folio: "1",
    contratista: "Ana",
    ot: "193-24",
    obra: "",
    pagadoEn: "2026-10-10T18:00:00Z",
    importe: 1000,
    piezas: 1,
    ...parcial,
  };
}

const OCT: Periodo = { tipo: "mes", anio: 2026, numero: 10 };
const EN_OCT = "2026-10-10T18:00:00Z";
const EN_SEP = "2026-09-10T18:00:00Z";

describe("comparar un periodo contra el anterior", () => {
  const recibos = [
    // Ana: sept 1000 → oct 1500 (sube).
    recibo({ contratista: "Ana", importe: 1000, pagadoEn: EN_SEP, ot: "1" }),
    recibo({ contratista: "Ana", importe: 1500, pagadoEn: EN_OCT, ot: "1" }),
    // Luis: solo en sept (sin pago en octubre).
    recibo({ contratista: "Luis", importe: 800, pagadoEn: EN_SEP, tipo: "armado", ot: "2" }),
    // Pedro: nuevo en octubre.
    recibo({ contratista: "Pedro", importe: 500, pagadoEn: EN_OCT, tipo: "electrificacion", ot: "3" }),
    // Fuera de los dos meses: se ignora.
    recibo({ contratista: "Ana", importe: 9999, pagadoEn: "2026-05-10T18:00:00Z" }),
  ];
  const c = compararPeriodos(recibos, OCT);

  it("compara los totales", () => {
    expect(c.hayBase).toBe(true);
    expect(c.total).toEqual({ actual: 2000, anterior: 1800, diferencia: 200, cambio: 11.1 });
    expect(c.recibos.actual).toBe(2);
    expect(c.recibos.anterior).toBe(2);
    expect(c.activos).toMatchObject({ actual: 2, anterior: 2 });
    expect(c.ticket).toMatchObject({ actual: 1000, anterior: 900 });
    expect(c.ots).toMatchObject({ actual: 2, anterior: 2 });
  });

  it("compara cada área, siempre las tres", () => {
    expect(c.porArea.map((f) => [f.etiqueta, f.actual, f.anterior, f.estado])).toEqual([
      ["Acabados", 1500, 1000, "sube"],
      ["Armado", 0, 800, "sin-pago"],
      ["Electrificación", 500, 0, "nuevo"],
    ]);
  });

  it("clasifica a los maquiladores y ordena por la mayor variación", () => {
    expect(c.porMaquilador.map((f) => [f.etiqueta, f.diferencia, f.estado])).toEqual([
      ["Luis", -800, "sin-pago"],
      ["Ana", 500, "sube"],
      ["Pedro", 500, "nuevo"],
    ]);
  });

  it("redacta lo que cambió", () => {
    expect(c.hallazgos[0]).toContain("más");
    expect(c.hallazgos.join(" ")).toContain("Maquilador con mayor aumento: Ana");
    expect(c.hallazgos.join(" ")).toContain("Pedro");
    expect(c.hallazgos.join(" ")).toContain("Luis");
  });
});

describe("casos límite", () => {
  it("sin pagos en el periodo anterior no hay base", () => {
    const c = compararPeriodos([recibo({ importe: 700 })], OCT);
    expect(c.hayBase).toBe(false);
    expect(c.total.cambio).toBeNull();
    expect(c.hallazgos).toHaveLength(1);
    expect(c.hallazgos[0]).toContain("no hay contra qué comparar");
  });

  it("sin recibos en ninguno de los dos", () => {
    const c = compararPeriodos([], OCT);
    expect(c.hayBase).toBe(false);
    expect(c.porMaquilador).toEqual([]);
    expect(c.hallazgos[0]).toContain("No hubo pagos");
  });

  it("lo mismo en ambos periodos", () => {
    const c = compararPeriodos(
      [recibo({ pagadoEn: EN_SEP }), recibo({ pagadoEn: EN_OCT })],
      OCT
    );
    expect(c.total.diferencia).toBe(0);
    expect(c.porMaquilador[0].estado).toBe("igual");
    expect(c.hallazgos[0]).toContain("lo mismo");
  });

  it("junta maquiladores con el nombre escrito distinto", () => {
    const c = compararPeriodos(
      [
        recibo({ contratista: "José Ramírez", pagadoEn: EN_SEP }),
        recibo({ contratista: "JOSE RAMIREZ", pagadoEn: EN_OCT }),
      ],
      OCT
    );
    expect(c.porMaquilador).toHaveLength(1);
  });

  it("funciona por semana (cruce de año) y por año", () => {
    const semana: Periodo = { tipo: "semana", anio: 2027, numero: 1 };
    // La semana 1 de 2027 se paga del 11 al 17 ene; la 53 de 2026, del 4 al 10 ene.
    const cs = compararPeriodos(
      [
        recibo({ pagadoEn: "2027-01-13T18:00:00Z", importe: 300 }),
        recibo({ pagadoEn: "2027-01-06T18:00:00Z", importe: 200 }),
      ],
      semana
    );
    expect(cs.total).toMatchObject({ actual: 300, anterior: 200 });

    const ca = compararPeriodos(
      [
        recibo({ pagadoEn: "2026-03-01T18:00:00Z", importe: 100 }),
        recibo({ pagadoEn: "2025-03-01T18:00:00Z", importe: 400 }),
      ],
      { tipo: "anio", anio: 2026, numero: 1 }
    );
    expect(ca.total).toMatchObject({ actual: 100, anterior: 400, diferencia: -300, cambio: -75 });
  });
});
