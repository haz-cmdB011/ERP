// Incidencias de Calidad (reportes de no conformidad, desviaciones, incidencias
// y mejoras). Puro y sin navegador: lo usan el script que migra el Excel
// BD-CONTROL26, la captura y el dashboard, y tiene pruebas.
//
// Imports relativos a propósito: el script de importación corre con `tsx` y no
// resuelve el alias `@/`.

export const LINEAS = ["madera", "metal"] as const;
export type Linea = (typeof LINEAS)[number];

export const TIPOS_INCIDENCIA = [
  "Producto No Conforme",
  "Desviación",
  "Incidencia",
  "Mejora de Producto",
] as const;
export type TipoIncidencia = (typeof TIPOS_INCIDENCIA)[number];

export const ESTADOS_INCIDENCIA = ["abierto", "cerrado"] as const;
export type EstadoIncidencia = (typeof ESTADOS_INCIDENCIA)[number];

export const CATEGORIAS_MOTIVO = [
  "Dimensión",
  "Daño",
  "Extravío o faltante",
  "Información o diseño",
  "Acabado",
  "Fabricación o armado",
  "Material o herraje",
  "Proceso o liberación",
  "Sin clasificar",
] as const;
export type CategoriaMotivo = (typeof CATEGORIAS_MOTIVO)[number];

export interface Incidencia {
  id: string;
  linea: Linea;
  tipo: TipoIncidencia;
  proyecto: string | null;
  muebles: string[];
  areas: string[];
  motivo: string | null;
  categoria_motivo: CategoriaMotivo;
  areas_reporta: string[];
  estado: EstadoIncidencia;
  // Día del reporte, "AAAA-MM-DD"; nulo si el Excel no la trae o la trae mal.
  fecha: string | null;
}

export type NuevaIncidencia = Omit<Incidencia, "id"> & { origen_importacion: string | null };

// --- Limpieza de texto -------------------------------------------------------

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Mayúsculas, sin acentos y con espacios simples: así "REMODELACIÓN" y
// "remodelacion " cuentan como el mismo proyecto.
export function textoNormalizado(valor: unknown): string {
  return sinAcentos(String(valor ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function textoSimple(valor: unknown): string {
  return String(valor ?? "").replace(/\s+/g, " ").trim();
}

function sinDuplicados(valores: string[]): string[] {
  return [...new Set(valores)];
}

// "PROD-ARMADO-MAD, INGENIERIA" → ["PROD-ARMADO-MAD", "INGENIERIA"].
export function listaDeAreas(valor: unknown): string[] {
  return sinDuplicados(
    textoNormalizado(valor)
      .split(/\s*,\s*/)
      .map((x) => x.replace(/\.$/, "").trim())
      .filter((x) => x !== "" && x !== "-")
  );
}

// Los muebles se conservan tal cual los escribieron (son códigos y nombres).
export function listaDeMuebles(valor: unknown): string[] {
  return sinDuplicados(
    String(valor ?? "")
      .split(",")
      .map(textoSimple)
      .filter((x) => x !== "" && x !== "-")
  );
}

export function normalizarTipo(valor: unknown): TipoIncidencia | null {
  const clave = textoNormalizado(valor);
  return TIPOS_INCIDENCIA.find((t) => textoNormalizado(t) === clave) ?? null;
}

// Sin estado cuenta como abierto: una incidencia sin cerrar sigue pendiente.
export function normalizarEstado(valor: unknown): EstadoIncidencia {
  return textoNormalizado(valor) === "CERRADO" ? "cerrado" : "abierto";
}

// --- Fechas y semanas --------------------------------------------------------

const DIA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function diaValido(anio: number, mes: number, dia: number): string | null {
  // Años como 0206 (un 2026 mal escrito en el Excel) no se adivinan.
  if (anio < 2000 || anio > 2100) return null;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null;
  return f.toISOString().slice(0, 10);
}

// Fecha del Excel: una fecha de celda (Excel las guarda a medianoche UTC) o un
// texto "dd-mm-aaaa", "dd/mm/aaaa" o "aaaa-mm-dd". Lo que no se entiende da null.
export function fechaDesdeExcel(valor: unknown): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : diaValido(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  }
  const texto = textoSimple(valor);
  const iso = DIA_ISO.exec(texto);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const latino = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(texto);
  if (latino) return diaValido(Number(latino[3]), Number(latino[2]), Number(latino[1]));
  return null;
}

export interface Semana {
  // "2026-W02": se ordena como texto.
  clave: string;
  anio: number;
  numero: number;
  // Lunes y domingo de la semana, "AAAA-MM-DD".
  inicio: string;
  fin: string;
}

const MS_DIA = 86_400_000;

function aDia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Semana ISO (de lunes a domingo; la 1 es la que contiene el primer jueves del
// año): la misma numeración que usa la hoja ESTATUS del Excel.
export function semanaDe(dia: string): Semana | null {
  const m = DIA_ISO.exec(dia);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const lunes = ms - ((new Date(ms).getUTCDay() + 6) % 7) * MS_DIA;
  const jueves = new Date(lunes + 3 * MS_DIA);
  const anio = jueves.getUTCFullYear();
  const numero = Math.floor((jueves.getTime() - Date.UTC(anio, 0, 1)) / (7 * MS_DIA)) + 1;
  return {
    clave: `${anio}-W${String(numero).padStart(2, "0")}`,
    anio,
    numero,
    inicio: aDia(lunes),
    fin: aDia(lunes + 6 * MS_DIA),
  };
}

export interface ConteoSemana extends Semana {
  total: number;
  abiertas: number;
}

// Una fila por semana, desde la primera hasta la última con incidencias, y con
// las semanas sin ninguna en cero (si no, la gráfica "salta" huecos).
export function resumirPorSemana(filas: Incidencia[]): { semanas: ConteoSemana[]; sinFecha: number } {
  const porClave = new Map<string, ConteoSemana>();
  let sinFecha = 0;
  for (const i of filas) {
    const s = i.fecha ? semanaDe(i.fecha) : null;
    if (!s) {
      sinFecha += 1;
      continue;
    }
    const c = porClave.get(s.clave) ?? { ...s, total: 0, abiertas: 0 };
    c.total += 1;
    if (i.estado === "abierto") c.abiertas += 1;
    porClave.set(s.clave, c);
  }
  const existentes = [...porClave.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
  if (existentes.length === 0) return { semanas: [], sinFecha };
  const semanas: ConteoSemana[] = [];
  const ultimo = Date.parse(existentes[existentes.length - 1].inicio);
  for (let ms = Date.parse(existentes[0].inicio); ms <= ultimo; ms += 7 * MS_DIA) {
    const s = semanaDe(aDia(ms))!;
    semanas.push(porClave.get(s.clave) ?? { ...s, total: 0, abiertas: 0 });
  }
  return { semanas, sinFecha };
}

// --- Categoría del motivo ----------------------------------------------------
// Reglas por palabras sobre el texto sin acentos. El orden importa: la primera
// que coincide gana. Es una propuesta: lo que no entra queda "Sin clasificar".

const REGLAS_CATEGORIA: ReadonlyArray<readonly [CategoriaMotivo, RegExp]> = [
  ["Dimensión", /DIMENS|MEDIDA|DESFASE|ESPESOR|PANDE|DESCUADRE|VARIACION|DIMESN/],
  ["Daño", /DAN|ROTO|RAYA|RAYON|DESCONCH|ESTRELL|DESPOST|MANCH|MOJAD|QUEBRAD|FISURA/],
  [
    "Extravío o faltante",
    /EXTRAV|FALT|PERDID|ROBAD|INCOMPLET|NO SE (ENVIO|FABRIC|LAMINO)|SIN COLOCAR|NO ENVIADO|NO FABRIC|DEMASIA|DE MAS/,
  ],
  [
    "Información o diseño",
    /INFORMACI|PLANO|CEDULA|LISTA DE INSUMOS|DISENO|DXF|LEVANTAMIENTO|ARCHIVO|BIBLIA|MODELO|CANTIDAD|CANTIFICACION/,
  ],
  [
    "Acabado",
    /ACABADO|PINTURA|BARNIZ|TONO|TONALIDAD|LAMINAD|VINIL|PELICULA|LIMPIEZA|SUPERFICIE|APARIENCIA|SOLDADURA S\/L/,
  ],
  ["Fabricación o armado", /ARMAD|SOLDAD|MAQUINAD|CORTE|CNC|FABRIC|HABILITA|INSTALAC|COLOCAC|ENSAMBL|BARREN|DOBLEZ/],
  ["Material o herraje", /MATERIAL|HERRAJE|ACRILIC|MDF|CRISTAL|ESPEJO|LED|ELECTR|ACCESORIO|BISAGRA|BROCA|DISCO/],
  ["Proceso o liberación", /TRASPASO|LIBERACION|AUTORIZ|MEJORA|CAMBIO|INDICACION|CANCELAD|NINGUNO|OMISION|MODIFICACION/],
];

export function categoriaDeMotivo(motivo: unknown): CategoriaMotivo {
  const texto = textoNormalizado(motivo);
  if (!texto) return "Sin clasificar";
  for (const [categoria, regla] of REGLAS_CATEGORIA) if (regla.test(texto)) return categoria;
  return "Sin clasificar";
}

// --- Fila del Excel → incidencia ---------------------------------------------

export interface FilaExcelIncidencia {
  tipo: unknown;
  proyecto: unknown;
  mueble: unknown;
  area: unknown;
  motivo: unknown;
  origen: unknown;
  reporta: unknown;
  estado: unknown;
  fecha: unknown;
}

export interface ResultadoFila {
  incidencia: NuevaIncidencia | null;
  // Cosas a revisar a mano; una fila con tipo desconocido no se importa.
  avisos: string[];
}

// `numeroFila` es la fila de la hoja (3 es la primera con datos): junto con la
// línea forma la clave que permite repetir la importación sin duplicar.
export function incidenciaDesdeFilaExcel(linea: Linea, numeroFila: number, fila: FilaExcelIncidencia): ResultadoFila {
  const avisos: string[] = [];
  const tipo = normalizarTipo(fila.tipo);
  if (!tipo) {
    return { incidencia: null, avisos: [`tipo desconocido: "${textoSimple(fila.tipo)}"`] };
  }
  const proyecto = textoNormalizado(fila.proyecto);
  if (!proyecto) avisos.push("sin proyecto");
  const muebles = listaDeMuebles(fila.mueble);
  if (muebles.length === 0) avisos.push("sin mueble");
  // Área y origen del Excel se funden en una sola lista (primero el origen).
  const areas = sinDuplicados([...listaDeAreas(fila.origen), ...listaDeAreas(fila.area)]);
  if (areas.length === 0) avisos.push("sin área");
  const motivo = textoNormalizado(fila.motivo);
  if (!motivo) avisos.push("sin motivo");
  const areasReporta = listaDeAreas(fila.reporta);
  if (areasReporta.length === 0) avisos.push("sin área que reporta");
  if (textoNormalizado(fila.estado) === "") avisos.push("sin estado (se importa como abierto)");
  const fecha = fechaDesdeExcel(fila.fecha);
  if (!fecha) avisos.push(`fecha vacía o no entendida ("${textoSimple(fila.fecha)}")`);

  return {
    incidencia: {
      linea,
      tipo,
      proyecto: proyecto || null,
      muebles,
      areas,
      motivo: motivo || null,
      categoria_motivo: categoriaDeMotivo(motivo),
      areas_reporta: areasReporta,
      estado: normalizarEstado(fila.estado),
      fecha,
      origen_importacion: `${linea}:${numeroFila}`,
    },
    avisos,
  };
}

// --- Filtros y resumen del dashboard -----------------------------------------

export interface FiltrosIncidencias {
  linea: Linea | null;
  tipo: TipoIncidencia | null;
  estado: EstadoIncidencia | null;
  area: string | null;
  proyecto: string | null;
  // Clave de semana ("2026-W02"), o "sin-fecha" para las que no traen fecha.
  semana: string | null;
}

export const SEMANA_SIN_FECHA = "sin-fecha";

export const SIN_FILTROS: FiltrosIncidencias = {
  linea: null,
  tipo: null,
  estado: null,
  area: null,
  proyecto: null,
  semana: null,
};

export function filtrarIncidencias(filas: Incidencia[], f: FiltrosIncidencias): Incidencia[] {
  return filas.filter(
    (i) =>
      (!f.linea || i.linea === f.linea) &&
      (!f.tipo || i.tipo === f.tipo) &&
      (!f.estado || i.estado === f.estado) &&
      (!f.area || i.areas.includes(f.area)) &&
      (!f.proyecto || i.proyecto === f.proyecto) &&
      (!f.semana ||
        (f.semana === SEMANA_SIN_FECHA ? !i.fecha || !semanaDe(i.fecha) : (i.fecha ? semanaDe(i.fecha)?.clave : null) === f.semana))
  );
}

export interface ConteoAbiertos {
  nombre: string;
  total: number;
  abiertas: number;
}

export interface ResumenIncidencias {
  total: number;
  abiertas: number;
  cerradas: number;
  porLinea: Record<Linea, number>;
  porTipo: ConteoAbiertos[];
  // Una incidencia con varias áreas cuenta en cada una (el total no se infla:
  // `total` cuenta incidencias, no áreas).
  porArea: ConteoAbiertos[];
  porAreaQueReporta: ConteoAbiertos[];
  porCategoria: ConteoAbiertos[];
  porMotivo: ConteoAbiertos[];
  porProyecto: ConteoAbiertos[];
  // Pares "nace en → lo detecta": cuántas veces, de mayor a menor.
  cruceAreaReporta: Array<{ area: string; reporta: string; total: number }>;
}

function contar(filas: Incidencia[], claves: (i: Incidencia) => string[]): ConteoAbiertos[] {
  const mapa = new Map<string, ConteoAbiertos>();
  for (const i of filas) {
    for (const nombre of new Set(claves(i))) {
      const c = mapa.get(nombre) ?? { nombre, total: 0, abiertas: 0 };
      c.total += 1;
      if (i.estado === "abierto") c.abiertas += 1;
      mapa.set(nombre, c);
    }
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
}

export function resumirIncidencias(filas: Incidencia[]): ResumenIncidencias {
  const abiertas = filas.filter((i) => i.estado === "abierto").length;
  const cruces = new Map<string, { area: string; reporta: string; total: number }>();
  for (const i of filas) {
    for (const area of new Set(i.areas)) {
      for (const reporta of new Set(i.areas_reporta)) {
        const clave = `${area}\u0000${reporta}`;
        const c = cruces.get(clave) ?? { area, reporta, total: 0 };
        c.total += 1;
        cruces.set(clave, c);
      }
    }
  }
  return {
    total: filas.length,
    abiertas,
    cerradas: filas.length - abiertas,
    porLinea: {
      madera: filas.filter((i) => i.linea === "madera").length,
      metal: filas.filter((i) => i.linea === "metal").length,
    },
    porTipo: contar(filas, (i) => [i.tipo]),
    porArea: contar(filas, (i) => i.areas),
    porAreaQueReporta: contar(filas, (i) => i.areas_reporta),
    porCategoria: contar(filas, (i) => [i.categoria_motivo]),
    porMotivo: contar(filas, (i) => (i.motivo ? [i.motivo] : [])),
    porProyecto: contar(filas, (i) => (i.proyecto ? [i.proyecto] : [])),
    cruceAreaReporta: [...cruces.values()].sort(
      (a, b) => b.total - a.total || a.area.localeCompare(b.area, "es") || a.reporta.localeCompare(b.reporta, "es")
    ),
  };
}

// --- Parámetros de la URL ----------------------------------------------------

export type ParametrosIncidencias = Partial<
  Record<"linea" | "tipo" | "estado" | "area" | "proyecto" | "semana", string>
>;

export function leerFiltrosIncidencias(p: ParametrosIncidencias): FiltrosIncidencias {
  return {
    linea: LINEAS.find((l) => l === p.linea) ?? null,
    tipo: TIPOS_INCIDENCIA.find((t) => t === p.tipo) ?? null,
    estado: ESTADOS_INCIDENCIA.find((e) => e === p.estado) ?? null,
    area: p.area?.trim() || null,
    proyecto: p.proyecto?.trim() || null,
    semana: p.semana && (p.semana === SEMANA_SIN_FECHA || /^\d{4}-W\d{2}$/.test(p.semana)) ? p.semana : null,
  };
}

export function hrefIncidencias(base: string, f: FiltrosIncidencias): string {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(f)) if (valor) q.set(clave, valor);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}
