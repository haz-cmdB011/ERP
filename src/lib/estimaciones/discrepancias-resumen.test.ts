import { describe, expect, it } from "vitest";
import {
  agruparPorRecibo,
  contarPendientes,
  contarRechazadas,
  type ResumenDiscrepancia,
} from "./discrepancias-resumen";

const datos: ResumenDiscrepancia[] = [
  { reciboId: "a", estado: "pendiente", estadoRecibo: "pendiente" },
  { reciboId: "a", estado: "rechazada", estadoRecibo: "pendiente" },
  { reciboId: "b", estado: "pendiente", estadoRecibo: "cancelado" },
  { reciboId: "c", estado: "rechazada", estadoRecibo: "cancelado" },
  { reciboId: "d", estado: "aceptada", estadoRecibo: "revisado" },
];

describe("resumen de discrepancias", () => {
  it("cuenta solo las pendientes de recibos vigentes", () => {
    expect(contarPendientes(datos)).toBe(1);
  });

  it("cuenta solo los rechazos de recibos vigentes", () => {
    expect(contarRechazadas(datos)).toBe(1);
  });

  it("agrupa por recibo", () => {
    const mapa = agruparPorRecibo(datos);
    expect(mapa.get("a")).toEqual({ pendientes: 1, rechazadas: 1 });
    expect(mapa.get("d")).toEqual({ pendientes: 0, rechazadas: 0 });
    expect(mapa.size).toBe(4);
  });
});
