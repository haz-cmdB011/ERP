import { describe, expect, it } from "vitest";
import { armarCarga, MAX_CUERPO, MAX_TITULO } from "./carga";

const leer = (n: Parameters<typeof armarCarga>[0]) => JSON.parse(armarCarga(n)) as Record<string, unknown>;

describe("armarCarga", () => {
  it("lleva título, texto, pantalla y etiqueta", () => {
    expect(leer({ titulo: "Se liberó un mueble", cuerpo: "O.T. 009-26", url: "/produccion/panel?ids=1", etiqueta: "liberado" })).toEqual({
      titulo: "Se liberó un mueble",
      cuerpo: "O.T. 009-26",
      url: "/produccion/panel?ids=1",
      etiqueta: "liberado",
    });
  });

  it("recorta lo largo y pone un título por omisión si llega vacío", () => {
    const c = leer({ titulo: "t".repeat(500), cuerpo: "c".repeat(900) });
    expect((c.titulo as string).length).toBe(MAX_TITULO);
    expect((c.cuerpo as string).length).toBe(MAX_CUERPO);
    expect(leer({ titulo: "   ", cuerpo: "x" }).titulo).toBe("ERP Mobiliarium");
  });

  it("solo deja enlaces dentro del ERP: cualquier otro lleva al inicio", () => {
    expect(leer({ titulo: "a", cuerpo: "b" }).url).toBe("/");
    for (const mala of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/\\evil.com", "calidad"]) {
      expect(leer({ titulo: "a", cuerpo: "b", url: mala }).url, mala).toBe("/");
    }
  });
});
