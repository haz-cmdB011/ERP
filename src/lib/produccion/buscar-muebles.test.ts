import { describe, expect, it } from "vitest";
import {
  coincideTodos,
  divididoEnLotes,
  normalizar,
  patronTolerante,
  terminoPrincipal,
  terminosDe,
} from "./buscar-muebles";

describe("normalizar / terminosDe", () => {
  it("ignora mayúsculas y acentos", () => {
    expect(normalizar("PÉRGOLA 455")).toBe("pergola 455");
    expect(normalizar("  Cañón ")).toBe("canon");
  });

  it("separa en términos y limita su cantidad", () => {
    expect(terminosDe("  Pérgola   455 ")).toEqual(["pergola", "455"]);
    expect(terminosDe("")).toEqual([]);
    expect(terminosDe("a b c d e f g")).toHaveLength(5);
  });
});

describe("coincideTodos", () => {
  it("exige que aparezcan todos los términos, en cualquier orden", () => {
    const texto = normalizar("2 PG-02 HIBRIDO PÉRGOLA 455 PRD-000003");
    expect(coincideTodos(texto, ["pergola", "455"])).toBe(true);
    expect(coincideTodos(texto, ["455", "pergola"])).toBe(true);
    expect(coincideTodos(texto, ["pergola", "240"])).toBe(false);
    expect(coincideTodos(texto, ["prd-000003"])).toBe(true);
  });
});

describe("patronTolerante", () => {
  it("vuelve comodín las letras que pueden llevar acento", () => {
    expect(patronTolerante("pergola")).toBe("p_rg_l_");
    expect(patronTolerante("pg-02")).toBe("pg-02");
  });

  it("quita lo que rompería el filtro .or() o los comodines de LIKE", () => {
    expect(patronTolerante('a,b(c)"d%e_f\\g*')).toBe("_bcd_fg");
    expect(patronTolerante("x,y")).toBe("xy");
    expect(patronTolerante("50%")).toBe("50");
  });

  it("un patrón tolerante encuentra la palabra con acento en la base (LIKE)", () => {
    const like = new RegExp("^" + patronTolerante("pergola").replace(/_/g, ".") + "$", "i");
    expect(like.test("PÉRGOLA")).toBe(true);
    expect(like.test("pergola")).toBe(true);
  });
});

describe("terminoPrincipal / divididoEnLotes", () => {
  it("elige el término más largo para acotar en la base", () => {
    expect(terminoPrincipal(["pg", "pergola", "455"])).toBe("pergola");
    expect(terminoPrincipal([])).toBeNull();
  });

  it("divide en lotes del tamaño pedido", () => {
    expect(divididoEnLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(divididoEnLotes([], 3)).toEqual([]);
  });
});
