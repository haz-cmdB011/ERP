import { describe, expect, it } from "vitest";
import {
  areaDeRuta,
  areasDePerfil,
  avisoSinAcceso,
  inicioDePerfil,
  puedeAbrirRuta,
  puedeEntrarAArea,
  type AreaApp,
} from "./acceso";

const AREAS: AreaApp[] = ["planeacion", "produccion", "calidad", "estimaciones"];

describe("puedeEntrarAArea", () => {
  it("el desarrollador entra a todas las áreas y a Administración", () => {
    for (const area of [...AREAS, "admin" as const]) {
      expect(puedeEntrarAArea({ rol: "desarrollador", area: null }, area)).toBe(true);
    }
  });

  it("el administrador y el trabajador solo entran a su área", () => {
    for (const rol of ["administrador", "trabajador"]) {
      for (const suya of AREAS) {
        for (const area of [...AREAS, "admin" as const]) {
          expect(puedeEntrarAArea({ rol, area: suya }, area), `${rol} de ${suya} → ${area}`).toBe(area === suya);
        }
      }
    }
  });

  it("el maquilador solo entra a Estimaciones", () => {
    expect(puedeEntrarAArea({ rol: "maquilador", area: "estimaciones" }, "estimaciones")).toBe(true);
    for (const area of ["planeacion", "produccion", "calidad", "admin"] as AreaApp[]) {
      expect(puedeEntrarAArea({ rol: "maquilador", area: "estimaciones" }, area)).toBe(false);
    }
  });

  it("sin área (usuario recién registrado, área sin pantallas o sin perfil) no entra a ninguna", () => {
    const sinArea = [
      { rol: "usuario", area: null },
      { rol: "administrador", area: null },
      { rol: "trabajador", area: "finanzas" },
      null,
      undefined,
    ];
    for (const perfil of sinArea) {
      expect(areasDePerfil(perfil)).toEqual([]);
    }
  });
});

describe("inicioDePerfil", () => {
  it("cada quien empieza en su área", () => {
    expect(inicioDePerfil({ rol: "maquilador", area: "estimaciones" })).toBe("/estimaciones/recibos");
    expect(inicioDePerfil({ rol: "desarrollador", area: null })).toBe("/planeacion");
    expect(inicioDePerfil({ rol: "administrador", area: "calidad" })).toBe("/calidad");
    expect(inicioDePerfil({ rol: "trabajador", area: "produccion" })).toBe("/produccion");
    expect(inicioDePerfil({ rol: "administrador", area: "estimaciones" })).toBe("/estimaciones");
  });
  it("quien no tiene área va a su perfil", () => {
    expect(inicioDePerfil({ rol: "usuario", area: null })).toBe("/cuenta");
    expect(inicioDePerfil({ rol: "trabajador", area: "finanzas" })).toBe("/cuenta");
  });
});

describe("puedeAbrirRuta", () => {
  const calidad = { rol: "administrador", area: "calidad" };
  it("reconoce el área de cada ruta", () => {
    expect(areaDeRuta("/calidad/folios?q=1")).toBe("calidad");
    expect(areaDeRuta("/planeacion")).toBe("planeacion");
    expect(areaDeRuta("/admin/usuarios")).toBe("admin");
    expect(areaDeRuta("/cuenta")).toBeNull();
    expect(areaDeRuta("/q/abc")).toBeNull();
    expect(areaDeRuta("/planeacionx")).toBeNull();
  });
  it("deja abrir lo de su área y lo que no es de ninguna", () => {
    expect(puedeAbrirRuta(calidad, "/calidad/folios")).toBe(true);
    expect(puedeAbrirRuta(calidad, "/cuenta")).toBe(true);
    expect(puedeAbrirRuta(calidad, "/produccion/pedidos/1")).toBe(false);
    expect(puedeAbrirRuta(calidad, "/estimaciones/recibos")).toBe(false);
  });
});

describe("avisoSinAcceso", () => {
  it("dice a qué áreas tiene acceso y ofrece ir a la suya", () => {
    const aviso = avisoSinAcceso({ rol: "trabajador", area: "calidad" }, "produccion");
    expect(aviso.titulo).toBe("Esta pantalla es de Producción");
    expect(aviso.mensaje).toBe("Tu cuenta solo tiene acceso a Calidad.");
    expect(aviso.hrefInicio).toBe("/calidad");
    expect(aviso.etiquetaInicio).toBe("Ir a Calidad");
  });
  it("al maquilador lo manda a sus recibos y a quien no tiene área, a su perfil", () => {
    expect(avisoSinAcceso({ rol: "maquilador", area: "estimaciones" }, "calidad").hrefInicio).toBe(
      "/estimaciones/recibos"
    );
    expect(avisoSinAcceso({ rol: "usuario", area: null }, "planeacion").hrefInicio).toBe("/cuenta");
  });
});
