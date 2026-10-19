import { describe, expect, it } from "vitest";
import { etiquetaPaso, moverPaso, rutaSugerida, textoRuta, type PasoRuta } from "./ruta";

const aplica = (ss: boolean, luz: boolean) => ({
  armado: true,
  barniz: true,
  superficie_solida: ss,
  electrificacion: luz,
});

describe("rutaSugerida", () => {
  it("Armado y Barniz siempre; S.S. y Electrificación si el mueble las lleva", () => {
    expect(rutaSugerida(aplica(false, false)).map((p) => p.proceso)).toEqual(["armado", "barniz"]);
    expect(rutaSugerida(aplica(true, true)).map((p) => p.proceso)).toEqual([
      "armado",
      "superficie_solida",
      "barniz",
      "electrificacion",
    ]);
    expect(rutaSugerida(aplica(true, true)).every((p) => p.id === null)).toBe(true);
  });
});

describe("etiquetaPaso", () => {
  const ruta: PasoRuta[] = [
    { id: "a", proceso: "armado" },
    { id: "b", proceso: "barniz" },
    { id: "c", proceso: "armado" },
  ];
  it("numera solo los procesos que se repiten", () => {
    expect(etiquetaPaso(ruta, 0)).toBe("Armado 1");
    expect(etiquetaPaso(ruta, 1)).toBe("Barniz");
    expect(etiquetaPaso(ruta, 2)).toBe("Armado 2");
    expect(textoRuta(ruta)).toBe("Armado → Barniz → Armado");
  });
});

describe("moverPaso", () => {
  const ruta: PasoRuta[] = [
    { id: "a", proceso: "armado" },
    { id: "b", proceso: "barniz" },
  ];
  it("intercambia con el vecino y no se sale de la lista", () => {
    expect(moverPaso(ruta, 1, -1).map((p) => p.id)).toEqual(["b", "a"]);
    expect(moverPaso(ruta, 0, -1)).toBe(ruta);
    expect(moverPaso(ruta, 1, 1)).toBe(ruta);
  });
});
