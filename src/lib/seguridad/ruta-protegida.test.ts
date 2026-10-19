import { describe, expect, it } from "vitest";
import { destinoDeLogin, esRutaProtegida } from "./ruta-protegida";
import { rutaInternaSegura } from "./redireccion";

describe("esRutaProtegida", () => {
  it("las pantallas de las áreas exigen sesión", () => {
    for (const ruta of [
      "/planeacion",
      "/produccion/pedidos/abc/viajero/def",
      "/calidad/pedidos/abc",
      "/estimaciones/registro",
      "/admin/usuarios",
      "/q/0b2ad28d-070c-4dd5-962b-55edc92275b7",
    ]) {
      expect(esRutaProtegida(ruta)).toBe(true);
    }
  });
  it("login, registro, auth, privacidad y la API no", () => {
    for (const ruta of ["/", "/login", "/registro", "/auth/callback", "/auth/restablecer", "/privacidad", "/api/produccion/entregas"]) {
      expect(esRutaProtegida(ruta)).toBe(false);
    }
  });
  it("no se confunde con rutas que solo empiezan igual", () => {
    expect(esRutaProtegida("/planeacionfalsa")).toBe(false);
    expect(esRutaProtegida("/quien")).toBe(false);
  });
});

describe("destinoDeLogin", () => {
  it("guarda la ruta y sus parámetros, y rutaInternaSegura los devuelve tal cual", () => {
    const destino = destinoDeLogin("/produccion/pedidos/a/viajero/b", "?ref=qr");
    expect(destino.startsWith("/login?next=")).toBe(true);
    const next = new URL(destino, "https://x.test").searchParams.get("next");
    expect(rutaInternaSegura(next)).toBe("/produccion/pedidos/a/viajero/b?ref=qr");
  });
});
