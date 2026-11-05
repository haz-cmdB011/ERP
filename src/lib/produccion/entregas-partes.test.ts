import { describe, expect, it } from "vitest";
import type { MuebleFlujo } from "./flujo-mueble";
import { completosPorPartes, faltanDeParte, partesParaEntrega, type ParteEntrega } from "./entregas-partes";

const puerta: ParteEntrega = { id: "pu", descripcion: "Puerta", piezasPorMueble: 1, unidad: "PZA", entregadas: 0 };
const marco: ParteEntrega = { id: "ma", descripcion: "Marco", piezasPorMueble: 1, unidad: "PZA", entregadas: 0 };

describe("entregas parciales por parte", () => {
  it("los muebles completos son los que alcanza la parte más atrasada", () => {
    expect(completosPorPartes([puerta, marco], 10)).toBe(0);
    expect(completosPorPartes([puerta, marco], 10, { pu: 6 })).toBe(0);
    expect(completosPorPartes([puerta, marco], 10, { pu: 6, ma: 4 })).toBe(4);
    expect(completosPorPartes([{ ...puerta, entregadas: 6 }, { ...marco, entregadas: 4 }], 10, { ma: 2 })).toBe(6);
  });

  it("con piezas por mueble mayores a uno, divide hacia abajo", () => {
    const tabla = { ...puerta, id: "ta", piezasPorMueble: 3 };
    expect(completosPorPartes([tabla], 13, { ta: 20 })).toBe(6);
  });

  it("nunca pasa de los muebles de la asignación", () => {
    expect(completosPorPartes([puerta, marco], 3, { pu: 9, ma: 9 })).toBe(3);
    expect(completosPorPartes([], 3)).toBe(0);
  });

  it("lo que falta de una parte descuenta lo ya entregado", () => {
    expect(faltanDeParte({ ...puerta, piezasPorMueble: 2, entregadas: 5 }, 10)).toBe(15);
    expect(faltanDeParte({ ...puerta, entregadas: 12 }, 10)).toBe(0);
  });

  it("solo ofrece partes en la asignación de un mueble completo con despiece", () => {
    const parte = (id: string, ruta: { id: string | null; proceso: string }[] = []) => ({
      id,
      descripcion: id,
      piezasPorMueble: 1,
      unidad: null,
      ruta,
    });
    const mueble = { partes: [parte("pu"), parte("ma")] } as unknown as MuebleFlujo;
    const completa = { parte_id: null, cancelada_en: null };
    expect(partesParaEntrega(mueble, completa, new Map([["pu", 4]]))?.map((p) => [p.id, p.entregadas])).toEqual([
      ["pu", 4],
      ["ma", 0],
    ]);
    expect(partesParaEntrega(mueble, { ...completa, parte_id: "pu" }, undefined)).toBeUndefined();
    expect(partesParaEntrega(mueble, { ...completa, cancelada_en: "2026-11-01" }, undefined)).toBeUndefined();
    expect(partesParaEntrega({ partes: [] } as unknown as MuebleFlujo, completa, undefined)).toBeUndefined();
    const deAntes = { partes: [parte("pu", [{ id: "x", proceso: "armado" }])] } as unknown as MuebleFlujo;
    expect(partesParaEntrega(deAntes, completa, undefined)).toBeUndefined();
  });
});
