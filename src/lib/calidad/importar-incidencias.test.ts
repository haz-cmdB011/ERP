import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  claveDeFila,
  cambiosDeUnReporte,
  clasificarImportacion,
  hojaDeIncidencias,
  huellaDeIncidencia,
  leerIncidenciasDeLibro,
  COLUMNAS_HOJA,
  type ExistenteParaComparar,
} from "./importar-incidencias";
import type { NuevaIncidencia } from "./incidencias";

interface FilaPrueba {
  folio?: string;
  tipo?: string;
  fecha?: Date | string;
  proyecto?: string;
  mueble?: string;
  motivo?: string;
  estado?: string;
}

function libroCon(hojas: Record<string, FilaPrueba[]>): ExcelJS.Workbook {
  const libro = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = libro.addWorksheet(nombre);
    hoja.getRow(2).getCell(COLUMNAS_HOJA.folio).value = "FOLIO";
    filas.forEach((f, i) => {
      const fila = hoja.getRow(3 + i);
      fila.getCell(COLUMNAS_HOJA.folio).value = f.folio ?? `F-${i + 1}`;
      fila.getCell(COLUMNAS_HOJA.tipo).value = f.tipo ?? "Producto No Conforme";
      fila.getCell(COLUMNAS_HOJA.fecha).value = f.fecha ?? new Date(Date.UTC(2026, 10, 3));
      fila.getCell(COLUMNAS_HOJA.proyecto).value = f.proyecto ?? "SMART FIT";
      fila.getCell(COLUMNAS_HOJA.mueble).value = f.mueble ?? "M-RED";
      fila.getCell(COLUMNAS_HOJA.motivo).value = f.motivo ?? "Medida incorrecta";
      fila.getCell(COLUMNAS_HOJA.estado).value = f.estado ?? "ABIERTO";
    });
  }
  return libro;
}

describe("hojaDeIncidencias", () => {
  it("reconoce hojas de madera y de metal de cualquier año", () => {
    expect(hojaDeIncidencias("MADERA 26")).toEqual({ linea: "madera", anio: "26" });
    expect(hojaDeIncidencias("Metal 2027")).toEqual({ linea: "metal", anio: "27" });
    expect(hojaDeIncidencias("  madera  ")).toEqual({ linea: "madera", anio: null });
  });
  it("ignora las demás hojas", () => {
    expect(hojaDeIncidencias("RESUMEN")).toBeNull();
    expect(hojaDeIncidencias("MADERERA 26")).toBeNull();
  });
});

describe("claveDeFila", () => {
  it("conserva la clave de siempre para 2026 y distingue otros años", () => {
    expect(claveDeFila("madera", "26", 427)).toBe("madera:427");
    expect(claveDeFila("metal", null, 5)).toBe("metal:5");
    expect(claveDeFila("madera", "27", 12)).toBe("madera-27:12");
  });
});

describe("leerIncidenciasDeLibro", () => {
  it("lee las hojas de madera y metal con su clave y salta filas sin folio", () => {
    const libro = libroCon({ "MADERA 26": [{}, {}], "METAL 26": [{ tipo: "Desviación" }], NOTAS: [{}] });
    const sinFolio = libro.getWorksheet("MADERA 26")!.getRow(8);
    sinFolio.getCell(COLUMNAS_HOJA.tipo).value = "Incidencia"; // fila sin folio: es una fila vacía
    const l = leerIncidenciasDeLibro(libro);
    expect(l.hojas.map((h) => [h.nombre, h.filas])).toEqual([["MADERA 26", 2], ["METAL 26", 1]]);
    expect(l.hojasIgnoradas).toEqual(["NOTAS"]);
    expect(l.incidencias.map((i) => i.origen_importacion)).toEqual(["madera:3", "madera:4", "metal:3"]);
    expect(l.incidencias[0]).toMatchObject({ linea: "madera", fecha: "2026-11-03", estado: "abierto", proyecto: "SMART FIT" });
  });

  it("omite con motivo una fila con tipo desconocido y otra que pasa los topes de la base", () => {
    const l = leerIncidenciasDeLibro(libroCon({ "MADERA 26": [{ tipo: "Cualquier cosa" }, { motivo: "x".repeat(301) }, {}] }));
    expect(l.incidencias).toHaveLength(1);
    expect(l.omitidas.map((o) => o.donde)).toEqual(["MADERA 26, fila 3", "MADERA 26, fila 4"]);
    expect(l.omitidas[0].motivo).toContain("tipo desconocido");
    expect(l.omitidas[1].motivo).toContain("motivo pasa de 300");
  });

  it("una hoja de otro año lleva el año en la clave", () => {
    const l = leerIncidenciasDeLibro(libroCon({ "MADERA 27": [{}] }));
    expect(l.incidencias[0].origen_importacion).toBe("madera-27:3");
  });

  it("dos hojas de la misma línea y año no chocan: la segunda se omite", () => {
    const l = leerIncidenciasDeLibro(libroCon({ "MADERA 26": [{}], MADERA: [{}] }));
    expect(l.incidencias).toHaveLength(1);
    expect(l.omitidas).toHaveLength(1);
  });

  it("un libro sin hojas de madera ni metal no lee nada", () => {
    const l = leerIncidenciasDeLibro(libroCon({ RESUMEN: [{}] }));
    expect(l.hojas).toEqual([]);
    expect(l.incidencias).toEqual([]);
  });
});

function incidencia(clave: string, extra: Partial<NuevaIncidencia> = {}): NuevaIncidencia {
  return {
    linea: "madera",
    tipo: "Producto No Conforme",
    proyecto: "SMART FIT",
    muebles: ["M-RED"],
    areas: [],
    motivo: "MEDIDA INCORRECTA",
    categoria_motivo: "Dimensión",
    areas_reporta: [],
    estado: "abierto",
    fecha: "2026-11-03",
    auditor: null,
    origen_importacion: clave,
    ...extra,
  };
}

function existente(clave: string | null, extra: Partial<ExistenteParaComparar> = {}): ExistenteParaComparar {
  return {
    id: `id-${clave}`,
    origen_importacion: clave,
    linea: "madera",
    tipo: "Producto No Conforme",
    fecha: "2026-11-03",
    proyecto: "SMART FIT",
    muebles: ["M-RED"],
    motivo: "MEDIDA INCORRECTA",
    categoria_motivo: "Dimensión",
    areas: [],
    areas_reporta: [],
    estado: "abierto",
    auditor: null,
    descripcion: null,
    solucion: null,
    seguimiento: null,
    ...extra,
  };
}

describe("clasificarImportacion", () => {
  it("agrega solo lo nuevo y deja lo que ya estaba por su clave", () => {
    const r = clasificarImportacion(
      [incidencia("madera:3"), incidencia("madera:4", { fecha: "2026-11-04" })],
      [existente("madera:3")]
    );
    expect(r.sinCambios).toBe(1);
    expect(r.nuevas.map((n) => n.origen_importacion)).toEqual(["madera:4"]);
  });

  it("un reporte que cambió de número de fila (Excel ordenado) no se carga dos veces", () => {
    const r = clasificarImportacion([incidencia("madera:9")], [existente("madera:3")]);
    expect(r.repetidasPorContenido).toBe(1);
    expect(r.nuevas).toEqual([]);
  });

  it("uno capturado a mano en la app tampoco se repite si llega del Excel", () => {
    const r = clasificarImportacion([incidencia("madera:9")], [existente(null)]);
    expect(r.repetidasPorContenido).toBe(1);
    expect(r.nuevas).toEqual([]);
  });

  it("dos reportes iguales de verdad se cargan los dos la primera vez", () => {
    const r = clasificarImportacion([incidencia("madera:3"), incidencia("madera:4")], []);
    expect(r.nuevas).toHaveLength(2);
  });

  it("y al repetir la importación no se duplican ninguno de los dos", () => {
    const r = clasificarImportacion(
      [incidencia("madera:3"), incidencia("madera:4")],
      [existente("madera:3"), existente("madera:4")]
    );
    expect(r).toMatchObject({ sinCambios: 2, repetidasPorContenido: 0, aActualizar: [] });
    expect(r.nuevas).toEqual([]);
  });

  it("un reporte distinto (otro día o proyecto) sí es nuevo", () => {
    const r = clasificarImportacion([incidencia("madera:9", { proyecto: "OTRO" })], [existente("madera:3")]);
    expect(r.nuevas).toHaveLength(1);
  });
});

describe("actualizar reportes ya cargados", () => {
  it("el Excel cierra un reporte que estaba abierto", () => {
    const r = clasificarImportacion([incidencia("madera:3", { estado: "cerrado" })], [existente("madera:3")]);
    expect(r.sinCambios).toBe(0);
    expect(r.aActualizar).toHaveLength(1);
    expect(r.aActualizar[0]).toMatchObject({ id: "id-madera:3", campos: ["estado"], cambios: { estado: "cerrado" } });
  });

  it("un reporte cerrado en la app NO se reabre aunque el Excel lo tenga abierto", () => {
    const r = clasificarImportacion([incidencia("madera:3", { estado: "abierto" })], [existente("madera:3", { estado: "cerrado" })]);
    expect(r.aActualizar).toEqual([]);
    expect(r.cerradasEnLaApp).toBe(1);
    expect(r.sinCambios).toBe(1);
  });

  it("corrige el motivo y su categoría, y solo lo que cambió", () => {
    const { campos, cambios } = cambiosDeUnReporte(
      incidencia("madera:3", { motivo: "DAÑO EN CANTO", categoria_motivo: "Daño" }),
      existente("madera:3")
    );
    expect(campos).toEqual(["motivo"]);
    expect(cambios).toEqual({ motivo: "DAÑO EN CANTO", categoria_motivo: "Daño" });
  });

  it("una celda vacía del Excel no borra lo que ya hay (textos, auditor, áreas)", () => {
    const { campos } = cambiosDeUnReporte(
      incidencia("madera:3", { auditor: null, areas: [], descripcion: null }),
      existente("madera:3", { auditor: "Luis Corona", areas: ["INGENIERIA"], descripcion: "Escrito en la app" })
    );
    expect(campos).toEqual([]);
  });

  it("un texto nuevo del Excel sí se escribe", () => {
    const { campos, cambios } = cambiosDeUnReporte(
      incidencia("madera:3", { seguimiento: "Se repuso la pieza" }),
      existente("madera:3", { seguimiento: null })
    );
    expect(campos).toEqual(["seguimiento"]);
    expect(cambios).toEqual({ seguimiento: "Se repuso la pieza" });
  });

  it("repetir la importación sin cambios no actualiza nada", () => {
    const igual = incidencia("madera:3", { estado: "cerrado", auditor: "Luis Corona", muebles: ["A", "B"] });
    const r = clasificarImportacion([igual], [existente("madera:3", { estado: "cerrado", auditor: "Luis Corona", muebles: ["A", "B"] })]);
    expect(r.aActualizar).toEqual([]);
    expect(r.sinCambios).toBe(1);
  });
});

describe("huellaDeIncidencia", () => {
  it("ignora acentos, mayúsculas y el orden de los muebles", () => {
    const a = huellaDeIncidencia(existente(null, { proyecto: "Remodelación", muebles: ["B", "A"], motivo: "daño" }));
    const b = huellaDeIncidencia(existente(null, { proyecto: "REMODELACION", muebles: ["a", "b"], motivo: "DAÑO " }));
    expect(a).toBe(b);
  });
});
