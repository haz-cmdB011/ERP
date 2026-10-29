import { describe, expect, it } from "vitest";
import {
  etiquetaPaso,
  moverPaso,
  pasosDeTodasLasRutas,
  puedeMover,
  rutaDeParte,
  rutaDelMueble,
  rutaSugerida,
  textoRuta,
  type PasoRuta,
} from "./ruta";

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

describe("ruta del mueble y de cada parte", () => {
  const guardada: PasoRuta[] = [{ id: "a", proceso: "armado" }];

  it("el mueble usa la suya; sin guardar, la sugerida, o vacía si tiene partes", () => {
    expect(rutaDelMueble(guardada, aplica(false, false), true)).toBe(guardada);
    expect(rutaDelMueble(undefined, aplica(false, false), false).map((p) => p.proceso)).toEqual(["armado", "barniz"]);
    expect(rutaDelMueble(undefined, aplica(false, false), true)).toEqual([]);
    // Con partes, la del mueble puede quedar vacía a propósito.
    expect(rutaDelMueble([], aplica(false, false), true)).toEqual([]);
  });

  it("una parte usa la suya (aunque esté vacía) o, si nunca la guardó, la sugerida", () => {
    expect(rutaDeParte(guardada, true, "Tabla")).toBe(guardada);
    expect(rutaDeParte(undefined, true, "Tabla")).toEqual([]);
    expect(rutaDeParte(undefined, false, "Tabla").map((p) => p.proceso)).toEqual(["armado", "barniz"]);
  });

  it("la sugerida de una parte sale de su descripción", () => {
    const procesos = (d: string) => rutaDeParte(undefined, false, d).map((p) => p.proceso);
    expect(procesos("MARCO METALICO, SOPORTE ENTREPAÑO Y CHAROLA ELECTRIFICACIÓN")).toEqual(["electrificacion"]);
    expect(procesos("MODULO D:")).toEqual(["armado", "barniz"]);
    expect(procesos("CUBIERTA DE CORIAN")).toEqual(["armado", "superficie_solida", "barniz"]);
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

describe("puedeMover", () => {
  const pasos = [{ bloqueado: true }, { bloqueado: false }, { bloqueado: true }, { bloqueado: true }];

  it("un paso sin asignaciones se mueve entre los demás", () => {
    expect(puedeMover(pasos, 1, -1)).toBe(true);
    expect(puedeMover(pasos, 1, 1)).toBe(true);
    expect(puedeMover(pasos, 0, 1)).toBe(true);
  });

  it("dos pasos con asignaciones no se cruzan, ni se sale de la ruta", () => {
    expect(puedeMover(pasos, 2, 1)).toBe(false);
    expect(puedeMover(pasos, 0, -1)).toBe(false);
    expect(puedeMover(pasos, 3, 1)).toBe(false);
  });
});

describe("pasosDeTodasLasRutas", () => {
  it("primero los de cada parte y luego los del mueble, sin los de la sugerida", () => {
    const partes: { descripcion: string; ruta: PasoRuta[] }[] = [
      {
        descripcion: "Tabla",
        ruta: [
          { id: "t1", proceso: "armado" },
          { id: "t2", proceso: "barniz" },
        ],
      },
      { descripcion: "Herraje", ruta: [{ id: null, proceso: "armado" }] },
    ];
    expect(pasosDeTodasLasRutas([{ id: "m1", proceso: "armado" }], partes)).toEqual([
      { id: "t1", etiqueta: "Tabla · 1. Armado" },
      { id: "t2", etiqueta: "Tabla · 2. Barniz" },
      { id: "m1", etiqueta: "Mueble completo · 1. Armado" },
    ]);
    expect(pasosDeTodasLasRutas([{ id: "m1", proceso: "armado" }], [])).toEqual([{ id: "m1", etiqueta: "1. Armado" }]);
  });
});
