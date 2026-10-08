import { describe, expect, it } from "vitest";
import {
  esFotoYaSubida,
  esRechazoDefinitivo,
  esViolacionUnica,
  leerClaveEnvio,
  rutaFotoEntrega,
} from "./envio-entrega";

const UUID = "0b0e7a4e-6c1c-4d1e-9c5e-2f6a3b9d8e11";

describe("leerClaveEnvio", () => {
  it("usa la clave del celular si es un UUID (en minúsculas)", () => {
    expect(leerClaveEnvio(UUID.toUpperCase())).toBe(UUID);
    expect(leerClaveEnvio(` ${UUID} `)).toBe(UUID);
  });

  it("genera una nueva si falta o no es válida, así los clientes viejos siguen funcionando", () => {
    for (const malo of [null, "", "no-es-uuid", "../../etc/passwd", `${UUID}/x`, new File([], "x")]) {
      const clave = leerClaveEnvio(malo);
      expect(clave).toMatch(/^[0-9a-f-]{36}$/);
      expect(clave).not.toBe(UUID);
    }
    expect(leerClaveEnvio(null)).not.toBe(leerClaveEnvio(null));
  });
});

describe("rutaFotoEntrega", () => {
  it("cuelga de la carpeta de la asignación (la función SQL lo exige) y sale de la clave", () => {
    const ruta = rutaFotoEntrega("asig-1", UUID);
    expect(ruta).toBe(`asig-1/${UUID}.webp`);
    expect(ruta.startsWith("asig-1/")).toBe(true);
  });
});

describe("clasificación de errores", () => {
  it("reconoce que la foto ya estaba subida", () => {
    expect(esFotoYaSubida({ statusCode: "409", message: "x" })).toBe(true);
    expect(esFotoYaSubida({ statusCode: 409 })).toBe(true);
    expect(esFotoYaSubida({ message: "The resource already exists" })).toBe(true);
    expect(esFotoYaSubida({ statusCode: "500", message: "Internal error" })).toBe(false);
  });

  it("reconoce la violación del índice único", () => {
    expect(esViolacionUnica({ code: "23505" })).toBe(true);
    expect(esViolacionUnica({ code: "P0001" })).toBe(false);
    expect(esViolacionUnica({})).toBe(false);
  });

  it("separa lo definitivo (regla de la base, integridad, permisos) de lo pasajero", () => {
    for (const code of ["P0001", "22P02", "23514", "23505", "42501"]) expect(esRechazoDefinitivo({ code }), code).toBe(true);
    for (const code of ["08006", "57014", "53300", undefined, null]) expect(esRechazoDefinitivo({ code }), String(code)).toBe(false);
  });
});
