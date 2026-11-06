import { describe, expect, it } from "vitest";
import { partesPorReentregar, type LotePartePlano } from "./partes-rechazadas";

const puerta = (cantidad: number, rechazadas: number): LotePartePlano => ({
  asignacion_id: "a1",
  parte_id: "puerta",
  parte_descripcion: "Puerta",
  unidad: "PZA",
  piezas_por_mueble: 1,
  cantidad,
  rechazadas,
});

describe("partesPorReentregar", () => {
  const muebles = new Map([["a1", 5]]);

  it("lo rechazado falta por volver a entregar", () => {
    expect(partesPorReentregar([puerta(5, 2)], muebles)).toEqual([
      expect.objectContaining({ parte: "Puerta", rechazadas: 2, porReentregar: 2 }),
    ]);
  });

  it("al volver a entregarlo ya no falta", () => {
    expect(partesPorReentregar([puerta(5, 2), puerta(2, 0)], muebles)).toEqual([]);
  });

  it("entregado a medias: solo lo que falta para la meta", () => {
    expect(partesPorReentregar([puerta(5, 2), puerta(1, 0)], muebles)[0].porReentregar).toBe(1);
  });

  it("sin rechazos no hay nada", () => {
    expect(partesPorReentregar([puerta(3, 0)], muebles)).toEqual([]);
  });
});
