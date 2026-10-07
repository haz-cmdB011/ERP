import { describe, expect, it } from "vitest";
import { PRIORIDAD } from "./datos-acabados";
import {
  TARIFAS_ELECTRIFICACION_INICIALES as T,
  categoriaCharola,
  precedenteElectrificacion,
  resolverElectrificacion,
  type PrecedenteElectrificacion,
} from "./motor-electrificacion";

const base = { cantidad: 1, metrosLed: 0 as number | "", complejidadLed: "" as const, charolas: [] };

const pagado = (extra: Partial<PrecedenteElectrificacion>): PrecedenteElectrificacion => ({
  modelo: "ML-01",
  cantidad: 10,
  aceptado: 700,
  fecha: "2026-09-01",
  folio: "100",
  ot: "102-24",
  ...extra,
});

describe("categoriaCharola", () => {
  it("separa sencilla, intermedia y compleja por drivers", () => {
    expect(categoriaCharola(1)).toBe("sencilla");
    expect(categoriaCharola(3)).toBe("sencilla");
    expect(categoriaCharola(4)).toBe("intermedia");
    expect(categoriaCharola(6)).toBe("intermedia");
    expect(categoriaCharola(7)).toBe("compleja");
  });
});

describe("resolverElectrificacion — paramétrico", () => {
  it("suma metros de LED y charolas por su categoría", () => {
    const r = resolverElectrificacion(
      { ...base, metrosLed: 2, complejidadLed: "medio", charolas: [{ drivers: 3 }, { drivers: 8 }] },
      "normal",
      T
    );
    // 2 m × 40 + sencilla 150 + compleja 400
    expect(r.pu).toBe(630);
    expect(r.fuente).toBe("parametrico");
  });

  it("aplica el factor de prioridad del recibo", () => {
    const normal = resolverElectrificacion({ ...base, charolas: [{ drivers: 2 }] }, "normal", T);
    const urgente = resolverElectrificacion({ ...base, charolas: [{ drivers: 2 }] }, "urgente", T);
    expect(urgente.pu).toBeCloseTo(Math.round((normal.pu as number) * PRIORIDAD.urgente * 100) / 100, 2);
  });

  it("pide la complejidad si hay metros de LED", () => {
    const r = resolverElectrificacion({ ...base, metrosLed: 3 }, "normal", T);
    expect(r.pu).toBeNull();
    expect(r.fuente).toBe("manual");
  });

  it("sin LED ni charolas no hay sugerido", () => {
    const r = resolverElectrificacion({ ...base }, "normal", T);
    expect(r).toMatchObject({ pu: null, fuente: "manual" });
  });

  it("ignora charolas sin drivers", () => {
    const r = resolverElectrificacion({ ...base, charolas: [{ drivers: "" }, { drivers: 0 }] }, "normal", T);
    expect(r.pu).toBeNull();
  });
});

describe("resolverElectrificacion — precedente", () => {
  it("usa el último precio pagado del modelo, sin recalcular", () => {
    const pagados = [pagado({ aceptado: 500, fecha: "2026-08-01" }), pagado({ aceptado: 720, fecha: "2026-09-15" })];
    const r = resolverElectrificacion(
      { ...base, modelo: "ml-01", metrosLed: 2, complejidadLed: "medio" },
      "urgente",
      T,
      pagados
    );
    expect(r.pu).toBe(720);
    expect(r.fuente).toBe("precedente");
  });

  it("sin modelo o con otro modelo cae al paramétrico", () => {
    const pagados = [pagado({})];
    const entrada = { ...base, charolas: [{ drivers: 2 }] };
    expect(resolverElectrificacion(entrada, "normal", T, pagados).fuente).toBe("parametrico");
    expect(resolverElectrificacion({ ...entrada, modelo: "OTRO" }, "normal", T, pagados).fuente).toBe("parametrico");
  });

  it("no toma precedentes con precio aceptado en cero", () => {
    expect(precedenteElectrificacion("ML-01", null, [pagado({ aceptado: 0 })])).toBeNull();
  });

  it("respeta la variante del modelo", () => {
    const pagados = [
      pagado({ aceptado: 300, descripcionPm: "Mueble cama king" }),
      pagado({ aceptado: 900, descripcionPm: "Mueble maceta" }),
    ];
    expect(precedenteElectrificacion("ML-01", "mueble maceta", pagados)?.aceptado).toBe(900);
  });
});
