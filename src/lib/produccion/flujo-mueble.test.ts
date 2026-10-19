import { describe, expect, it } from "vitest";
import type { AsignacionResumen, Proceso } from "./asignaciones";
import { avanceProceso, estadoMueble, siguientePaso, totalesProceso, type MuebleFlujo } from "./flujo-mueble";

const asig = (proceso: Proceso, cantidad: number, entregado: number, extra: Partial<AsignacionResumen> = {}) =>
  ({
    id: `${proceso}-${cantidad}-${entregado}`,
    proceso,
    cantidad,
    entregado,
    cancelada_en: null,
    informe_rechazo_id: null,
    estado: entregado >= cantidad ? "entregada" : entregado > 0 ? "parcial" : "en_proceso",
    ...extra,
  }) as AsignacionResumen;

const mueble = (asignaciones: AsignacionResumen[], aplica: Partial<Record<Proceso, boolean>> = {}): MuebleFlujo => ({
  id: "m",
  item_code: 1,
  modelo: "CAR-02",
  unidad: "PZA",
  cantidad: 10,
  aplica: { armado: true, barniz: true, electrificacion: false, superficie_solida: false, ...aplica },
  asignaciones,
});

describe("avanceProceso", () => {
  it("suma lo repartido entre equipos y marca terminado al entregar todo", () => {
    const m = mueble([asig("armado", 6, 6), asig("armado", 4, 4)]);
    expect(avanceProceso(m, "armado")).toEqual({ estado: "terminado", asignado: 10, entregado: 10 });
    expect(avanceProceso(m, "barniz").estado).toBe("sin_asignar");
    expect(avanceProceso(m, "electrificacion").estado).toBe("no_aplica");
  });
  it("un retrabajo abierto deja el proceso en proceso", () => {
    const m = mueble([asig("armado", 10, 10), asig("armado", 2, 0, { informe_rechazo_id: "inf" })]);
    expect(avanceProceso(m, "armado")).toEqual({ estado: "en_proceso", asignado: 10, entregado: 10 });
  });
});

describe("siguientePaso y estadoMueble", () => {
  it("sigue el orden de los procesos que aplican", () => {
    expect(siguientePaso(mueble([]))).toBe("Asignar a Armado");
    expect(estadoMueble(mueble([]))).toBe("por_asignar");
    const armado = mueble([asig("armado", 10, 10)]);
    expect(siguientePaso(armado)).toBe("Asignar a Barniz");
    expect(estadoMueble(armado)).toBe("por_asignar");
    const barniz = mueble([asig("armado", 10, 10), asig("barniz", 10, 3)]);
    expect(siguientePaso(barniz)).toBe("En Barniz");
    expect(estadoMueble(barniz)).toBe("en_proceso");
    const listo = mueble([asig("armado", 10, 10), asig("barniz", 10, 10)]);
    expect(siguientePaso(listo)).toBe("Terminado");
    expect(estadoMueble(listo)).toBe("terminado");
  });
});

describe("totalesProceso", () => {
  it("solo cuenta los muebles que llevan el proceso", () => {
    const muebles = [mueble([asig("electrificacion", 10, 5)], { electrificacion: true }), mueble([])];
    expect(totalesProceso(muebles, "electrificacion")).toEqual({ muebles: 1, piezas: 10, asignado: 10, entregado: 5 });
    expect(totalesProceso(muebles, "armado").piezas).toBe(20);
  });
});
