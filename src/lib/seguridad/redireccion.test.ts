import { describe, expect, it } from "vitest";
import { rutaInternaSegura } from "./redireccion";

describe("rutaInternaSegura", () => {
  it("deja pasar rutas internas, con su consulta", () => {
    expect(rutaInternaSegura("/planeacion/cuenta")).toBe("/planeacion/cuenta");
    expect(rutaInternaSegura("/estimaciones/registro?estado=pendiente")).toBe(
      "/estimaciones/registro?estado=pendiente"
    );
  });

  it("usa el destino por defecto si no hay valor", () => {
    expect(rutaInternaSegura(null)).toBe("/planeacion");
    expect(rutaInternaSegura(undefined, "/inicio")).toBe("/inicio");
    expect(rutaInternaSegura("")).toBe("/planeacion");
  });

  it("rechaza todo lo que saldría del sitio", () => {
    const peligrosos = [
      "@sitio-malo.com",
      "//sitio-malo.com",
      "/\\sitio-malo.com",
      "https://sitio-malo.com",
      "http://sitio-malo.com/planeacion",
      "javascript:alert(1)",
      "planeacion",
      "///sitio-malo.com",
      "/%0d%0aSet-Cookie:x=1".replace("%0d%0a", "\r\n"),
      "/ruta\\con\\barras",
    ];
    for (const valor of peligrosos) {
      expect(rutaInternaSegura(valor), valor).toBe("/planeacion");
    }
  });
});
