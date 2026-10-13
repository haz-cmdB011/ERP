import { describe, expect, it } from "vitest";
import { inicioDeRol, puedeEntrarAArea, type AreaApp } from "./acceso";

const AREAS: AreaApp[] = ["planeacion", "produccion", "calidad", "estimaciones"];

describe("puedeEntrarAArea", () => {
  it("el personal interno entra a todas las áreas, sea cual sea la suya", () => {
    for (const rol of ["desarrollador", "administrador", "trabajador", "usuario"]) {
      for (const area of AREAS) expect(puedeEntrarAArea(rol, area)).toBe(true);
    }
  });
  it("el maquilador solo entra a Estimaciones", () => {
    expect(puedeEntrarAArea("maquilador", "estimaciones")).toBe(true);
    for (const area of ["planeacion", "produccion", "calidad", "admin"] as AreaApp[]) {
      expect(puedeEntrarAArea("maquilador", area)).toBe(false);
    }
  });
  it("Administración es solo del desarrollador", () => {
    expect(puedeEntrarAArea("desarrollador", "admin")).toBe(true);
    for (const rol of ["administrador", "trabajador", "usuario", null, undefined]) {
      expect(puedeEntrarAArea(rol, "admin")).toBe(false);
    }
  });
});

describe("inicioDeRol", () => {
  it("el maquilador empieza en sus recibos; los demás, en Planeación", () => {
    expect(inicioDeRol("maquilador")).toBe("/estimaciones/recibos");
    for (const rol of ["desarrollador", "administrador", "trabajador", "usuario", null, undefined]) {
      expect(inicioDeRol(rol)).toBe("/planeacion");
    }
  });
});
