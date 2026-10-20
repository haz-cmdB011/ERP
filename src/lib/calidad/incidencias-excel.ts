// Excel de No conformidades: lo mismo que se ve en las gráficas y tablas de la pantalla, del día,
// la semana, el mes o el año que se esté mirando, con los mismos filtros. Una hoja por gráfica
// (con TODOS los valores, no solo los primeros que caben en pantalla) y la lista completa de
// reportes con su texto.

import ExcelJS from "exceljs";
import { agregarGraficas, refRango, type GraficaExcel } from "./excel-graficas";
import {
  desglosarPeriodo,
  filasDelPeriodo,
  pendientesViejos,
  resumirIncidencias,
  resumirPorAuditor,
  resumirPorSemana,
  semanaDe,
  type ConteoAbiertos,
  type Incidencia,
  type Periodo,
  type Subperiodo,
} from "./incidencias";

export interface DatosExcelIncidencias {
  // Todo lo que pasó los filtros (de cualquier fecha); aquí se recorta al periodo.
  filas: Incidencia[];
  periodo: Periodo;
  // "Semana 40 · 28 sep – 4 oct de 2026", tal como se muestra en pantalla.
  etiquetaPeriodo: string;
  // Filtros puestos, en palabras ("Auditor: Luis Corona"); vacío si no hay.
  filtros: string[];
  // Día de hoy ("AAAA-MM-DD"): de ahí se cuentan los días de los pendientes.
  hoy: string;
}

const COLOR_ENCABEZADO = "FFD9E1F2";
const NOMBRE_VISTA_PLURAL = { dia: "Por día", semana: "Por día", mes: "Por semana", anio: "Por mes" } as const;

// Un "AAAA-MM-DD" como fecha de Excel (a medianoche UTC, sin zona).
function fechaExcel(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

// Hora de la empresa (UTC-6) como fecha "de reloj", igual que el Excel de Folios.
function fechaHoraLocal(iso: string): Date {
  return new Date(new Date(iso).getTime() - 6 * 3600_000);
}

function porcentajeCerrado(total: number, abiertas: number): number {
  return total === 0 ? 0 : (total - abiertas) / total;
}

function estiloEncabezado(fila: ExcelJS.Row) {
  fila.font = { bold: true };
  fila.alignment = { vertical: "middle", wrapText: true };
  fila.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  });
}

interface Columna {
  encabezado: string;
  ancho: number;
  formato?: string;
  ajustar?: boolean;
}

// Una hoja con una tabla: encabezado fijo, filtros y anchos.
function hojaTabla(libro: ExcelJS.Workbook, nombre: string, columnas: Columna[], filas: Array<Array<ExcelJS.CellValue>>) {
  const hoja = libro.addWorksheet(nombre);
  estiloEncabezado(hoja.addRow(columnas.map((c) => c.encabezado)));
  for (const f of filas) hoja.addRow(f);
  columnas.forEach((c, n) => {
    const col = hoja.getColumn(n + 1);
    col.width = c.ancho;
    if (c.formato) col.numFmt = c.formato;
    if (c.ajustar) col.alignment = { vertical: "top", wrapText: true };
  });
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  if (filas.length > 0) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
  return hoja;
}

const COLUMNAS_CONTEO = (primera: string): Columna[] => [
  { encabezado: primera, ancho: 44, ajustar: true },
  { encabezado: "Reportes", ancho: 11 },
  { encabezado: "Abiertos", ancho: 11 },
  { encabezado: "Cerrados", ancho: 11 },
  { encabezado: "% cerrado", ancho: 11, formato: "0%" },
];

const COLOR_CERRADOS = "2E9F6B";
const COLOR_ABIERTOS = "EDA100";
// Cuántas categorías caben en una gráfica legible; la tabla de la hoja trae todas.
const MAXIMO_EN_GRAFICA = 15;

// Gráfica de barras o columnas apiladas (cerrados y abiertos) a partir de una tabla ya escrita en la
// hoja: encabezado en la fila 1, categorías en la columna A y los valores en las columnas dadas.
function graficaApilada(p: {
  hoja: string;
  titulo: string;
  tipo: "barras" | "columnas";
  nombres: string[];
  abiertos: number[];
  cerrados: number[];
  colAbiertos: number;
  colCerrados: number;
  maximo?: number;
}): GraficaExcel | null {
  const n = Math.min(p.nombres.length, p.maximo ?? Infinity);
  if (n === 0) return null;
  const recortada = n < p.nombres.length;
  return {
    hoja: p.hoja,
    titulo: recortada ? `${p.titulo} (los ${n} primeros)` : p.titulo,
    tipo: p.tipo,
    apilado: true,
    refCategorias: refRango(p.hoja, 1, 2, n + 1),
    categorias: p.nombres.slice(0, n),
    series: [
      {
        nombre: "Cerrados",
        refNombre: refRango(p.hoja, p.colCerrados, 1, 1),
        refValores: refRango(p.hoja, p.colCerrados, 2, n + 1),
        valores: p.cerrados.slice(0, n),
        color: COLOR_CERRADOS,
      },
      {
        nombre: "Abiertos",
        refNombre: refRango(p.hoja, p.colAbiertos, 1, 1),
        refValores: refRango(p.hoja, p.colAbiertos, 2, n + 1),
        valores: p.abiertos.slice(0, n),
        color: COLOR_ABIERTOS,
      },
    ],
    // A la derecha de la tabla; las barras horizontales crecen con su número de categorías.
    ancla:
      p.tipo === "barras"
        ? { col: 7, fila: 0, ancho: 10, alto: Math.max(14, Math.round(8 + n * 1.5)) }
        : { col: 7, fila: 0, ancho: Math.max(10, Math.ceil(n * 0.6) + 4), alto: 20 },
  };
}

// Una hoja con la tabla de conteos de una gráfica y la gráfica de barras al lado.
function hojaConteos(
  libro: ExcelJS.Workbook,
  graficas: GraficaExcel[],
  hoja: string,
  primera: string,
  conteos: ConteoAbiertos[],
  titulo: string
) {
  hojaTabla(libro, hoja, COLUMNAS_CONTEO(primera), filasConteo(conteos));
  const g = graficaApilada({
    hoja,
    titulo,
    tipo: "barras",
    nombres: conteos.map((c) => c.nombre),
    abiertos: conteos.map((c) => c.abiertas),
    cerrados: conteos.map((c) => c.total - c.abiertas),
    colAbiertos: 3,
    colCerrados: 4,
    maximo: MAXIMO_EN_GRAFICA,
  });
  if (g) graficas.push(g);
}

function filasConteo(conteos: ConteoAbiertos[]): Array<Array<ExcelJS.CellValue>> {
  return conteos.map((c) => [c.nombre, c.total, c.abiertas, c.total - c.abiertas, porcentajeCerrado(c.total, c.abiertas)]);
}

function filaSubperiodo(s: Subperiodo): Array<ExcelJS.CellValue> {
  const semana = s.vista === "semana" ? semanaDe(s.inicio)?.numero : null;
  return [
    s.vista === "semana" ? `Semana ${semana}` : s.vista === "mes" ? s.inicio.slice(0, 7) : s.inicio,
    fechaExcel(s.inicio),
    fechaExcel(s.fin),
    s.total,
    s.abiertas,
    s.total - s.abiertas,
  ];
}

export async function generarExcelIncidencias(d: DatosExcelIncidencias): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "ERP Mobiliarium";
  const delPeriodo = filasDelPeriodo(d.filas, d.periodo).sort(
    (a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id)
  );
  const r = resumirIncidencias(delPeriodo);
  const auditores = resumirPorAuditor(delPeriodo);
  const graficas: GraficaExcel[] = [];

  // --- Resumen --------------------------------------------------------------
  const resumen = libro.addWorksheet("Resumen");
  resumen.columns = [{ width: 28 }, { width: 46 }];
  const dato = (etiqueta: string, valor: ExcelJS.CellValue, formato?: string) => {
    const fila = resumen.addRow([etiqueta, valor]);
    fila.getCell(1).font = { bold: true };
    fila.getCell(2).alignment = { horizontal: "left" };
    if (formato) fila.getCell(2).numFmt = formato;
  };
  resumen.addRow(["No conformidades de Calidad"]).font = { bold: true, size: 14 };
  resumen.addRow([]);
  dato("Periodo", d.etiquetaPeriodo);
  dato("Del", fechaExcel(d.periodo.inicio), "dd/mm/yyyy");
  dato("Al", fechaExcel(d.periodo.fin), "dd/mm/yyyy");
  dato("Filtros", d.filtros.length > 0 ? d.filtros.join(" · ") : "Ninguno");
  resumen.addRow([]);
  dato("Reportes generados", r.total);
  dato("Abiertos", r.abiertas);
  const filaAbiertos = resumen.rowCount;
  dato("Cerrados", r.cerradas);
  dato("% cerrado", porcentajeCerrado(r.total, r.abiertas), "0%");
  dato("Madera", r.porLinea.madera);
  dato("Metal", r.porLinea.metal);
  resumen.addRow([]);
  dato("Generado el", fechaExcel(d.hoy), "dd/mm/yyyy");
  const sinFecha = d.filas.filter((i) => !i.fecha).length;
  if (sinFecha > 0) dato("Sin fecha (fuera de todo periodo)", sinFecha);
  if (r.total > 0) {
    graficas.push({
      hoja: "Resumen",
      titulo: "Abiertos y cerrados",
      tipo: "pastel",
      refCategorias: refRango("Resumen", 1, filaAbiertos, filaAbiertos + 1),
      categorias: ["Abiertos", "Cerrados"],
      series: [
        {
          nombre: "Reportes",
          refNombre: "",
          refValores: refRango("Resumen", 2, filaAbiertos, filaAbiertos + 1),
          valores: [r.abiertas, r.cerradas],
          color: COLOR_ABIERTOS,
          colores: [COLOR_ABIERTOS, COLOR_CERRADOS],
        },
      ],
      ancla: { col: 3, fila: 1, ancho: 6, alto: 16 },
    });
  }

  // --- Quién auditó ---------------------------------------------------------
  hojaTabla(
    libro,
    "Quién auditó",
    [
      { encabezado: "Auditó", ancho: 28 },
      { encabezado: "Reportes", ancho: 11 },
      { encabezado: "Abiertos", ancho: 11 },
      { encabezado: "Cerrados", ancho: 11 },
      { encabezado: "% cerrado", ancho: 11, formato: "0%" },
      { encabezado: "% del total", ancho: 11, formato: "0%" },
    ],
    auditores.map((a) => [a.nombre, a.total, a.abiertas, a.cerradas, porcentajeCerrado(a.total, a.abiertas), a.parte])
  );
  const gAuditores = graficaApilada({
    hoja: "Quién auditó",
    titulo: "Reportes por auditor",
    tipo: "barras",
    nombres: auditores.map((a) => a.nombre),
    abiertos: auditores.map((a) => a.abiertas),
    cerrados: auditores.map((a) => a.cerradas),
    colAbiertos: 3,
    colCerrados: 4,
  });
  if (gAuditores) graficas.push(gAuditores);

  // --- Desglose del periodo y semanas del año --------------------------------
  if (d.periodo.vista !== "dia") {
    const desglosar = desglosarPeriodo(delPeriodo, d.periodo);
    hojaTabla(
      libro,
      NOMBRE_VISTA_PLURAL[d.periodo.vista],
      [
        { encabezado: d.periodo.vista === "anio" ? "Mes" : d.periodo.vista === "mes" ? "Semana" : "Día", ancho: 14 },
        { encabezado: "Desde", ancho: 12, formato: "dd/mm/yyyy" },
        { encabezado: "Hasta", ancho: 12, formato: "dd/mm/yyyy" },
        { encabezado: "Reportes", ancho: 11 },
        { encabezado: "Abiertos", ancho: 11 },
        { encabezado: "Cerrados", ancho: 11 },
      ],
      desglosar.map(filaSubperiodo)
    );
    const gDesglose = graficaApilada({
      hoja: NOMBRE_VISTA_PLURAL[d.periodo.vista],
      titulo: `Reportes ${NOMBRE_VISTA_PLURAL[d.periodo.vista].toLowerCase()}`,
      tipo: "columnas",
      nombres: desglosar.map((x) => filaSubperiodo(x)[0] as string),
      abiertos: desglosar.map((x) => x.abiertas),
      cerrados: desglosar.map((x) => x.total - x.abiertas),
      colAbiertos: 5,
      colCerrados: 6,
    });
    if (gDesglose) graficas.push(gDesglose);
  }
  if (d.periodo.vista === "anio") {
    const semanasDelAnio = resumirPorSemana(delPeriodo).semanas;
    hojaTabla(
      libro,
      "Semanas del año",
      [
        { encabezado: "Semana", ancho: 10 },
        { encabezado: "Desde", ancho: 12, formato: "dd/mm/yyyy" },
        { encabezado: "Hasta", ancho: 12, formato: "dd/mm/yyyy" },
        { encabezado: "Reportes", ancho: 11 },
        { encabezado: "Abiertos", ancho: 11 },
        { encabezado: "Cerrados", ancho: 11 },
      ],
      semanasDelAnio.map((s) => [`Semana ${s.numero}`, fechaExcel(s.inicio), fechaExcel(s.fin), s.total, s.abiertas, s.total - s.abiertas])
    );
    const gSemanas = graficaApilada({
      hoja: "Semanas del año",
      titulo: "Reportes por semana del año",
      tipo: "columnas",
      nombres: semanasDelAnio.map((s) => `Semana ${s.numero}`),
      abiertos: semanasDelAnio.map((s) => s.abiertas),
      cerrados: semanasDelAnio.map((s) => s.total - s.abiertas),
      colAbiertos: 5,
      colCerrados: 6,
    });
    if (gSemanas) graficas.push(gSemanas);
  }

  // --- Una hoja por gráfica del detalle ----------------------------------------
  hojaConteos(libro, graficas, "Por tipo", "Tipo de reporte", r.porTipo, "Reportes por tipo");
  hojaConteos(libro, graficas, "Por categoría", "Categoría del motivo", r.porCategoria, "Reportes por categoría del motivo");
  hojaConteos(libro, graficas, "Áreas involucradas", "Área involucrada", r.porArea, "Áreas involucradas");
  hojaConteos(libro, graficas, "Área que reporta", "Área que reporta", r.porAreaQueReporta, "Área que reporta");
  hojaConteos(libro, graficas, "Motivos", "Motivo", r.porMotivo, "Motivos más repetidos");
  hojaConteos(libro, graficas, "Proyectos", "Proyecto", r.porProyecto, "Proyectos con más reportes");
  hojaTabla(
    libro,
    "Origen y detección",
    [
      { encabezado: "Nace en (área involucrada)", ancho: 30 },
      { encabezado: "Lo detecta (área que reporta)", ancho: 30 },
      { encabezado: "Reportes", ancho: 11 },
    ],
    r.cruceAreaReporta.map((c) => [c.area, c.reporta, c.total])
  );

  // --- Pendientes de más de 30 días (no dependen del periodo) -------------------
  const pendientes = pendientesViejos(d.filas, d.hoy, 30, Number.MAX_SAFE_INTEGER);
  const hojaPend = libro.addWorksheet("Pendientes +30 días");
  hojaPend.columns = [{ width: 30 }, { width: 11 }, { width: 14 }, { width: 28 }, { width: 24 }, { width: 34 }, { width: 44 }];
  // Escribe un bloque (título, encabezado y filas) y devuelve las filas de sus datos.
  const bloque = (titulo: string, encabezados: string[], filas: Array<Array<ExcelJS.CellValue>>) => {
    hojaPend.addRow([titulo]).font = { bold: true, size: 12 };
    estiloEncabezado(hojaPend.addRow(encabezados));
    const desde = hojaPend.rowCount + 1;
    for (const f of filas) hojaPend.addRow(f);
    const hasta = hojaPend.rowCount;
    hojaPend.addRow([]);
    return { desde, hasta };
  };
  hojaPend.addRow([`Abiertos con más de 30 días al ${d.hoy}: ${pendientes.total}`]).font = { bold: true };
  if (pendientes.sinFecha > 0) hojaPend.addRow([`(${pendientes.sinFecha} abiertos sin fecha no entran en la cuenta)`]);
  hojaPend.addRow([]);
  const bloqueAntiguedad = bloque("Por antigüedad", ["Antigüedad", "Reportes"], pendientes.rangos.map((x) => [x.etiqueta, x.total]));
  const bloqueAuditor = bloque("Por quién auditó", ["Auditó", "Reportes"], pendientes.porAuditor.map((a) => [a.nombre, a.total]));
  const graficaPendientes = (
    titulo: string,
    tipo: "barras" | "columnas",
    b: { desde: number; hasta: number },
    nombres: string[],
    valores: number[],
    fila: number
  ) => {
    if (b.hasta < b.desde || valores.every((v) => v === 0)) return;
    graficas.push({
      hoja: "Pendientes +30 días",
      titulo,
      tipo,
      refCategorias: refRango("Pendientes +30 días", 1, b.desde, b.hasta),
      categorias: nombres,
      series: [
        {
          nombre: "Reportes",
          refNombre: refRango("Pendientes +30 días", 2, b.desde - 1, b.desde - 1),
          refValores: refRango("Pendientes +30 días", 2, b.desde, b.hasta),
          valores,
          color: COLOR_ABIERTOS,
        },
      ],
      ancla: { col: 8, fila, ancho: 9, alto: 16 },
    });
  };
  graficaPendientes("Pendientes por antigüedad", "columnas", bloqueAntiguedad, pendientes.rangos.map((x) => x.etiqueta), pendientes.rangos.map((x) => x.total), 0);
  graficaPendientes("Pendientes por auditor", "barras", bloqueAuditor, pendientes.porAuditor.map((a) => a.nombre), pendientes.porAuditor.map((a) => a.total), 17);
  bloque(
    "Lista, del más viejo al más reciente",
    ["Fecha", "Días", "Estado", "Auditó", "Tipo", "Proyecto", "Motivo"],
    pendientes.masViejas.map((i) => [fechaExcel(i.fecha!), i.dias, "Abierto", i.auditor ?? "", i.tipo, i.proyecto ?? "", i.motivo ?? ""])
  );
  hojaPend.getColumn(1).numFmt = "dd/mm/yyyy";

  // --- Lista completa de reportes del periodo, con su texto ----------------------
  hojaTabla(
    libro,
    "Reportes",
    [
      { encabezado: "Fecha", ancho: 12, formato: "dd/mm/yyyy" },
      { encabezado: "Semana", ancho: 9 },
      { encabezado: "Estado", ancho: 10 },
      { encabezado: "Auditó", ancho: 20 },
      { encabezado: "Tipo", ancho: 20, ajustar: true },
      { encabezado: "Línea", ancho: 9 },
      { encabezado: "Proyecto", ancho: 34, ajustar: true },
      { encabezado: "Muebles", ancho: 26, ajustar: true },
      { encabezado: "Áreas involucradas", ancho: 26, ajustar: true },
      { encabezado: "Área que reporta", ancho: 20, ajustar: true },
      { encabezado: "Motivo", ancho: 40, ajustar: true },
      { encabezado: "Categoría", ancho: 20 },
      { encabezado: "Descripción del reporte", ancho: 70, ajustar: true },
      { encabezado: "Solución", ancho: 55, ajustar: true },
      { encabezado: "Control y seguimiento", ancho: 55, ajustar: true },
      { encabezado: "Cerrado el", ancho: 17, formato: "dd/mm/yyyy hh:mm" },
    ],
    delPeriodo.map((i) => [
      i.fecha ? fechaExcel(i.fecha) : null,
      i.fecha ? (semanaDe(i.fecha)?.numero ?? null) : null,
      i.estado === "abierto" ? "Abierto" : "Cerrado",
      i.auditor ?? "",
      i.tipo,
      i.linea === "madera" ? "Madera" : "Metal",
      i.proyecto ?? "",
      i.muebles.join(", "),
      i.areas.join(", "),
      i.areas_reporta.join(", "),
      i.motivo ?? "",
      i.categoria_motivo,
      i.descripcion ?? "",
      i.solucion ?? "",
      i.seguimiento ?? "",
      i.cerrado_en ? fechaHoraLocal(i.cerrado_en) : null,
    ])
  );

  return agregarGraficas(Buffer.from(await libro.xlsx.writeBuffer()), graficas);
}
