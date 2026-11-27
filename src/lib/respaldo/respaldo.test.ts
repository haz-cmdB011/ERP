import { describe, expect, it } from "vitest";
import { nombreCarpetaRespaldo, tablasDeEspecificacion, tablasIncompletas } from "./respaldo";

describe("tablasDeEspecificacion", () => {
  const especificacion = {
    paths: {
      "/": { get: {} },
      "/pedidos": { get: {}, post: {}, patch: {}, delete: {} },
      "/avisos_leidos": { get: {}, post: {} },
      "/lotes_calidad": { get: {} }, // vista: solo lectura
      "/rpc/is_admin": { post: {} },
      "/sin_llave": { get: {}, post: {} },
    },
    definitions: {
      pedidos: {
        properties: {
          id: { description: "Note:\nThis is a Primary Key.<pk/>" },
          numero_pedido: { description: "" },
        },
      },
      avisos_leidos: {
        properties: {
          aviso_id: { description: "Note:\nThis is a Primary Key.<pk/>\nThis is a Foreign Key to `avisos.id`.<fk table='avisos' column='id'/>" },
          user_id: { description: "Note:\nThis is a Primary Key.<pk/>" },
          leido_en: {},
        },
      },
      sin_llave: { properties: { a: {} } },
    },
  };

  it("solo toma tablas (no vistas ni funciones), por nombre", () => {
    expect(tablasDeEspecificacion(especificacion).map((t) => t.tabla)).toEqual([
      "avisos_leidos",
      "pedidos",
      "sin_llave",
    ]);
  });

  it("ordena por la llave primaria, también si es de varias columnas", () => {
    const porTabla = Object.fromEntries(tablasDeEspecificacion(especificacion).map((t) => [t.tabla, t.orden]));
    expect(porTabla.pedidos).toEqual(["id"]);
    expect(porTabla.avisos_leidos).toEqual(["aviso_id", "user_id"]);
    expect(porTabla.sin_llave).toEqual([]);
  });

  it("no falla con una especificación vacía", () => {
    expect(tablasDeEspecificacion({})).toEqual([]);
  });
});

describe("nombreCarpetaRespaldo", () => {
  it("usa la hora de México y se ordena por nombre", () => {
    // 27 nov 2026 15:30 UTC = 09:30 en Ciudad de México.
    expect(nombreCarpetaRespaldo(new Date("2026-11-27T15:30:00Z"))).toBe("2026-11-27_0930");
    expect(nombreCarpetaRespaldo(new Date("2026-01-02T05:05:00Z"))).toBe("2026-01-01_2305");
  });
});

describe("tablasIncompletas", () => {
  it("marca errores y conteos que no cuadran", () => {
    expect(
      tablasIncompletas([
        { tabla: "a", filas: 10, esperadas: 10 },
        { tabla: "b", filas: 9, esperadas: 10 },
        { tabla: "c", filas: 0, esperadas: null, error: "sin permiso" },
        { tabla: "d", filas: 3, esperadas: null },
      ]).map((r) => r.tabla)
    ).toEqual(["b", "c"]);
  });
});
