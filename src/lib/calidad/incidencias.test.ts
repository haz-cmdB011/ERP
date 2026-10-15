import { describe, expect, it } from "vitest";
import {
  categoriaDeMotivo,
  desglosarPeriodo,
  fechaDesdeExcel,
  filasDelPeriodo,
  filtrarIncidencias,
  hrefIncidencias,
  incidenciaDesdeFilaExcel,
  leerFiltrosIncidencias,
  leerRef,
  leerVista,
  listaDeAreas,
  listaDeMuebles,
  normalizarEstado,
  nombreDePersona,
  normalizarTipo,
  periodoDe,
  refPorDefecto,
  resumirIncidencias,
  resumirPorAuditor,
  resumirPorSemana,
  semanaDe,
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
    fecha: new Date("2026-01-06T00:00:00.000Z"),
    auditor: "luis  CORONA",
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
      fecha: "2026-01-06",
      auditor: "Luis Corona",
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
      fecha: "24-06-0206",
      auditor: "",
    });
    expect(incidencia?.estado).toBe("abierto");
    expect(incidencia?.proyecto).toBeNull();
    expect(incidencia?.fecha).toBeNull();
    expect(avisos).toEqual(
      expect.arrayContaining([
        "sin proyecto",
        "sin mueble",
        "sin área que reporta",
        "sin estado (se importa como abierto)",
        "fecha vacía o no entendida (\"24-06-0206\")",
        "sin auditor",
      ])
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
    fecha: "2026-01-05",
    auditor: "Luis Corona",
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

describe("fechas y semanas", () => {
  it("lee fechas de celda y de texto, y no adivina años mal escritos", () => {
    expect(fechaDesdeExcel(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
    expect(fechaDesdeExcel("24/06/2026")).toBe("2026-06-24");
    expect(fechaDesdeExcel("2026-06-24")).toBe("2026-06-24");
    expect(fechaDesdeExcel("24-06-0206")).toBeNull();
    expect(fechaDesdeExcel("31/02/2026")).toBeNull();
    expect(fechaDesdeExcel(null)).toBeNull();
    expect(fechaDesdeExcel("")).toBeNull();
  });

  it("numera las semanas como la hoja ESTATUS (ISO, de lunes a domingo)", () => {
    expect(semanaDe("2026-01-05")).toMatchObject({ clave: "2026-W02", inicio: "2026-01-05", fin: "2026-01-11" });
    expect(semanaDe("2026-01-01")).toMatchObject({ clave: "2026-W01", inicio: "2025-12-29" });
    expect(semanaDe("2026-01-11")?.clave).toBe("2026-W02");
    expect(semanaDe("2026-01-12")?.clave).toBe("2026-W03");
    expect(semanaDe("2026-12-31")?.clave).toBe("2026-W53");
    expect(semanaDe("mal")).toBeNull();
  });

  const f = (id: string, fecha: string | null, estado: "abierto" | "cerrado" = "abierto"): Incidencia => ({
    id,
    linea: "madera",
    tipo: "Incidencia",
    proyecto: null,
    muebles: [],
    areas: [],
    motivo: null,
    categoria_motivo: "Sin clasificar",
    areas_reporta: [],
    estado,
    fecha,
    auditor: null,
  });

  it("cuenta por semana, rellena las vacías y aparte las sin fecha", () => {
    const r = resumirPorSemana([f("1", "2026-01-05"), f("2", "2026-01-07", "cerrado"), f("3", "2026-01-20"), f("4", null)]);
    expect(r.sinFecha).toBe(1);
    expect(r.semanas.map((s) => [s.clave, s.total, s.abiertas])).toEqual([
      ["2026-W02", 2, 1],
      ["2026-W03", 0, 0],
      ["2026-W04", 1, 1],
    ]);
    expect(resumirPorSemana([])).toEqual({ semanas: [], sinFecha: 0 });
  });

  it("filtra por auditor, incluido sin auditor", () => {
    const filas = [{ ...f("1", "2026-01-05"), auditor: "Ana" }, f("2", "2026-01-13")];
    expect(filtrarIncidencias(filas, { ...SIN_FILTROS, auditor: "Ana" }).map((i) => i.id)).toEqual(["1"]);
    expect(filtrarIncidencias(filas, { ...SIN_FILTROS, auditor: "Sin auditor" }).map((i) => i.id)).toEqual(["2"]);
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
      auditor: null,
    });
  });

  it("arma el enlace solo con los filtros puestos", () => {
    expect(hrefIncidencias("/calidad/incidencias", SIN_FILTROS)).toBe("/calidad/incidencias");
    expect(hrefIncidencias("/calidad/incidencias", { ...SIN_FILTROS, estado: "abierto", area: "COMPRAS" })).toBe(
      "/calidad/incidencias?estado=abierto&area=COMPRAS"
    );
  });
});

describe("periodos", () => {
  const inc = (id: string, fecha: string | null, estado: "abierto" | "cerrado", auditor: string | null): Incidencia => ({
    id,
    linea: "madera",
    tipo: "Incidencia",
    proyecto: null,
    muebles: [],
    areas: [],
    motivo: null,
    categoria_motivo: "Sin clasificar",
    areas_reporta: [],
    estado,
    fecha,
    auditor,
  });
  const filas = [
    inc("1", "2026-01-05", "cerrado", "Luis Corona"),
    inc("2", "2026-01-07", "abierto", "Luis Corona"),
    inc("3", "2026-01-07", "cerrado", "Jovani Camorlinga"),
    inc("4", "2026-01-20", "abierto", null),
    inc("5", "2026-02-02", "cerrado", "Jovani Camorlinga"),
    inc("6", null, "abierto", "Luis Corona"),
  ];

  it("calcula el periodo que contiene un día", () => {
    expect(periodoDe("dia", "2026-01-07")).toMatchObject({ inicio: "2026-01-07", fin: "2026-01-07", anterior: "2026-01-06", siguiente: "2026-01-08" });
    expect(periodoDe("semana", "2026-01-07")).toMatchObject({ inicio: "2026-01-05", fin: "2026-01-11", anterior: "2025-12-29", siguiente: "2026-01-12" });
    expect(periodoDe("mes", "2026-02-10")).toMatchObject({ inicio: "2026-02-01", fin: "2026-02-28", anterior: "2026-01-01", siguiente: "2026-03-01" });
    expect(periodoDe("mes", "2026-12-31")).toMatchObject({ fin: "2026-12-31", siguiente: "2027-01-01" });
    expect(periodoDe("anio", "2026-06-15")).toMatchObject({ inicio: "2026-01-01", fin: "2026-12-31", anterior: "2025-01-01", siguiente: "2027-01-01" });
  });

  it("deja en el periodo solo lo que tiene fecha dentro", () => {
    expect(filasDelPeriodo(filas, periodoDe("semana", "2026-01-06")).map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(filasDelPeriodo(filas, periodoDe("mes", "2026-01-01")).map((i) => i.id)).toEqual(["1", "2", "3", "4"]);
    expect(filasDelPeriodo(filas, periodoDe("anio", "2026-03-01")).map((i) => i.id)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("reparte una semana en días, un mes en semanas y un año en meses", () => {
    const dias = desglosarPeriodo(filas, periodoDe("semana", "2026-01-05"));
    expect(dias).toHaveLength(7);
    expect(dias.map((d) => [d.inicio, d.total, d.abiertas])).toEqual([
      ["2026-01-05", 1, 0],
      ["2026-01-06", 0, 0],
      ["2026-01-07", 2, 1],
      ["2026-01-08", 0, 0],
      ["2026-01-09", 0, 0],
      ["2026-01-10", 0, 0],
      ["2026-01-11", 0, 0],
    ]);
    expect(dias[0].vista).toBe("dia");

    const semanas = desglosarPeriodo(filas, periodoDe("mes", "2026-01-15"));
    expect(semanas[0]).toMatchObject({ vista: "semana", inicio: "2026-01-01", fin: "2026-01-04", total: 0 });
    expect(semanas.reduce((n, s) => n + s.total, 0)).toBe(4);
    expect(semanas.at(-1)?.fin).toBe("2026-01-31");

    const meses = desglosarPeriodo(filas, periodoDe("anio", "2026-01-01"));
    expect(meses).toHaveLength(12);
    expect(meses.slice(0, 2).map((m) => m.total)).toEqual([4, 1]);
    expect(meses[0].vista).toBe("mes");
    expect(desglosarPeriodo(filas, periodoDe("dia", "2026-01-07"))).toEqual([]);
  });

  it("resume por auditor con su parte del total, abiertas y cerradas", () => {
    const r = resumirPorAuditor(filasDelPeriodo(filas, periodoDe("mes", "2026-01-01")));
    expect(r.map((a) => [a.nombre, a.total, a.abiertas, a.cerradas])).toEqual([
      ["Luis Corona", 2, 1, 1],
      ["Jovani Camorlinga", 1, 0, 1],
      ["Sin auditor", 1, 1, 0],
    ]);
    expect(r[0].parte).toBe(0.5);
    expect(resumirPorAuditor([])).toEqual([]);
  });

  it("abre en hoy si hay datos ahí y, si no, en la última incidencia", () => {
    expect(refPorDefecto(filas, "2026-01-08", "semana")).toBe("2026-01-08");
    expect(refPorDefecto(filas, "2026-10-15", "semana")).toBe("2026-02-02");
    expect(refPorDefecto([], "2026-10-15", "semana")).toBe("2026-10-15");
  });

  it("arregla los nombres de persona y lee la vista y el día de la URL", () => {
    expect(nombreDePersona("  jovani  CAMORLINGA ")).toBe("Jovani Camorlinga");
    expect(nombreDePersona("")).toBeNull();
    expect(nombreDePersona(null)).toBeNull();
    expect(leerVista("mes")).toBe("mes");
    expect(leerVista("otra")).toBe("semana");
    expect(leerRef("2026-02-30")).toBeNull();
    expect(leerRef("2026-02-10")).toBe("2026-02-10");
    expect(hrefIncidencias("/x", SIN_FILTROS, { vista: "mes", ref: "2026-02-01" })).toBe("/x?vista=mes&ref=2026-02-01");
  });
});
