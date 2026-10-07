import { describe, expect, it } from "vitest";
import {
  elegiblesParaAceptarMasivo,
  resumenAceptacionMasiva,
  siguienteRecibo,
  type RenglonEvaluado,
} from "./aceptacion-masiva";

const r = (extra: Partial<RenglonEvaluado>): RenglonEvaluado => ({
  id: "r1",
  numero: 1,
  cantidad: 10,
  propuesto: 100,
  decision: null,
  banda: "auto",
  ...extra,
});

describe("aceptación masiva", () => {
  it("solo toma los renglones sin decidir y en banda automática", () => {
    const elegibles = elegiblesParaAceptarMasivo([
      r({ id: "a" }),
      r({ id: "b", banda: "estimador" }),
      r({ id: "c", banda: "justificar" }),
      r({ id: "d", decision: "aceptado" }),
      r({ id: "e", decision: "modificado" }),
    ]);
    expect(elegibles.map((x) => x.id)).toEqual(["a"]);
  });

  it("deja fuera precios en cero y renglones sin id", () => {
    expect(elegiblesParaAceptarMasivo([r({ id: "a", propuesto: 0 }), r({ id: "" })])).toEqual([]);
  });

  it("suma cantidad por precio de lo que se aceptaría", () => {
    const el = [r({ id: "a", cantidad: 4, propuesto: 250 }), r({ id: "b", cantidad: 50, propuesto: 20 })];
    expect(resumenAceptacionMasiva(el)).toEqual({ renglones: 2, importe: 2000 });
    expect(resumenAceptacionMasiva([])).toEqual({ renglones: 0, importe: 0 });
  });
});

describe("siguienteRecibo", () => {
  const p = (folio: string, tipo: "acabados" | "armado" | "electrificacion" = "acabados") => ({ tipo, folio });

  it("avanza al siguiente folio en el orden del registro (numérico)", () => {
    const pendientes = [p("9001"), p("1677"), p("200")];
    expect(siguienteRecibo(pendientes, p("200"))).toEqual({ ...p("1677"), restantes: 2 });
  });

  it("después del último vuelve al primero", () => {
    expect(siguienteRecibo([p("100"), p("200")], p("200"))).toEqual({ ...p("100"), restantes: 1 });
  });

  it("no se repite a sí mismo y distingue el tipo del mismo folio", () => {
    const pendientes = [p("100", "acabados"), p("100", "armado")];
    expect(siguienteRecibo(pendientes, p("100", "acabados"))).toEqual({ ...p("100", "armado"), restantes: 1 });
  });

  it("es null si no queda otro pendiente", () => {
    expect(siguienteRecibo([p("100")], p("100"))).toBeNull();
    expect(siguienteRecibo([], p("100"))).toBeNull();
  });

  it("funciona aunque el actual ya no esté en la lista (recién revisado)", () => {
    expect(siguienteRecibo([p("300"), p("100")], p("200"))).toEqual({ ...p("300"), restantes: 2 });
  });
});
