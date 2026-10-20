import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generarExcelIncidencias } from "./incidencias-excel";
import { periodoDe, type Incidencia, type Vista } from "./incidencias";

const inc = (cambios: Partial<Incidencia> & Pick<Incidencia, "id">): Incidencia => ({
  linea: "madera",
  tipo: "Producto No Conforme",
  proyecto: "PH MONTERREY",
  muebles: ["FX-01"],
  areas: ["INGENIERIA"],
  motivo: "CRISTAL ROTO",
  categoria_motivo: "Daño",
  areas_reporta: ["PROD-ARMADO-MAD"],
  estado: "abierto",
  fecha: "2026-10-06",
  auditor: "Luis Corona",
  descripcion: "Llegó roto.\nSe avisó a Compras.",
  solucion: "Se repone.",
  seguimiento: null,
  ...cambios,
});

const filas: Incidencia[] = [
  inc({ id: "1", fecha: "2026-10-05" }),
  inc({ id: "2", fecha: "2026-10-07", estado: "cerrado", auditor: "Jovani Camorlinga", linea: "metal", tipo: "Incidencia", cerrado_en: "2026-10-09T18:00:00Z" }),
  inc({ id: "3", fecha: "2026-10-07", motivo: "DIMENSION ERRONEA", categoria_motivo: "Dimensión" }),
  inc({ id: "4", fecha: "2026-01-12" }), // fuera de la semana; abierta y vieja
  inc({ id: "5", fecha: null }), // sin fecha
];

async function leer(vista: Vista, ref: string, filtros: string[] = []) {
  const periodo = periodoDe(vista, ref);
  const buffer = await generarExcelIncidencias({ filas, periodo, etiquetaPeriodo: `Periodo ${vista}`, filtros, hoy: "2026-10-19" });
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
}

const valores = (hoja: ExcelJS.Worksheet) => hoja.getSheetValues().slice(1) as unknown[][];

describe("Excel de No conformidades", () => {
  it("la semana trae el resumen, una hoja por gráfica, los pendientes y la lista", async () => {
    const libro = await leer("semana", "2026-10-07");
    expect(libro.worksheets.map((h) => h.name)).toEqual([
      "Resumen",
      "Quién auditó",
      "Por día",
      "Por tipo",
      "Por categoría",
      "Áreas involucradas",
      "Área que reporta",
      "Motivos",
      "Proyectos",
      "Origen y detección",
      "Pendientes +30 días",
      "Reportes",
    ]);
  });

  it("el resumen cuenta solo lo del periodo y dice los filtros", async () => {
    const libro = await leer("semana", "2026-10-07", ["Línea: Madera"]);
    const resumen = Object.fromEntries(
      valores(libro.getWorksheet("Resumen")!)
        .filter((f) => typeof f?.[1] === "string" && f[2] !== undefined)
        .map((f) => [f[1] as string, f[2]])
    );
    expect(resumen["Reportes generados"]).toBe(3);
    expect(resumen["Abiertos"]).toBe(2);
    expect(resumen["Cerrados"]).toBe(1);
    expect(resumen["% cerrado"]).toBeCloseTo(1 / 3);
    expect(resumen["Madera"]).toBe(2);
    expect(resumen["Metal"]).toBe(1);
    expect(resumen["Filtros"]).toBe("Línea: Madera");
    expect(resumen["Sin fecha (fuera de todo periodo)"]).toBe(1);
  });

  it("quién auditó y el desglose por día salen completos", async () => {
    const libro = await leer("semana", "2026-10-07");
    const auditores = valores(libro.getWorksheet("Quién auditó")!);
    expect(auditores[0]).toEqual([, "Auditó", "Reportes", "Abiertos", "Cerrados", "% cerrado", "% del total"]);
    expect(auditores[1].slice(1, 5)).toEqual(["Luis Corona", 2, 2, 0]);
    expect(auditores[2].slice(1, 5)).toEqual(["Jovani Camorlinga", 1, 0, 1]);

    const dias = valores(libro.getWorksheet("Por día")!);
    expect(dias).toHaveLength(1 + 7);
    const miercoles = dias.find((f) => f[1] === "2026-10-07");
    expect(miercoles?.slice(4, 7)).toEqual([2, 1, 1]);
  });

  it("las hojas de gráficas traen todos los valores, no solo los primeros", async () => {
    const libro = await leer("semana", "2026-10-07");
    const categorias = valores(libro.getWorksheet("Por categoría")!).slice(1).map((f) => [f[1], f[2]]);
    expect(categorias).toEqual([
      ["Daño", 2],
      ["Dimensión", 1],
    ]);
  });

  it("el año agrega las semanas del año y el día no tiene desglose", async () => {
    const anio = await leer("anio", "2026-06-01");
    expect(anio.worksheets.map((h) => h.name)).toContain("Por mes");
    expect(anio.worksheets.map((h) => h.name)).toContain("Semanas del año");
    expect(valores(anio.getWorksheet("Por mes")!)).toHaveLength(1 + 12);

    const dia = await leer("dia", "2026-10-07");
    const nombres = dia.worksheets.map((h) => h.name);
    expect(nombres).not.toContain("Por día");
    expect(nombres).not.toContain("Semanas del año");
  });

  it("los pendientes cuentan lo abierto de más de 30 días sin importar el periodo", async () => {
    const libro = await leer("semana", "2026-10-07");
    const texto = valores(libro.getWorksheet("Pendientes +30 días")!)
      .flat()
      .filter((v): v is string => typeof v === "string");
    expect(texto[0]).toBe("Abiertos con más de 30 días al 2026-10-19: 1");
    expect(texto).toContain("Más de 180 días");
    expect(texto.some((t) => t.includes("sin fecha"))).toBe(true);
  });

  it("la lista de reportes trae el texto completo con sus saltos de línea y la fecha de cierre", async () => {
    const libro = await leer("semana", "2026-10-07");
    const lista = libro.getWorksheet("Reportes")!;
    const filasLista = valores(lista);
    expect(filasLista).toHaveLength(1 + 3);
    const cerrada = filasLista.find((f) => f[3] === "Cerrado")!;
    expect(cerrada[4]).toBe("Jovani Camorlinga");
    expect(cerrada[6]).toBe("Metal");
    expect(cerrada[13]).toBe("Llegó roto.\nSe avisó a Compras.");
    expect(cerrada[14]).toBe("Se repone.");
    expect(cerrada[16]).toBeInstanceOf(Date);
    // La más reciente primero.
    expect((filasLista[1][1] as Date).toISOString().slice(0, 10) >= (filasLista[3][1] as Date).toISOString().slice(0, 10)).toBe(true);
  });

  it("un periodo vacío no truena y deja las hojas con solo su encabezado", async () => {
    const libro = await leer("dia", "2025-01-01");
    expect(valores(libro.getWorksheet("Reportes")!)).toHaveLength(1);
    expect(valores(libro.getWorksheet("Quién auditó")!)).toHaveLength(1);
  });
});
