import { describe, expect, it } from "vitest";
import { accionesSugeridas, filtrarMotivos, motivosMasUsados, normalizarBusqueda } from "./motivos";

const motivos = [
  { codigo: "0013", nombre: "ARMADO FUERA DE ESPECIFICACIÓN", tipo: "proceso" as const },
  { codigo: "0014", nombre: "ARMADO Y SOLDADURA FUERA DE ESPECIFICACIÓN", tipo: "proceso" as const },
  { codigo: "0100", nombre: "LEVANTAMIENTO CON DIMENSION ERRONEA", tipo: "capacitacion" as const },
];

describe("filtrarMotivos", () => {
  it("sin texto devuelve todos", () => {
    expect(filtrarMotivos(motivos, "").lista).toHaveLength(3);
  });

  it("busca sin acentos ni mayúsculas y exige todas las palabras", () => {
    expect(filtrarMotivos(motivos, "especificacion").lista.map((m) => m.codigo)).toEqual(["0013", "0014"]);
    expect(filtrarMotivos(motivos, "armado soldadura").lista.map((m) => m.codigo)).toEqual(["0014"]);
    expect(filtrarMotivos(motivos, "zzz").lista).toEqual([]);
  });

  it("busca por código", () => {
    expect(filtrarMotivos(motivos, "0100").lista.map((m) => m.codigo)).toEqual(["0100"]);
  });

  it("limita lo que se pinta y avisa que hay más", () => {
    const r = filtrarMotivos(motivos, "", 2);
    expect(r.lista).toHaveLength(2);
    expect(r.hayMas).toBe(true);
  });
});

describe("motivosMasUsados", () => {
  it("ordena por frecuencia y desempata con el más reciente", () => {
    expect(motivosMasUsados(["0014", "0013", "0013", "0100", "0014", null], 3)).toEqual(["0014", "0013", "0100"]);
    expect(motivosMasUsados(["0100", "0013"], 1)).toEqual(["0100"]);
  });
});

describe("accionesSugeridas", () => {
  it("quita repetidas (sin importar mayúsculas), vacías y respeta el límite", () => {
    expect(accionesSugeridas(["Reajustar herrajes", "reajustar herrajes ", null, "", "Rehacer pieza", "Pulir"], 2)).toEqual([
      "Reajustar herrajes",
      "Rehacer pieza",
    ]);
  });
});

describe("normalizarBusqueda", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalizarBusqueda("  DIMENSIÓN ")).toBe("dimension");
  });
});
