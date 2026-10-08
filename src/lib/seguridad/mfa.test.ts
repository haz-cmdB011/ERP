import { describe, expect, it } from "vitest";
import { codigoValido, exigeSegundoPaso, faltaSegundoPaso, normalizarCodigo } from "./mfa";

describe("faltaSegundoPaso", () => {
  it("solo bloquea cuando tiene el segundo paso activado y la sesión aún no lo pasó", () => {
    expect(faltaSegundoPaso({ currentLevel: "aal1", nextLevel: "aal2" })).toBe(true);
  });
  it("no bloquea si ya pasó el segundo paso", () => {
    expect(faltaSegundoPaso({ currentLevel: "aal2", nextLevel: "aal2" })).toBe(false);
  });
  it("no bloquea a quien no lo tiene activado", () => {
    expect(faltaSegundoPaso({ currentLevel: "aal1", nextLevel: "aal1" })).toBe(false);
  });
  it("ante falta de datos no bloquea (no dejar a nadie fuera por un error de lectura)", () => {
    expect(faltaSegundoPaso(null)).toBe(false);
    expect(faltaSegundoPaso(undefined)).toBe(false);
    expect(faltaSegundoPaso({ currentLevel: null, nextLevel: null })).toBe(false);
  });
});

describe("exigeSegundoPaso", () => {
  it("las pantallas y rutas de la app lo exigen", () => {
    for (const ruta of ["/", "/planeacion", "/produccion/pedidos/1", "/api/buscar", "/admin/usuarios", "/planeacion/cuenta"]) {
      expect(exigeSegundoPaso(ruta), ruta).toBe(true);
    }
  });
  it("login, registro y callback quedan libres para poder terminar de entrar", () => {
    for (const ruta of ["/login", "/registro", "/privacidad", "/auth/callback", "/api/registro", "/api/errores", "/api/salud", "/manifest.webmanifest"]) {
      expect(exigeSegundoPaso(ruta), ruta).toBe(false);
    }
  });
  it("no se deja engañar por prefijos parecidos", () => {
    expect(exigeSegundoPaso("/login-falso")).toBe(true);
    expect(exigeSegundoPaso("/authors")).toBe(true);
  });
});

describe("código de 6 dígitos", () => {
  it("acepta 6 dígitos aunque el teclado meta espacios", () => {
    expect(normalizarCodigo(" 123 456 ")).toBe("123456");
    expect(codigoValido("123 456")).toBe(true);
  });
  it("rechaza letras y largos distintos", () => {
    for (const malo of ["12345", "1234567", "abcdef", "12 34 5a", ""]) expect(codigoValido(malo), malo).toBe(false);
  });
});
