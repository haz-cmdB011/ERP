import { describe, expect, it } from "vitest";
import { moverPestana, ordenFinal, soltarSobre } from "./orden-pestanas";

describe("ordenFinal", () => {
  const actuales = ["/a", "/b", "/c"];
  it("sin orden guardado deja el natural", () => {
    expect(ordenFinal(actuales, null)).toEqual(actuales);
    expect(ordenFinal(actuales, "basura")).toEqual(actuales);
  });
  it("respeta lo guardado y agrega lo nuevo al final", () => {
    expect(ordenFinal(actuales, ["/c", "/a"])).toEqual(["/c", "/a", "/b"]);
  });
  it("ignora pestañas que ya no existen, repetidas y valores raros", () => {
    expect(ordenFinal(actuales, ["/z", "/b", "/b", 3, "/a"])).toEqual(["/b", "/a", "/c"]);
  });
});

describe("moverPestana", () => {
  it("mueve a la izquierda y a la derecha", () => {
    expect(moverPestana(["/a", "/b", "/c"], "/b", -1)).toEqual(["/b", "/a", "/c"]);
    expect(moverPestana(["/a", "/b", "/c"], "/b", 1)).toEqual(["/a", "/c", "/b"]);
  });
  it("no se sale de los extremos ni de la lista", () => {
    expect(moverPestana(["/a", "/b"], "/a", -1)).toEqual(["/a", "/b"]);
    expect(moverPestana(["/a", "/b"], "/b", 1)).toEqual(["/a", "/b"]);
    expect(moverPestana(["/a", "/b"], "/x", 1)).toEqual(["/a", "/b"]);
  });
});

describe("soltarSobre", () => {
  it("ocupa el lugar del destino", () => {
    expect(soltarSobre(["/a", "/b", "/c"], "/a", "/c")).toEqual(["/b", "/c", "/a"]);
    expect(soltarSobre(["/a", "/b", "/c"], "/c", "/a")).toEqual(["/c", "/a", "/b"]);
  });
  it("sin cambios si es el mismo o no existe", () => {
    expect(soltarSobre(["/a", "/b"], "/a", "/a")).toEqual(["/a", "/b"]);
    expect(soltarSobre(["/a", "/b"], "/a", "/z")).toEqual(["/a", "/b"]);
  });
});
