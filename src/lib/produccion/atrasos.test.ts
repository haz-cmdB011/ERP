import { describe, expect, it } from "vitest";
import {
  DIAS_POR_VENCER,
  esAlerta,
  otConPendientes,
  plazoDePedido,
  resumirTaller,
  textoPlazo,
  type AsignacionTaller,
  type Plazo,
} from "./atrasos";

const hoy = "2026-10-07";

describe("plazoDePedido", () => {
  it("distingue vencido, hoy, por vencer y a tiempo", () => {
    expect(plazoDePedido("2026-10-04", hoy)).toEqual({ tipo: "vencido", dias: 3 });
    expect(plazoDePedido("2026-10-07", hoy)).toEqual({ tipo: "hoy" });
    expect(plazoDePedido("2026-10-08", hoy)).toEqual({ tipo: "por-vencer", dias: 1 });
    expect(plazoDePedido("2026-10-14", hoy)).toEqual({ tipo: "por-vencer", dias: DIAS_POR_VENCER });
    expect(plazoDePedido("2026-10-15", hoy)).toEqual({ tipo: "a-tiempo", dias: 8 });
  });

  it("cuenta días calendario aunque cruce de mes o de año", () => {
    expect(plazoDePedido("2026-09-30", hoy)).toEqual({ tipo: "vencido", dias: 7 });
    expect(plazoDePedido("2027-01-02", "2026-12-31")).toEqual({ tipo: "por-vencer", dias: 2 });
  });

  it("sin fecha o con fecha inválida no alerta", () => {
    expect(plazoDePedido(null, hoy).tipo).toBe("sin-fecha");
    expect(plazoDePedido(undefined, hoy).tipo).toBe("sin-fecha");
    expect(plazoDePedido("", hoy).tipo).toBe("sin-fecha");
    expect(plazoDePedido("pronto", hoy).tipo).toBe("sin-fecha");
  });

  it("ignora la hora de una fecha con marca de tiempo", () => {
    expect(plazoDePedido("2026-10-09T18:30:00+00:00", hoy)).toEqual({ tipo: "por-vencer", dias: 2 });
  });
});

describe("textoPlazo / esAlerta", () => {
  it("solo hay texto y alerta cuando hay algo que avisar", () => {
    expect(textoPlazo({ tipo: "vencido", dias: 3 })).toBe("Atrasada 3 d");
    expect(textoPlazo({ tipo: "hoy" })).toBe("Vence hoy");
    expect(textoPlazo({ tipo: "por-vencer", dias: 2 })).toBe("Vence en 2 d");
    expect(textoPlazo({ tipo: "a-tiempo", dias: 20 })).toBeNull();
    expect(textoPlazo({ tipo: "sin-fecha" })).toBeNull();
    expect(esAlerta({ tipo: "vencido", dias: 1 })).toBe(true);
    expect(esAlerta({ tipo: "a-tiempo", dias: 20 })).toBe(false);
  });
});

function asignacion(extra: Partial<AsignacionTaller>): AsignacionTaller {
  return {
    id: "a1",
    pedido_id: "p1",
    numero_pedido: "1PM134-26",
    item_code: 1,
    modelo: "Silla",
    descripcion: "Silla de prueba",
    unidad: "PZA",
    equipo_id: "e1",
    equipo: "Equipo 1",
    proceso: "armado",
    cantidad: 10,
    entregado: 0,
    fecha_asignacion: "2026-10-01",
    estado: "en_proceso",
    ...extra,
  };
}

describe("resumirTaller", () => {
  const plazos = new Map<string, Plazo>([
    ["p1", { tipo: "vencido", dias: 3 }],
    ["p2", { tipo: "por-vencer", dias: 2 }],
    ["p3", { tipo: "a-tiempo", dias: 30 }],
  ]);

  it("ignora lo entregado y lo cancelado", () => {
    const r = resumirTaller(
      [
        asignacion({ id: "a1" }),
        asignacion({ id: "a2", estado: "entregada", entregado: 10 }),
        asignacion({ id: "a3", estado: "cancelada" }),
        asignacion({ id: "a4", estado: "parcial", entregado: 4 }),
      ],
      plazos,
      hoy
    );
    expect(r.total).toBe(2);
    expect(r.equipos[0].filas.map((f) => f.id).sort()).toEqual(["a1", "a4"]);
  });

  it("calcula lo pendiente y los días en taller", () => {
    const r = resumirTaller([asignacion({ estado: "parcial", entregado: 2.5 })], plazos, hoy);
    expect(r.equipos[0].filas[0].pendiente).toBe(7.5);
    expect(r.equipos[0].filas[0].diasEnTaller).toBe(6);
  });

  it("cuenta atrasadas y por vencer, por equipo y en total", () => {
    const r = resumirTaller(
      [
        asignacion({ id: "a1", pedido_id: "p1", equipo_id: "e1", equipo: "Equipo 1" }),
        asignacion({ id: "a2", pedido_id: "p2", equipo_id: "e1", equipo: "Equipo 1" }),
        asignacion({ id: "a3", pedido_id: "p3", equipo_id: "e2", equipo: "Equipo 2" }),
      ],
      plazos,
      hoy
    );
    expect(r.atrasadas.map((f) => f.id)).toEqual(["a1"]);
    expect(r.porVencer).toBe(1);
    const e1 = r.equipos.find((e) => e.equipoId === "e1")!;
    expect(e1.atrasadas).toBe(1);
    expect(e1.porVencer).toBe(1);
    expect(e1.pedidos).toBe(2);
    // El equipo con atraso va primero y, dentro, lo más atrasado.
    expect(r.equipos[0].equipoId).toBe("e1");
    expect(e1.filas[0].id).toBe("a1");
  });

  it("un PM sin plazo conocido (o sin pedido) no cuenta como atrasado", () => {
    const r = resumirTaller(
      [asignacion({ id: "a1", pedido_id: "desconocido" }), asignacion({ id: "a2", pedido_id: null })],
      plazos,
      hoy
    );
    expect(r.atrasadas).toHaveLength(0);
    expect(r.total).toBe(2);
  });

  it("ordena las atrasadas de la más atrasada a la menos", () => {
    const r = resumirTaller(
      [
        asignacion({ id: "a1", pedido_id: "p1" }),
        asignacion({ id: "a2", pedido_id: "p9" }),
      ],
      new Map<string, Plazo>([
        ["p1", { tipo: "vencido", dias: 3 }],
        ["p9", { tipo: "vencido", dias: 10 }],
      ]),
      hoy
    );
    expect(r.atrasadas.map((f) => f.id)).toEqual(["a2", "a1"]);
  });
});

describe("otConPendientes", () => {
  it("hay pendientes si falta liberar o hay asignaciones en taller", () => {
    expect(otConPendientes(3, 0)).toBe(true);
    expect(otConPendientes(0, 2)).toBe(true);
    expect(otConPendientes(0, 0)).toBe(false);
  });
});
