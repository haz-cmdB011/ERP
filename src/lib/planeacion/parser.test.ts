import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import ExcelJS from "exceljs";
import { parsePlaneacionExcel } from "./parser";

const MUESTRA_REAL =
  "P:/2026/107-26-2 SMART FIT PLAZA PALMIRA/PEDIDO/PM 107-26 SMART FIT PLAZA PALMIRA.xlsx";

// Este archivo tiene CANTIDAD TOTAL calculada por fórmula compartida
// (K179*M$178) en varias filas; exceljs no siempre expone `result` en
// `cell.value` para esas celdas "esclavas" del rango compartido, aunque
// el valor cacheado sí existe en `cell.model.result`.
const MUESTRA_FORMULAS_COMPARTIDAS =
  "P:/2026/009-26-2 MOBILIARIO AZOTEA SERVICIOS PH GDL/PEDIDO/PM 009-26 MOBILIARIO AZOTEA-SERVICIOS PH GDL_Actualización 04.09.26.xlsx";

const HEADERS = [
  "ITEM",
  "COMPONENTE",
  "TIPO",
  "ETAPA",
  "NIVEL",
  "DEPARTAMENTO",
  "ELEVACION",
  "MODELO",
  "DESCRIPCION",
  "CANTIDAD X MUEBLE",
  "UNIDAD",
  "CANTIDAD TOTAL",
  "ACABADOS",
  "OBSERVACIONES",
];

interface FilaTest {
  ITEM: number;
  COMPONENTE: string;
  TIPO?: string;
  MODELO?: string;
  DESCRIPCION?: string;
  "CANTIDAD X MUEBLE"?: number;
  UNIDAD?: string;
  "CANTIDAD TOTAL"?: number | string;
  [key: string]: unknown;
}

async function construirWorkbook(
  filas: FilaTest[],
  opciones: {
    metadata?: Partial<{
      numeroPedido: string;
      proyecto: string;
      cliente: string;
    }>;
    headers?: string[];
    omitirEncabezado?: boolean;
  } = {}
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("MOBILIARIO");

  const meta = {
    numeroPedido: "PM-TEST-01",
    proyecto: "PROYECTO DE PRUEBA",
    cliente: "CLIENTE PRUEBA",
    ...opciones.metadata,
  };

  ws.getCell("A3").value = "PEDIDO DE MANUFACTURA";
  ws.getCell("L2").value = "No. PEDIDO";
  ws.getCell("N2").value = meta.numeroPedido;
  ws.getCell("L4").value = "PROYECTO:";
  ws.getCell("N4").value = meta.proyecto;
  ws.getCell("L5").value = "CLIENTE:";
  ws.getCell("N5").value = meta.cliente;

  if (!opciones.omitirEncabezado) {
    const headerRow = opciones.headers ?? HEADERS;
    ws.getRow(9).values = headerRow;
  }

  filas.forEach((fila, i) => {
    const row = ws.getRow(10 + i);
    const headerRow = opciones.headers ?? HEADERS;
    headerRow.forEach((h, colIdx) => {
      row.getCell(colIdx + 1).value = (fila[h] ?? null) as ExcelJS.CellValue;
    });
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe("parsePlaneacionExcel", () => {
  it("parsea el archivo real de muestra (PM 107-26) con la jerarquía MO/FU correcta", async () => {
    if (!existsSync(MUESTRA_REAL)) {
      // El archivo de muestra vive fuera del repo; se omite si no está disponible.
      return;
    }
    const buf = readFileSync(MUESTRA_REAL);
    const resultado = await parsePlaneacionExcel(buf);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.metadata.numero_pedido).toBe("PM 107-26");
    expect(resultado.metadata.cliente).toBe("SMART FIT");

    const mo = resultado.items.filter((i) => i.tipo_registro === "MO");
    const fu = resultado.items.filter((i) => i.tipo_registro === "FU");
    expect(mo).toHaveLength(5);
    expect(fu).toHaveLength(10);

    // Caso real: dos filas FU con el mismo item_code (1.03) y distinto
    // material (madera y metal) deben conservarse ambas, no deduplicarse.
    const item103 = fu.filter((i) => i.item_code === 1.03);
    expect(item103).toHaveLength(2);
    expect(item103.map((i) => i.tipo_material).sort()).toEqual(["MADERA", "METAL"]);
  });

  it("resuelve CANTIDAD TOTAL calculada por fórmula compartida (cell.model.result como fallback)", async () => {
    if (!existsSync(MUESTRA_FORMULAS_COMPARTIDAS)) {
      return;
    }
    const buf = readFileSync(MUESTRA_FORMULAS_COMPARTIDAS);
    const resultado = await parsePlaneacionExcel(buf);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.items.length).toBeGreaterThan(200);
  });

  it("acepta un archivo válido mínimo y calcula filasTotales", async () => {
    const buf = await construirWorkbook([
      {
        ITEM: 1,
        COMPONENTE: "MO",
        DESCRIPCION: "MUEBLE 1",
        "CANTIDAD TOTAL": 2,
        UNIDAD: "PZA",
      },
      {
        ITEM: 1.01,
        COMPONENTE: "FU",
        DESCRIPCION: "COMPONENTE A",
        "CANTIDAD TOTAL": 2,
        UNIDAD: "PZA",
      },
    ]);

    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.items).toHaveLength(2);
    expect(resultado.filasTotales).toBe(2);
  });

  it("permite item_code duplicado entre filas FU con distinto material", async () => {
    const buf = await construirWorkbook([
      { ITEM: 1, COMPONENTE: "MO", DESCRIPCION: "MUEBLE 1", "CANTIDAD TOTAL": 1 },
      { ITEM: 1.01, COMPONENTE: "FU", TIPO: "MADERA", DESCRIPCION: "PARTE A", "CANTIDAD TOTAL": 1 },
      { ITEM: 1.01, COMPONENTE: "FU", TIPO: "METAL", DESCRIPCION: "PARTE B", "CANTIDAD TOTAL": 1 },
    ]);

    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.items).toHaveLength(3);
  });

  it("rechaza un archivo sin la fila de encabezados", async () => {
    const buf = await construirWorkbook([], { omitirEncabezado: true });
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores[0].mensaje).toMatch(/fila de encabezados/i);
  });

  it("rechaza un archivo al que le falta una columna requerida", async () => {
    const headersSinUnidad = HEADERS.filter((h) => h !== "UNIDAD");
    const buf = await construirWorkbook(
      [{ ITEM: 1, COMPONENTE: "MO", DESCRIPCION: "MUEBLE 1", "CANTIDAD TOTAL": 1 }],
      { headers: headersSinUnidad }
    );
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores[0].mensaje).toMatch(/UNIDAD/);
  });

  it("acepta COMPONENTE no reconocible como categoria null (ej. proyectos que usan esa columna para códigos de modelo)", async () => {
    const buf = await construirWorkbook([
      { ITEM: 1, COMPONENTE: "CAR-09", DESCRIPCION: "MEDALLON", "CANTIDAD TOTAL": 1 },
    ]);
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.items[0].categoria_componente).toBeNull();
    expect(resultado.items[0].tipo_registro).toBe("MO");
  });

  it("determina MO/FU por la forma del ITEM, no por el texto de COMPONENTE", async () => {
    // Caso real: un PER puede ser padre (ITEM entero) y su despiece puede
    // venir etiquetado MOB o FUN indistintamente.
    const buf = await construirWorkbook([
      { ITEM: 3, COMPONENTE: "PER", DESCRIPCION: "PERIMETRO PRINCIPAL", "CANTIDAD TOTAL": 1 },
      { ITEM: 3.01, COMPONENTE: "MOB", DESCRIPCION: "PARTE MOBILIARIO", "CANTIDAD TOTAL": 1 },
      { ITEM: 3.02, COMPONENTE: "FUN", DESCRIPCION: "PARTE FUNCION", "CANTIDAD TOTAL": 1 },
    ]);

    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const [per, mob, fun] = resultado.items;
    expect(per.tipo_registro).toBe("MO");
    expect(per.categoria_componente).toBe("PERIMETRO");
    expect(mob.tipo_registro).toBe("FU");
    expect(mob.categoria_componente).toBe("MOBILIARIO");
    expect(fun.tipo_registro).toBe("FU");
    expect(fun.categoria_componente).toBe("FUNCION");
  });

  it("acepta variaciones de COMPONENTE por prefijo (MO/MOB, FU/FUN, PER...)", async () => {
    const buf = await construirWorkbook([
      { ITEM: 1, COMPONENTE: "mo", DESCRIPCION: "A", "CANTIDAD TOTAL": 1 },
      { ITEM: 2, COMPONENTE: "MOBILIARIO", DESCRIPCION: "B", "CANTIDAD TOTAL": 1 },
      { ITEM: 3, COMPONENTE: "fun", DESCRIPCION: "C", "CANTIDAD TOTAL": 1 },
      { ITEM: 4, COMPONENTE: "Perimetro", DESCRIPCION: "D", "CANTIDAD TOTAL": 1 },
    ]);
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.items.map((i) => i.categoria_componente)).toEqual([
      "MOBILIARIO",
      "MOBILIARIO",
      "FUNCION",
      "PERIMETRO",
    ]);
  });

  it("reporta error de fila cuando CANTIDAD TOTAL no es numérica", async () => {
    const buf = await construirWorkbook([
      { ITEM: 1, COMPONENTE: "MO", DESCRIPCION: "MUEBLE 1", "CANTIDAD TOTAL": "no-es-numero" },
    ]);
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores[0].mensaje).toMatch(/CANTIDAD TOTAL/);
  });

  it("reporta error de fila cuando DESCRIPCION está vacía", async () => {
    const buf = await construirWorkbook([
      { ITEM: 1, COMPONENTE: "MO", DESCRIPCION: "", "CANTIDAD TOTAL": 1 },
    ]);
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.errores[0].mensaje).toMatch(/DESCRIPCION/);
  });

  it("ignora filas sin ITEM ni DESCRIPCION/MODELO/COMPONENTE (ej. fila de pesos de avance)", async () => {
    const buf = await construirWorkbook([
      // fila de "pesos": tiene contenido (CANTIDAD X MUEBLE) pero sin
      // ITEM/DESCRIPCION/MODELO/COMPONENTE, como en el archivo real.
      { ITEM: undefined as unknown as number, COMPONENTE: "", "CANTIDAD X MUEBLE": 1 },
      { ITEM: 1, COMPONENTE: "MO", DESCRIPCION: "MUEBLE 1", "CANTIDAD TOTAL": 1 },
    ]);

    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.items).toHaveLength(1);
  });

  it("extrae correctamente la metadata del pedido", async () => {
    const buf = await construirWorkbook(
      [{ ITEM: 1, COMPONENTE: "MO", DESCRIPCION: "MUEBLE 1", "CANTIDAD TOTAL": 1 }],
      { metadata: { numeroPedido: "PM-999", proyecto: "PROYECTO X", cliente: "ACME" } }
    );
    const resultado = await parsePlaneacionExcel(buf);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.metadata.numero_pedido).toBe("PM-999");
    expect(resultado.metadata.proyecto_nombre).toBe("PROYECTO X");
    expect(resultado.metadata.cliente).toBe("ACME");
  });
});
