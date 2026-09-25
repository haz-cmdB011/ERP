import { describe, expect, it } from "vitest";
import { carpetaEsDelModelo, elegirPlanos, normalizarModelo } from "./modelo";

describe("normalizarModelo", () => {
  it.each([
    ["P-19-01", "P-19-01"],
    ["P-19/01", "P-19-01"],
    ["p 19 01", "P-19-01"],
    ["PSTA01 (90)", "PSTA01-(90)"],
    ["  FXSV_03 ", "FXSV-03"],
    ["Módulo C-DER", "MODULO-C-DER"],
  ])("%s → %s", (entrada, esperado) => {
    expect(normalizarModelo(entrada)).toBe(esperado);
  });
});

describe("carpetaEsDelModelo", () => {
  const n = normalizarModelo;
  it("acepta el nombre exacto", () => {
    expect(carpetaEsDelModelo(n("PSTA05 (100)"), n("PSTA05 (100)"), false)).toBe(true);
  });
  it("acepta texto extra en palabras si se permite", () => {
    expect(carpetaEsDelModelo(n("PSTA05 (100) SANITARIOS MUJERES"), n("PSTA05 (100)"), true)).toBe(true);
    expect(carpetaEsDelModelo(n("PSTA08 (110) CANCELADA"), n("PSTA08 (110)"), true)).toBe(true);
    expect(carpetaEsDelModelo(n("PSTA04 (90) - CUADRANTE 2"), n("PSTA04 (90)"), true)).toBe(true);
  });
  it("no acepta texto extra si no se permite", () => {
    expect(carpetaEsDelModelo(n("MUESTRA SECCION"), n("MUESTRA"), false)).toBe(false);
  });
  it("no confunde variantes numéricas ni otras medidas", () => {
    expect(carpetaEsDelModelo(n("FXSV-22-1"), n("FXSV-22"), true)).toBe(false);
    expect(carpetaEsDelModelo(n("PSTA05 (120)"), n("PSTA05 (100)"), true)).toBe(false);
    expect(carpetaEsDelModelo(n("PSTA010"), n("PSTA01"), true)).toBe(false);
  });
});

describe("elegirPlanos", () => {
  const plano = (pm: string | null, anio: number, carpeta: string) => ({
    pm,
    anio,
    modelo_normalizado: normalizarModelo(carpeta),
  });

  it("prefiere los del mismo PM, incluidas carpetas con texto extra", () => {
    const planos = [
      plano("PM009-26", 2026, "PSTA05 (100) SANITARIOS MUJERES"),
      plano("PM009-26", 2026, "PSTA05 (100) SANITAROS HOMBRES"),
      plano("PM050-25", 2025, "PSTA05 (100)"),
    ];
    const r = elegirPlanos("PSTA05 (100)", "PM009-26", planos);
    expect(r.deOtroPm).toBe(false);
    expect(r.planos).toHaveLength(2);
  });

  it("usa el de otro PM (el más reciente) solo si coincide exacto", () => {
    const planos = [
      plano("PM004-25", 2025, "ZOCLO"),
      plano("PM100-23", 2023, "ZOCLO"),
      plano("PM001-26", 2026, "ZOCLO LACA"),
    ];
    const r = elegirPlanos("ZOCLO", "PM999-26", planos);
    expect(r.deOtroPm).toBe(true);
    expect(r.planos).toEqual([planos[0]]);
  });

  it("devuelve vacío si no hay coincidencia", () => {
    expect(elegirPlanos("MUESTRA", "PM009-26", [plano("PM001-25", 2025, "MUESTRA SECCION")]).planos).toEqual([]);
  });
});
