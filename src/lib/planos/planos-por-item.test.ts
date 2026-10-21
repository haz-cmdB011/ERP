import { describe, expect, it } from "vitest";
import { normalizarNumeroPM } from "@/lib/planeacion/numero-pm";
import { pmDePlanos } from "./planos-por-item";

describe("pmDePlanos", () => {
  it("con O.T. busca por la O.T., sin el número de PM dentro de ella", () => {
    expect(pmDePlanos({ numero_pedido: "2PM134-26", orden_trabajo: "134-26", fecha_pedido: null })).toBe("PM134-26");
  });

  it("sin O.T. usa el número de PM normalizado", () => {
    const pedido = { numero_pedido: "PM 193-24", orden_trabajo: null, fecha_pedido: "2024-05-01" };
    expect(pmDePlanos(pedido)).toBe(normalizarNumeroPM("PM 193-24", { fechaPedido: "2024-05-01" }));
  });
});
