import { describe, expect, it } from "vitest";
import {
  clavePeriodo,
  consultaPeriodo,
  convertirPeriodo,
  etiquetaCortaPeriodo,
  interpretarPeriodo,
  periodoDeRecibo,
  periodoDeSemana,
  periodoPorDefecto,
  periodoVecino,
  rangoPago,
  rangoPagoDe,
  tituloPeriodo,
  ultimosPeriodos,
  type Periodo,
} from "./reporte-periodos";

const mes = (anio: number, numero: number): Periodo => ({ tipo: "mes", anio, numero });
const anio = (a: number): Periodo => ({ tipo: "anio", anio: a, numero: 1 });
const sem = (a: number, s: number) => periodoDeSemana({ anio: a, semana: s });

describe("rango de pago", () => {
  it("la semana N se paga en la N+1", () => {
    expect(rangoPago(sem(2026, 40))).toEqual({ desde: "2026-10-05", hasta: "2026-10-11" });
  });

  it("un mes cubre del primero al último día (también en bisiesto)", () => {
    expect(rangoPago(mes(2026, 10))).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(rangoPago(mes(2024, 2))).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    expect(rangoPago(mes(2026, 2))).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  it("un año cubre de enero a diciembre", () => {
    expect(rangoPago(anio(2026))).toEqual({ desde: "2026-01-01", hasta: "2026-12-31" });
  });

  it("el historial cubre desde el primer periodo hasta el último", () => {
    expect(rangoPagoDe(ultimosPeriodos(mes(2026, 2), 3))).toEqual({
      desde: "2025-12-01",
      hasta: "2026-02-28",
    });
  });
});

describe("periodo de un recibo", () => {
  it("semana: lo pagado en la N+1 cuenta en la N", () => {
    expect(clavePeriodo(periodoDeRecibo("2026-09-23T18:00:00Z", "semana"))).toBe("semana-2026-38");
  });

  it("mes y año usan la fecha local de México", () => {
    // 1 oct 2026 02:00 UTC = 30 sep 20:00 en México.
    expect(periodoDeRecibo("2026-10-01T02:00:00Z", "mes")).toEqual(mes(2026, 9));
    expect(periodoDeRecibo("2027-01-01T03:00:00Z", "anio")).toEqual(anio(2026));
  });
});

describe("vecinos e historial", () => {
  it("el mes cruza el año en los dos sentidos", () => {
    expect(periodoVecino(mes(2026, 1), -1)).toEqual(mes(2025, 12));
    expect(periodoVecino(mes(2026, 12), 1)).toEqual(mes(2027, 1));
  });

  it("el año suma y resta", () => {
    expect(periodoVecino(anio(2026), -1)).toEqual(anio(2025));
  });

  it("la semana cruza el año ISO", () => {
    expect(periodoVecino(sem(2027, 1), -1)).toEqual(sem(2026, 53));
  });

  it("termina en el periodo visto, del más antiguo al más reciente", () => {
    expect(ultimosPeriodos(mes(2026, 2), 4)).toEqual([
      mes(2025, 11),
      mes(2025, 12),
      mes(2026, 1),
      mes(2026, 2),
    ]);
    expect(ultimosPeriodos(sem(2027, 2), 4).map((p) => p.numero)).toEqual([52, 53, 1, 2]);
  });

  it("por defecto: 8 semanas, 12 meses y 4 años", () => {
    expect(ultimosPeriodos(sem(2026, 40))).toHaveLength(8);
    expect(ultimosPeriodos(mes(2026, 10))).toHaveLength(12);
    expect(ultimosPeriodos(anio(2026))).toHaveLength(4);
  });
});

describe("cambiar de pestaña conserva la época", () => {
  it("de la semana 40 de 2026 (se paga del 5 al 11 de octubre) al mes y al año", () => {
    expect(convertirPeriodo(sem(2026, 40), "mes")).toEqual(mes(2026, 10));
    expect(convertirPeriodo(sem(2026, 40), "anio")).toEqual(anio(2026));
  });

  it("de un mes a la semana que se paga en él", () => {
    expect(convertirPeriodo(mes(2026, 10), "semana")).toEqual(sem(2026, 39));
  });

  it("al mismo tipo no cambia nada", () => {
    const p = mes(2026, 3);
    expect(convertirPeriodo(p, "mes")).toBe(p);
  });
});

describe("textos", () => {
  it("título y etiqueta corta", () => {
    expect(tituloPeriodo(sem(2026, 40))).toBe("Semana 40 de 2026");
    expect(tituloPeriodo(mes(2026, 10))).toBe("Octubre de 2026");
    expect(tituloPeriodo(anio(2026))).toBe("Año 2026");
    expect(etiquetaCortaPeriodo(sem(2026, 40))).toBe("S40");
    expect(etiquetaCortaPeriodo(mes(2026, 10))).toBe("Oct 26");
    expect(etiquetaCortaPeriodo(anio(2026))).toBe("2026");
  });
});

describe("interpretarPeriodo", () => {
  // Jueves 8 oct 2026: la semana por reportar es la 40 (28 sep – 4 oct).
  const ahora = new Date("2026-10-08T18:00:00Z");

  it("sin parámetros: semana por reportar", () => {
    expect(interpretarPeriodo({}, ahora)).toEqual({ periodo: sem(2026, 40), aviso: null });
  });

  it("mes y año por defecto son los de hoy", () => {
    expect(interpretarPeriodo({ periodo: "mes" }, ahora).periodo).toEqual(mes(2026, 10));
    expect(interpretarPeriodo({ periodo: "anio" }, ahora).periodo).toEqual(anio(2026));
    expect(periodoPorDefecto("mes", ahora)).toEqual(mes(2026, 10));
  });

  it("lee mes y año de la URL", () => {
    expect(interpretarPeriodo({ periodo: "mes", anio: "2025", mes: "3" }, ahora)).toEqual({
      periodo: mes(2025, 3),
      aviso: null,
    });
    expect(interpretarPeriodo({ periodo: "anio", anio: "2024" }, ahora).periodo).toEqual(anio(2024));
  });

  it("un mes o año inválido avisa y no cambia en silencio", () => {
    const m = interpretarPeriodo({ periodo: "mes", anio: "2026", mes: "13" }, ahora);
    expect(m.periodo).toEqual(mes(2026, 10));
    expect(m.aviso).toContain("no es válido");
    const a = interpretarPeriodo({ periodo: "anio", anio: "abc" }, ahora);
    expect(a.periodo).toEqual(anio(2026));
    expect(a.aviso).toContain("no es válido");
  });

  it("un tipo desconocido cae a la semana", () => {
    expect(interpretarPeriodo({ periodo: "decada" }, ahora).periodo.tipo).toBe("semana");
  });

  it("la consulta de URL vuelve a leerse igual", () => {
    for (const p of [sem(2026, 40), mes(2026, 10), anio(2026)]) {
      const qs = Object.fromEntries(new URLSearchParams(consultaPeriodo(p)));
      expect(interpretarPeriodo(qs, ahora).periodo).toEqual(p);
    }
  });
});
