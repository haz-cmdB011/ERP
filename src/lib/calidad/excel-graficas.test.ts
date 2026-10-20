import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { agregarGraficas, letraColumna, refRango, type GraficaExcel } from "./excel-graficas";
import { generarExcelIncidencias } from "./incidencias-excel";
import { periodoDe, type Incidencia } from "./incidencias";

describe("referencias de celdas", () => {
  it("convierte números de columna en letras", () => {
    expect(letraColumna(1)).toBe("A");
    expect(letraColumna(26)).toBe("Z");
    expect(letraColumna(27)).toBe("AA");
    expect(letraColumna(702)).toBe("ZZ");
  });

  it("arma el rango con el nombre de la hoja entre comillas", () => {
    expect(refRango("Por tipo", 1, 2, 5)).toBe("'Por tipo'!$A$2:$A$5");
    expect(refRango("Por tipo", 4, 1, 1)).toBe("'Por tipo'!$D$1");
    expect(refRango("Área d'prueba", 2, 2, 3)).toBe("'Área d''prueba'!$B$2:$B$3");
  });
});

async function libroBase(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Por tipo");
  hoja.addRow(["Tipo", "Reportes", "Abiertos", "Cerrados"]);
  hoja.addRow(["A & B", 5, 2, 3]);
  hoja.addRow(["C", 1, 1, 0]);
  libro.addWorksheet("Otra").addRow(["x"]);
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const grafica = (cambios: Partial<GraficaExcel> = {}): GraficaExcel => ({
  hoja: "Por tipo",
  titulo: "Reportes <por> tipo",
  tipo: "barras",
  apilado: true,
  refCategorias: refRango("Por tipo", 1, 2, 3),
  categorias: ["A & B", "C"],
  series: [
    { nombre: "Cerrados", refNombre: refRango("Por tipo", 4, 1, 1), refValores: refRango("Por tipo", 4, 2, 3), valores: [3, 0], color: "2E9F6B" },
    { nombre: "Abiertos", refNombre: refRango("Por tipo", 3, 1, 1), refValores: refRango("Por tipo", 3, 2, 3), valores: [2, 1], color: "EDA100" },
  ],
  ancla: { col: 7, fila: 0, ancho: 10, alto: 14 },
  ...cambios,
});

describe("agregarGraficas", () => {
  it("sin gráficas devuelve el mismo archivo", async () => {
    const base = await libroBase();
    expect(await agregarGraficas(base, [])).toBe(base);
  });

  it("agrega la gráfica, su dibujo, las relaciones y los tipos de contenido", async () => {
    const zip = await JSZip.loadAsync(await agregarGraficas(await libroBase(), [grafica()]));
    const nombres = Object.keys(zip.files);
    expect(nombres).toContain("xl/charts/chart1.xml");
    expect(nombres).toContain("xl/drawings/drawing1.xml");
    expect(nombres).toContain("xl/drawings/_rels/drawing1.xml.rels");
    expect(nombres).toContain("xl/worksheets/_rels/sheet1.xml.rels");

    const tipos = await zip.file("[Content_Types].xml")!.async("string");
    expect(tipos).toContain('PartName="/xl/charts/chart1.xml"');
    expect(tipos).toContain("drawingml.chart+xml");
    expect(tipos).toContain('PartName="/xl/drawings/drawing1.xml"');

    // La hoja de la gráfica apunta a su dibujo; la otra no se toca.
    expect(await zip.file("xl/worksheets/sheet1.xml")!.async("string")).toContain('<drawing r:id="rIdGraficas"/></worksheet>');
    expect(await zip.file("xl/worksheets/sheet2.xml")!.async("string")).not.toContain("<drawing");
  });

  it("la gráfica apunta a las celdas de la hoja y escapa los textos", async () => {
    const zip = await JSZip.loadAsync(await agregarGraficas(await libroBase(), [grafica()]));
    const xml = await zip.file("xl/charts/chart1.xml")!.async("string");
    expect(xml).toContain("<c:f>'Por tipo'!$A$2:$A$3</c:f>");
    expect(xml).toContain("<c:f>'Por tipo'!$D$2:$D$3</c:f>");
    expect(xml).toContain('<c:barDir val="bar"/>');
    expect(xml).toContain('<c:grouping val="stacked"/>');
    expect(xml).toContain("Reportes &lt;por&gt; tipo");
    expect(xml).toContain("A &amp; B");
    // Con valores chicos el paso del eje es 1 (si no, Excel repite números).
    expect(xml).toContain('<c:majorUnit val="1"/>');
  });

  it("con valores grandes deja el paso del eje automático", async () => {
    const grande = grafica({
      series: [{ nombre: "Reportes", refNombre: "", refValores: refRango("Por tipo", 2, 2, 3), valores: [120, 40], color: "EDA100" }],
      apilado: false,
      tipo: "columnas",
    });
    const zip = await JSZip.loadAsync(await agregarGraficas(await libroBase(), [grande]));
    const xml = await zip.file("xl/charts/chart1.xml")!.async("string");
    expect(xml).not.toContain("<c:majorUnit");
    expect(xml).toContain('<c:barDir val="col"/>');
    expect(xml).toContain("<c:grouping val=\"clustered\"/>");
  });

  it("el pastel rotula solo el porcentaje y pinta cada rebanada", async () => {
    const pastel = grafica({
      tipo: "pastel",
      apilado: false,
      series: [{ nombre: "Reportes", refNombre: "", refValores: refRango("Por tipo", 2, 2, 3), valores: [5, 1], color: "EDA100", colores: ["EDA100", "2E9F6B"] }],
    });
    const xml = await (await JSZip.loadAsync(await agregarGraficas(await libroBase(), [pastel]))).file("xl/charts/chart1.xml")!.async("string");
    expect(xml).toContain("<c:pieChart>");
    expect(xml).toContain('<c:showPercent val="1"/>');
    expect(xml).toContain('<c:showVal val="0"/>');
    expect(xml.match(/<c:dPt>/g)).toHaveLength(2);
    expect(xml).toContain("<c:tx><c:v>Reportes</c:v></c:tx>");
  });

  it("varias gráficas en la misma hoja comparten un dibujo, con numeración distinta", async () => {
    const zip = await JSZip.loadAsync(
      await agregarGraficas(await libroBase(), [grafica(), grafica({ titulo: "Otra", ancla: { col: 7, fila: 20, ancho: 10, alto: 14 } })])
    );
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["xl/charts/chart1.xml", "xl/charts/chart2.xml"]));
    const dibujo = await zip.file("xl/drawings/drawing1.xml")!.async("string");
    expect(dibujo.match(/<xdr:twoCellAnchor>/g)).toHaveLength(2);
    expect(dibujo).toContain('r:id="rId2"');
  });

  it("falla con un mensaje claro si la hoja no existe", async () => {
    await expect(agregarGraficas(await libroBase(), [grafica({ hoja: "No existe" })])).rejects.toThrow('"No existe"');
  });

  it("el libro sigue leyéndose con exceljs después de agregarle gráficas", async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load((await agregarGraficas(await libroBase(), [grafica()])) as unknown as ArrayBuffer);
    expect(libro.getWorksheet("Por tipo")!.getCell("B2").value).toBe(5);
  });
});

describe("gráficas del Excel de No conformidades", () => {
  const base: Omit<Incidencia, "id"> = {
    linea: "madera", tipo: "Incidencia", proyecto: "P", muebles: [], areas: ["COMPRAS"], motivo: "CRISTAL ROTO",
    categoria_motivo: "Daño", areas_reporta: ["ALMACEN"], estado: "abierto", fecha: "2026-10-06", auditor: "Ana",
  };
  const filas: Incidencia[] = [
    { ...base, id: "1" },
    { ...base, id: "2", estado: "cerrado", fecha: "2026-10-07" },
    { ...base, id: "3", fecha: "2026-03-01" },
  ];

  async function graficasDe(vista: "dia" | "semana" | "mes" | "anio", ref: string, datos = filas) {
    const buffer = await generarExcelIncidencias({ filas: datos, periodo: periodoDe(vista, ref), etiquetaPeriodo: "p", filtros: [], hoy: "2026-10-19" });
    const zip = await JSZip.loadAsync(buffer);
    return Object.keys(zip.files).filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n)).length;
  }

  it("la semana trae una gráfica por hoja de datos y el pastel del resumen", async () => {
    // Resumen, Quién auditó, Por día, Por tipo, Por categoría, Áreas, Área que reporta, Motivos, Proyectos y 2 de pendientes.
    expect(await graficasDe("semana", "2026-10-07")).toBe(11);
  });

  it("el año suma la gráfica de semanas y el día no tiene desglose", async () => {
    expect(await graficasDe("anio", "2026-06-01")).toBe(12);
    expect(await graficasDe("dia", "2026-10-07")).toBe(10);
  });

  it("sin reportes en el periodo no hay gráficas vacías del periodo (quedan las de pendientes)", async () => {
    expect(await graficasDe("dia", "2025-01-01")).toBe(2);
  });
});
