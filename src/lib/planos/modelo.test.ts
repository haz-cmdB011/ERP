import { describe, expect, it } from "vitest";
import {
  asignarPlanoPorNombre,
  carpetaEsDelModelo,
  elegirPlanos,
  indexarModelosDePm,
  normalizarModelo,
} from "./modelo";

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

describe("asignarPlanoPorNombre", () => {
  const indice = indexarModelosDePm([
    { pm: "PM094-24", anio: 2024, modelo: "FX-35" },
    { pm: "PM193-24", anio: 2024, modelo: "FX-35" },
    { pm: "PM193-24", anio: 2024, modelo: "FX-19" },
    { pm: "PM009-26", anio: 2026, modelo: "PLA-07" },
    { pm: "PM009-26", anio: 2026, modelo: "pla 07" },
    { pm: "PM150-26", anio: 2026, modelo: "P-COL" },
    { pm: "PM142-26", anio: 2026, modelo: "P-COL" },
  ]);

  it("si el archivo está en la carpeta de un PM que tiene ese modelo, es de ese PM", () => {
    expect(asignarPlanoPorNombre("FX-35.PDF", "PM094-24", indice)).toEqual({
      tipo: "en_su_pm",
      pm: "PM094-24",
      anio: 2024,
      modelo: "FX-35",
    });
  });

  it("si no hay carpeta de PM que lo tenga, y solo un PM tiene ese modelo, es de ese PM", () => {
    expect(asignarPlanoPorNombre("FX-19.pdf", null, indice)).toEqual({
      tipo: "unico",
      pm: "PM193-24",
      anio: 2024,
      modelo: "FX-19",
    });
    // La carpeta es de un PM que no tiene FX-19: cuenta como nombre único.
    expect(asignarPlanoPorNombre("FX-19.pdf", "PM094-24", indice)?.tipo).toBe("unico");
  });

  it("si varios PM tienen ese modelo y el archivo no está en uno de ellos, es ambiguo", () => {
    expect(asignarPlanoPorNombre("FX-35.pdf", null, indice)).toEqual({
      tipo: "ambiguo",
      pms: ["PM094-24", "PM193-24"],
    });
    expect(asignarPlanoPorNombre("P-COL.pdf", "PM999-26", indice)).toEqual({
      tipo: "ambiguo",
      pms: ["PM150-26", "PM142-26"],
    });
  });

  it("si la carpeta es de uno de los PM que tienen el modelo, gana ese aunque haya varios", () => {
    expect(asignarPlanoPorNombre("P-COL.pdf", "PM142-26", indice)).toEqual({
      tipo: "en_su_pm",
      pm: "PM142-26",
      anio: 2026,
      modelo: "P-COL",
    });
  });

  it("no acepta texto extra en el nombre, ni archivos sin modelo", () => {
    expect(asignarPlanoPorNombre("PLA-07 CORTE.pdf", "PM009-26", indice)).toBeNull();
    expect(asignarPlanoPorNombre("ZOCLO.pdf", "PM009-26", indice)).toBeNull();
  });

  it("no repite el mismo PM para la misma clave", () => {
    expect(indice.get("PLA-07")).toHaveLength(1);
  });
});
