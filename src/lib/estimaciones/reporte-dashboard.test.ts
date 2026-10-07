import { describe, expect, it } from "vitest";
import {
  agruparEnOtros,
  armarTablero,
  cambiosNotables,
  repartoPorArea,
  repartoPorMaquilador,
  semanaDeReporteDe,
  ultimasSemanas,
  type Porcion,
} from "./reporte-dashboard";
import type { ReciboPagado } from "./reporte-semanal";

function recibo(parcial: Partial<ReciboPagado>): ReciboPagado {
  return {
    tipo: "acabados",
    folio: "1",
    contratista: "Juan Pérez",
    ot: "193-24",
    obra: "",
    pagadoEn: "2026-09-23T18:00:00Z",
    importe: 1000,
    piezas: 10,
    ...parcial,
  };
}

// La semana 38 (14-20 sep) se paga en la 39 (21-27 sep); la 37 en la 38.
const SEM_38 = { anio: 2026, semana: 38 };
const PAGO_SEM_38 = "2026-09-23T18:00:00Z";
const PAGO_SEM_37 = "2026-09-16T18:00:00Z";

describe("semana de reporte de un recibo", () => {
  it("un recibo pagado en la semana N+1 cuenta en la semana N", () => {
    expect(semanaDeReporteDe(PAGO_SEM_38)).toEqual(SEM_38);
    expect(semanaDeReporteDe(PAGO_SEM_37)).toEqual({ anio: 2026, semana: 37 });
  });

  it("usa la hora de la Ciudad de México", () => {
    // Domingo 27 sep 22:00 en México = lunes 28 sep 04:00 UTC: sigue en la 39.
    expect(semanaDeReporteDe("2026-09-28T04:00:00Z")).toEqual(SEM_38);
  });

  it("cruza el año", () => {
    expect(semanaDeReporteDe("2027-01-06T18:00:00Z")).toEqual({ anio: 2026, semana: 53 });
  });
});

describe("comparación contra el promedio", () => {
  it("compara el total y marca los cambios notables", () => {
    const t = armarTablero(
      [
        recibo({ contratista: "Ana", importe: 1000, pagadoEn: "2026-09-02T18:00:00Z" }),
        recibo({ contratista: "Ana", importe: 1000, pagadoEn: "2026-09-09T18:00:00Z" }),
        recibo({ contratista: "Luis", importe: 1000, pagadoEn: "2026-09-02T18:00:00Z" }),
        recibo({ contratista: "Ana", importe: 2000, pagadoEn: PAGO_SEM_38 }),
        recibo({ contratista: "Pedro", importe: 500, pagadoEn: PAGO_SEM_38 }),
      ],
      SEM_38
    );
    // Semanas anteriores con pago: 2.000 (S35) y 1.000 (S36) → promedio 1.500; hoy 2.500.
    expect(t.cambioTotalVsPromedio).toBe(66.7);
    const n = cambiosNotables(t.maquiladores);
    // Ana: 2000 contra su promedio 1000 (+100%); Luis no cobró hoy (-100%); Pedro es nuevo (sin base).
    expect(n.map((x) => [x.contratista, x.cambio])).toEqual([
      ["Ana", 100],
      ["Luis", -100],
    ]);
  });

  it("sin pagos esta semana no hay comparación", () => {
    expect(armarTablero([], SEM_38).cambioTotalVsPromedio).toBeNull();
    expect(cambiosNotables([])).toEqual([]);
  });
});

describe("ultimasSemanas", () => {
  it("termina en la semana vista, de la más antigua a la más reciente", () => {
    const s = ultimasSemanas({ anio: 2027, semana: 2 }, 4);
    expect(s).toEqual([
      { anio: 2026, semana: 52 },
      { anio: 2026, semana: 53 },
      { anio: 2027, semana: 1 },
      { anio: 2027, semana: 2 },
    ]);
  });
});

describe("repartos", () => {
  it("reparte lo pagado por maquilador en %, de mayor a menor", () => {
    const r = repartoPorMaquilador([
      recibo({ contratista: "Ana", importe: 300 }),
      recibo({ contratista: "Luis", importe: 600 }),
      recibo({ contratista: "ANA ", importe: 100 }),
    ]);
    expect(r).toEqual([
      { etiqueta: "Luis", importe: 600, porcentaje: 60 },
      { etiqueta: "Ana", importe: 400, porcentaje: 40 },
    ]);
  });

  it("junta nombres con acentos y mayúsculas distintas", () => {
    const r = repartoPorMaquilador([
      recibo({ contratista: "José Ramírez", importe: 100 }),
      recibo({ contratista: "JOSE RAMIREZ", importe: 100 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].importe).toBe(200);
    expect(r[0].porcentaje).toBe(100);
  });

  it("un recibo sin contratista cae en 'Sin contratista'", () => {
    expect(repartoPorMaquilador([recibo({ contratista: "  " })])[0].etiqueta).toBe(
      "Sin contratista"
    );
  });

  it("sin recibos no hay reparto", () => {
    expect(repartoPorMaquilador([])).toEqual([]);
    expect(repartoPorArea([])).toEqual([]);
  });

  it("reparte por área en el orden fijo Acabados, Armado, Electrificación", () => {
    const r = repartoPorArea([
      recibo({ tipo: "electrificacion", importe: 250 }),
      recibo({ tipo: "acabados", importe: 500 }),
      recibo({ tipo: "electrificacion", importe: 250 }),
    ]);
    expect(r.map((p) => p.etiqueta)).toEqual(["Acabados", "Electrificación"]);
    expect(r.map((p) => p.porcentaje)).toEqual([50, 50]);
  });

  it("agrupa lo que sobra en 'Otros'", () => {
    const porciones: Porcion[] = [60, 20, 10, 6, 4].map((p, i) => ({
      etiqueta: `M${i}`,
      importe: p,
      porcentaje: p,
    }));
    const r = agruparEnOtros(porciones, 3);
    expect(r.map((p) => p.etiqueta)).toEqual(["M0", "M1", "Otros"]);
    expect(r[2]).toEqual({ etiqueta: "Otros", importe: 20, porcentaje: 20 });
    expect(agruparEnOtros(porciones, 5)).toBe(porciones);
  });
});

describe("tablero: rendimiento por maquilador", () => {
  const recibos = [
    // Ana: sem 37 = 1000, sem 38 = 1500 (2 recibos, 2 OT).
    recibo({ contratista: "Ana", importe: 1000, pagadoEn: PAGO_SEM_37 }),
    recibo({ contratista: "Ana", importe: 1000, pagadoEn: PAGO_SEM_38, ot: "193-24" }),
    recibo({ contratista: "Ana", importe: 500, pagadoEn: PAGO_SEM_38, ot: "102-24" }),
    // Luis: solo la semana 37.
    recibo({ contratista: "Luis", importe: 800, pagadoEn: PAGO_SEM_37 }),
    // Fuera del historial (muy anterior): se ignora.
    recibo({ contratista: "Ana", importe: 9999, pagadoEn: "2025-01-15T18:00:00Z" }),
  ];
  const t = armarTablero(recibos, SEM_38, 4);

  it("cubre las últimas semanas y totaliza cada una", () => {
    expect(t.semanas).toHaveLength(4);
    expect(t.totalesPorSemana.map((x) => x.importe)).toEqual([0, 0, 1800, 1500]);
    expect(t.importeSemana).toBe(1500);
    expect(t.recibosSemana).toBe(2);
    expect(t.otsSemana).toBe(2);
    expect(t.activosSemana).toBe(1);
    expect(t.ticketPromedio).toBe(750);
    expect(t.cambioTotalVsAnterior).toBeCloseTo(-16.7, 1);
  });

  it("calcula los KPI de quien cobró en la semana", () => {
    const ana = t.maquiladores.find((m) => m.contratista === "Ana")!;
    expect(ana.importeSemana).toBe(1500);
    expect(ana.recibosSemana).toBe(2);
    expect(ana.otsSemana).toBe(2);
    expect(ana.porcentajeSemana).toBe(100);
    expect(ana.cambioVsAnterior).toBe(50);
    expect(ana.cambioVsPromedio).toBe(50); // contra 1000 de las otras semanas
    expect(ana.semanasConPago).toBe(2);
    expect(ana.promedioSemanal).toBe(1250);
    expect(ana.mejorSemana?.importe).toBe(1500);
    expect(ana.lugar).toBe(1);
    expect(ana.historial.map((h) => h.importe)).toEqual([0, 0, 1000, 1500]);
  });

  it("quien no cobró esta semana queda sin lugar y sin cambio", () => {
    const luis = t.maquiladores.find((m) => m.contratista === "Luis")!;
    expect(luis.importeSemana).toBe(0);
    expect(luis.lugar).toBe(0);
    expect(luis.cambioVsPromedio).toBeNull();
    expect(luis.cambioVsAnterior).toBe(-100);
    expect(luis.semanasConPago).toBe(1);
    expect(t.maquiladores.map((m) => m.contratista)).toEqual(["Ana", "Luis"]);
  });

  it("sin pago la semana anterior no hay % de cambio", () => {
    const t2 = armarTablero([recibo({ pagadoEn: PAGO_SEM_38 })], SEM_38, 4);
    expect(t2.maquiladores[0].cambioVsAnterior).toBeNull();
    expect(t2.maquiladores[0].cambioVsPromedio).toBeNull();
    expect(t2.cambioTotalVsAnterior).toBeNull();
  });

  it("una semana sin recibos da un tablero vacío sin dividir entre cero", () => {
    const t3 = armarTablero([], SEM_38);
    expect(t3.maquiladores).toEqual([]);
    expect(t3.ticketPromedio).toBeNull();
    expect(t3.importeSemana).toBe(0);
    expect(t3.semanas).toHaveLength(8);
  });
});
