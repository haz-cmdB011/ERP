import { describe, expect, it } from "vitest";
import {
  categoriaDeMotivo,
  filtrarIncidencias,
  hrefIncidencias,
  incidenciaDesdeFilaExcel,
  leerFiltrosIncidencias,
  listaDeAreas,
  listaDeMuebles,
  normalizarEstado,
  normalizarTipo,
  resumirIncidencias,
  SIN_FILTROS,
  textoNormalizado,
  type Incidencia,
} from "./incidencias";

describe("limpieza de texto", () => {
  it("unifica acentos, mayúsculas y espacios", () => {
    expect(textoNormalizado("  Remodelación   PH  Monterrey ")).toBe("REMODELACION PH MONTERREY");
    expect(textoNormalizado(null)).toBe("");
  });

  it("separa áreas por coma sin repetir ni dejar vacíos", () => {
    expect(listaDeAreas("PROD-ARMADO-MAD, Ingeniería , PROYECTOS,")).toEqual(["PROD-ARMADO-MAD", "INGENIERIA", "PROYECTOS"]);
    expect(listaDeAreas("COMPRAS, compras")).toEqual(["COMPRAS"]);
    expect(listaDeAreas("-")).toEqual([]);
    expect(listaDeAreas(undefined)).toEqual([]);
  });

  it("separa muebles conservando como se escribieron", () => {
    expect(listaDeMuebles("PDI-1,  PDI-3")).toEqual(["PDI-1", "PDI-3"]);
    expect(listaDeMuebles("FORRO DE COLUMNA")).toEqual(["FORRO DE COLUMNA"]);
    expect(listaDeMuebles("")).toEqual([]);
  });

  it("reconoce el tipo sin importar acentos ni mayúsculas", () => {
    expect(normalizarTipo("Producto No Conforme ")).toBe("Producto No Conforme");
    expect(normalizarTipo("desviacion")).toBe("Desviación");
    expect(normalizarTipo("Otra cosa")).toBeNull();
  });

  it("sin estado cuenta como abierto", () => {
    expect(normalizarEstado("cerRADO")).toBe("cerrado");
    expect(normalizarEstado("ABIERTO")).toBe("abierto");
    expect(normalizarEstado(null)).toBe("abierto");
    expect(normalizarEstado("")).toBe("abierto");
  });
});

describe("categoriaDeMotivo", () => {
  it("clasifica los motivos más repetidos", () => {
    expect(categoriaDeMotivo("ELEMENTO O PARTE DAÑADA RAYADA O ROTA")).toBe("Daño");
    expect(categoriaDeMotivo("DIMENSIÓN ERRONEA EN PLANO DE INGENIERÍA")).toBe("Dimensión");
    expect(categoriaDeMotivo("ELEMENTO O PARTE EXTRAVIADA")).toBe("Extravío o faltante");
    expect(categoriaDeMotivo("ERROR EN LISTA DE INSUMOS")).toBe("Información o diseño");
    expect(categoriaDeMotivo("AUTORIZAR TRASPASO DE MOBILIARIO SIN LIBERACIÓN DE CALIDAD")).toBe("Proceso o liberación");
    expect(categoriaDeMotivo("SOLDADURA S/LIMPIEZA")).toBe("Acabado");
    expect(categoriaDeMotivo("ARMADO FUERA DE ESPECIFICACIÓN")).toBe("Fabricación o armado");
  });

  it("deja sin clasificar lo que no reconoce o viene vacío", () => {
    expect(categoriaDeMotivo("ABATIMIENTO EN PUERTA ERRONEO")).toBe("Sin clasificar");
    expect(categoriaDeMotivo("")).toBe("Sin clasificar");
    expect(categoriaDeMotivo(undefined)).toBe("Sin clasificar");
  });
});

describe("incidenciaDesdeFilaExcel", () => {
  const fila = {
    tipo: "Producto No Conforme",
    proyecto: "REMODELACION OFICINAS  PH MOLIERE ",
    mueble: "CARTELA N2, CARTELA N4",
    area: "PROD-ARMADO-MAD, INGENIERIA",
    motivo: "ARMADO DEFECTO",
    origen: "INGENIERIA, PROYECTOS",
    reporta: "BARNIZ",
    estado: "CERRADO",
  };

  it("funde área y origen, normaliza y arma la clave de importación", () => {
    const { incidencia, avisos } = incidenciaDesdeFilaExcel("madera", 5, fila);
    expect(avisos).toEqual([]);
    expect(incidencia).toMatchObject({
      linea: "madera",
      tipo: "Producto No Conforme",
      proyecto: "REMODELACION OFICINAS PH MOLIERE",
      muebles: ["CARTELA N2", "CARTELA N4"],
      areas: ["INGENIERIA", "PROYECTOS", "PROD-ARMADO-MAD"],
      categoria_motivo: "Fabricación o armado",
      areas_reporta: ["BARNIZ"],
      estado: "cerrado",
      origen_importacion: "madera:5",
    });
  });

  it("avisa de lo que falta y deja sin estado como abierto", () => {
    const { incidencia, avisos } = incidenciaDesdeFilaExcel("metal", 9, {
      ...fila,
      proyecto: "",
      mueble: "",
      reporta: "",
      estado: "",
    });
    expect(incidencia?.estado).toBe("abierto");
    expect(incidencia?.proyecto).toBeNull();
    expect(avisos).toEqual(
      expect.arrayContaining(["sin proyecto", "sin mueble", "sin área que reporta", "sin estado (se importa como abierto)"])
    );
  });

  it("no importa una fila con tipo desconocido", () => {
    const r = incidenciaDesdeFilaExcel("madera", 3, { ...fila, tipo: "Raro" });
    expect(r.incidencia).toBeNull();
    expect(r.avisos[0]).toContain("tipo desconocido");
  });
});

describe("resumen del dashboard", () => {
  const base: Omit<Incidencia, "id"> = {
    linea: "madera",
    tipo: "Producto No Conforme",
    proyecto: "PH MONTERREY",
    muebles: [],
    areas: ["INGENIERIA"],
    motivo: "DIMENSION ERRONEA",
    categoria_motivo: "Dimensión",
    areas_reporta: ["PROD-ARMADO-MAD"],
    estado: "abierto",
  };
  const filas: Incidencia[] = [
    { ...base, id: "1" },
    { ...base, id: "2", estado: "cerrado", areas: ["INGENIERIA", "PROYECTOS"] },
    { ...base, id: "3", linea: "metal", tipo: "Desviación", areas: ["COMPRAS"], proyecto: null, motivo: null, categoria_motivo: "Sin clasificar" },
  ];

  it("cuenta incidencias, no áreas, y reparte abiertas y cerradas", () => {
    const r = resumirIncidencias(filas);
    expect(r.total).toBe(3);
    expect(r.abiertas).toBe(2);
    expect(r.cerradas).toBe(1);
    expect(r.porLinea).toEqual({ madera: 2, metal: 1 });
    expect(r.porArea[0]).toEqual({ nombre: "INGENIERIA", total: 2, abiertas: 1 });
    expect(r.porArea.find((a) => a.nombre === "PROYECTOS")?.total).toBe(1);
    expect(r.porProyecto).toEqual([{ nombre: "PH MONTERREY", total: 2, abiertas: 1 }]);
    expect(r.porMotivo.map((m) => m.nombre)).toEqual(["DIMENSION ERRONEA"]);
  });

  it("arma el cruce de dónde nace contra quién lo detecta", () => {
    const { cruceAreaReporta } = resumirIncidencias(filas);
    expect(cruceAreaReporta[0]).toEqual({ area: "INGENIERIA", reporta: "PROD-ARMADO-MAD", total: 2 });
  });

  it("filtra por línea, tipo, estado, área y proyecto", () => {
    expect(filtrarIncidencias(filas, { ...SIN_FILTROS, linea: "metal" }).map((i) => i.id)).toEqual(["3"]);
    expect(filtrarIncidencias(filas, { ...SIN_FILTROS, area: "PROYECTOS" }).map((i) => i.id)).toEqual(["2"]);
    expect(filtrarIncidencias(filas, { ...SIN_FILTROS, estado: "abierto", proyecto: "PH MONTERREY" }).map((i) => i.id)).toEqual(["1"]);
    expect(filtrarIncidencias(filas, SIN_FILTROS)).toHaveLength(3);
  });

  it("resumen vacío no truena", () => {
    const r = resumirIncidencias([]);
    expect(r.total).toBe(0);
    expect(r.porArea).toEqual([]);
  });
});

describe("filtros en la URL", () => {
  it("ignora valores que no existen", () => {
    expect(leerFiltrosIncidencias({ linea: "otra", tipo: "x", estado: "cerrado", area: " INGENIERIA ", proyecto: "" })).toEqual({
      linea: null,
      tipo: null,
      estado: "cerrado",
      area: "INGENIERIA",
      proyecto: null,
    });
  });

  it("arma el enlace solo con los filtros puestos", () => {
    expect(hrefIncidencias("/calidad/incidencias", SIN_FILTROS)).toBe("/calidad/incidencias");
    expect(hrefIncidencias("/calidad/incidencias", { ...SIN_FILTROS, estado: "abierto", area: "COMPRAS" })).toBe(
      "/calidad/incidencias?estado=abierto&area=COMPRAS"
    );
  });
});
