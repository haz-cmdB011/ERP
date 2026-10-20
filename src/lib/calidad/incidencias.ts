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
  // Quién auditó (persona de Calidad que levantó el reporte); nulo si no consta.
  auditor: string | null;
  // Cuándo se cerró (lo fija la base al cerrar); nulo si sigue abierta o si venía cerrada del Excel.
  cerrado_en?: string | null;
  // El texto del reporte (del Excel o escrito en la pantalla): qué se detectó, cómo se resolvió y su
  // control y seguimiento. Texto libre con saltos de línea; nulos si no hay.
  descripcion?: string | null;
  solucion?: string | null;
  seguimiento?: string | null;
}

export const SIN_AUDITOR = "Sin auditor";

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

// Tope de letras de cada texto del reporte (lo mismo que exige la base).
export const MAX_TEXTO_REPORTE = 4000;

// Texto libre del reporte: conserva los saltos de línea, pero sin espacios sobrantes, sin
// líneas en blanco de más y con \n como único salto. Vacío es null.
export function textoLargo(valor: unknown): string | null {
  const texto = String(valor ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto === "" ? null : texto;
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

// "jovani  CAMORLINGA" → "Jovani Camorlinga": así una misma persona escrita con
// otras mayúsculas o espacios cuenta una sola vez. Vacío es null.
export function nombreDePersona(valor: unknown): string | null {
  const texto = textoSimple(valor);
  if (!texto || texto === "-") return null;
  return texto
    .toLocaleLowerCase("es")
    .split(" ")
    .map((p) => p.charAt(0).toLocaleUpperCase("es") + p.slice(1))
    .join(" ");
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

// --- Periodos: día, semana, mes y año ------------------------------------------

export const VISTAS = ["dia", "semana", "mes", "anio"] as const;
export type Vista = (typeof VISTAS)[number];

export function diaValidoIso(valor: string): boolean {
  const m = DIA_ISO.exec(valor);
  return !!m && diaValido(Number(m[1]), Number(m[2]), Number(m[3])) === valor;
}

function aMs(ymd: string): number {
  const m = DIA_ISO.exec(ymd)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function sumarDias(ymd: string, dias: number): string {
  return aDia(aMs(ymd) + dias * MS_DIA);
}

// Primer día del mes `n` meses después (o antes) del mes de `ymd`.
function primerDiaDelMes(ymd: string, n = 0): string {
  const f = new Date(aMs(ymd));
  return aDia(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + n, 1));
}

function ultimoDiaDelMes(ymd: string): string {
  return sumarDias(primerDiaDelMes(ymd, 1), -1);
}

export interface Periodo {
  vista: Vista;
  // Primer y último día incluidos, "AAAA-MM-DD".
  inicio: string;
  fin: string;
  // Un día cualquiera del periodo anterior y del siguiente (para las flechas).
  anterior: string;
  siguiente: string;
}

// El periodo (día, semana de lunes a domingo, mes o año calendario) que
// contiene el día `ref`.
export function periodoDe(vista: Vista, ref: string): Periodo {
  switch (vista) {
    case "dia":
      return { vista, inicio: ref, fin: ref, anterior: sumarDias(ref, -1), siguiente: sumarDias(ref, 1) };
    case "semana": {
      const s = semanaDe(ref)!;
      return { vista, inicio: s.inicio, fin: s.fin, anterior: sumarDias(s.inicio, -7), siguiente: sumarDias(s.inicio, 7) };
    }
    case "mes":
      return {
        vista,
        inicio: primerDiaDelMes(ref),
        fin: ultimoDiaDelMes(ref),
        anterior: primerDiaDelMes(ref, -1),
        siguiente: primerDiaDelMes(ref, 1),
      };
    case "anio": {
      const a = Number(ref.slice(0, 4));
      return { vista, inicio: `${a}-01-01`, fin: `${a}-12-31`, anterior: `${a - 1}-01-01`, siguiente: `${a + 1}-01-01` };
    }
  }
}

export function enPeriodo(fecha: string | null, p: Pick<Periodo, "inicio" | "fin">): boolean {
  return fecha !== null && fecha >= p.inicio && fecha <= p.fin;
}

export function filasDelPeriodo(filas: Incidencia[], p: Pick<Periodo, "inicio" | "fin">): Incidencia[] {
  return filas.filter((i) => enPeriodo(i.fecha, p));
}

export interface Subperiodo {
  // Vista a la que lleva (día dentro de una semana, semana dentro de un mes…).
  vista: Vista;
  // Un día dentro del subperiodo, para el enlace.
  ref: string;
  inicio: string;
  fin: string;
  total: number;
  abiertas: number;
}

// Cómo se reparte un periodo: una semana en sus 7 días, un mes en sus semanas
// (recortadas al mes) y un año en sus 12 meses. Un día no se reparte.
export function desglosarPeriodo(filas: Incidencia[], p: Periodo): Subperiodo[] {
  const rangos: Array<{ vista: Vista; inicio: string; fin: string }> = [];
  if (p.vista === "semana") {
    for (let d = p.inicio; d <= p.fin; d = sumarDias(d, 1)) rangos.push({ vista: "dia", inicio: d, fin: d });
  } else if (p.vista === "mes") {
    for (let lunes = semanaDe(p.inicio)!.inicio; lunes <= p.fin; lunes = sumarDias(lunes, 7)) {
      const fin = sumarDias(lunes, 6);
      rangos.push({ vista: "semana", inicio: lunes < p.inicio ? p.inicio : lunes, fin: fin > p.fin ? p.fin : fin });
    }
  } else if (p.vista === "anio") {
    for (let m = p.inicio; m <= p.fin; m = primerDiaDelMes(m, 1)) {
      rangos.push({ vista: "mes", inicio: m, fin: ultimoDiaDelMes(m) });
    }
  }
  return rangos.map((r) => {
    const dentro = filasDelPeriodo(filas, r);
    return {
      ...r,
      ref: r.inicio,
      total: dentro.length,
      abiertas: dentro.filter((i) => i.estado === "abierto").length,
    };
  });
}

// Con qué día abrir el tablero: hoy si hay incidencias en el periodo de hoy; si
// no, el día de la última incidencia con fecha (para no abrir en una semana
// vacía); y si no hay ninguna, hoy.
export function refPorDefecto(filas: Incidencia[], hoy: string, vista: Vista): string {
  if (filasDelPeriodo(filas, periodoDe(vista, hoy)).length > 0) return hoy;
  const fechas = filas.map((i) => i.fecha).filter((f): f is string => !!f);
  return fechas.length ? fechas.reduce((a, b) => (a > b ? a : b)) : hoy;
}

export interface ConteoAuditor {
  nombre: string;
  total: number;
  abiertas: number;
  cerradas: number;
  // Parte del total de reportes del periodo (0 a 1).
  parte: number;
}

export function resumirPorAuditor(filas: Incidencia[]): ConteoAuditor[] {
  const mapa = new Map<string, ConteoAuditor>();
  for (const i of filas) {
    const nombre = i.auditor ?? SIN_AUDITOR;
    const c = mapa.get(nombre) ?? { nombre, total: 0, abiertas: 0, cerradas: 0, parte: 0 };
    c.total += 1;
    if (i.estado === "abierto") c.abiertas += 1;
    else c.cerradas += 1;
    mapa.set(nombre, c);
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, parte: filas.length === 0 ? 0 : c.total / filas.length }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
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
  auditor: unknown;
  descripcion?: unknown;
  solucion?: unknown;
  seguimiento?: unknown;
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
  const auditor = nombreDePersona(fila.auditor);
  if (!auditor) avisos.push("sin auditor");
  // Los textos del reporte: lo que pase del tope se corta (no ocurre con el Excel actual) y se avisa.
  const textos = (
    [
      ["descripción", fila.descripcion],
      ["solución", fila.solucion],
      ["seguimiento", fila.seguimiento],
    ] as const
  ).map(([nombre, valor]) => {
    const texto = textoLargo(valor);
    if (texto && texto.length > MAX_TEXTO_REPORTE) {
      avisos.push(`${nombre} cortada a ${MAX_TEXTO_REPORTE} letras`);
      return texto.slice(0, MAX_TEXTO_REPORTE);
    }
    return texto;
  });
  if (!textos[0]) avisos.push("sin descripción del reporte");

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
      auditor,
      descripcion: textos[0],
      solucion: textos[1],
      seguimiento: textos[2],
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
  auditor: string | null;
}

export const SIN_FILTROS: FiltrosIncidencias = {
  linea: null,
  tipo: null,
  estado: null,
  area: null,
  proyecto: null,
  auditor: null,
};

export function filtrarIncidencias(filas: Incidencia[], f: FiltrosIncidencias): Incidencia[] {
  return filas.filter(
    (i) =>
      (!f.linea || i.linea === f.linea) &&
      (!f.tipo || i.tipo === f.tipo) &&
      (!f.estado || i.estado === f.estado) &&
      (!f.area || i.areas.includes(f.area)) &&
      (!f.proyecto || i.proyecto === f.proyecto) &&
      (!f.auditor || (i.auditor ?? SIN_AUDITOR) === f.auditor)
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
  Record<"linea" | "tipo" | "estado" | "area" | "proyecto" | "auditor" | "vista" | "ref", string>
>;

export function leerFiltrosIncidencias(p: ParametrosIncidencias): FiltrosIncidencias {
  return {
    linea: LINEAS.find((l) => l === p.linea) ?? null,
    tipo: TIPOS_INCIDENCIA.find((t) => t === p.tipo) ?? null,
    estado: ESTADOS_INCIDENCIA.find((e) => e === p.estado) ?? null,
    area: p.area?.trim() || null,
    proyecto: p.proyecto?.trim() || null,
    auditor: p.auditor?.trim() || null,
  };
}

// Las columnas que se piden a la base para pintar el tablero y para armar su Excel.
export const COLUMNAS_INCIDENCIAS =
  "id, linea, tipo, proyecto, muebles, areas, motivo, categoria_motivo, areas_reporta, estado, fecha, auditor, descripcion, solucion, seguimiento, cerrado_en";

// Los filtros puestos, en palabras: ["Auditor: Luis Corona", "Línea: Madera"]. Vacío si no hay.
export function listaFiltros(f: FiltrosIncidencias): string[] {
  const partes: string[] = [];
  if (f.linea) partes.push(`Línea: ${f.linea === "madera" ? "Madera" : "Metal"}`);
  if (f.tipo) partes.push(`Tipo: ${f.tipo}`);
  if (f.estado) partes.push(`Estado: ${f.estado === "abierto" ? "Abierto" : "Cerrado"}`);
  if (f.auditor) partes.push(`Auditó: ${f.auditor}`);
  if (f.area) partes.push(`Área: ${f.area}`);
  if (f.proyecto) partes.push(`Proyecto: ${f.proyecto}`);
  return partes;
}

// Enlace al tablero con los filtros puestos y, si se da, el periodo que se mira.
export function hrefIncidencias(
  base: string,
  f: FiltrosIncidencias,
  periodo?: { vista: Vista; ref: string }
): string {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(f)) if (valor) q.set(clave, valor);
  if (periodo) {
    q.set("vista", periodo.vista);
    q.set("ref", periodo.ref);
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function leerVista(valor: string | undefined): Vista {
  return VISTAS.find((v) => v === valor) ?? "semana";
}

export function leerRef(valor: string | undefined): string | null {
  return valor && diaValidoIso(valor) ? valor : null;
}

// --- Captura desde la pantalla ------------------------------------------------

// Lo que Calidad escribe en el formulario, tal cual (todo texto).
export interface EntradaIncidencia {
  linea: string;
  tipo: string;
  fecha: string;
  proyecto: string;
  muebles: string;
  areas: string[];
  motivo: string;
  areasReporta: string[];
  auditor: string;
  estado: string;
  // El texto del reporte (opcionales).
  descripcion?: string;
  solucion?: string;
  seguimiento?: string;
}

// Los campos que se guardan al crear o editar una incidencia.
export type CamposIncidencia = Pick<
  Incidencia,
  | "linea"
  | "tipo"
  | "fecha"
  | "proyecto"
  | "muebles"
  | "areas"
  | "motivo"
  | "categoria_motivo"
  | "areas_reporta"
  | "estado"
  | "auditor"
> & { descripcion: string | null; solucion: string | null; seguimiento: string | null };

export const LIMITES = { motivo: 300, proyecto: 200, auditor: 100, muebles: 30, areas: 20, textoMueble: 100 } as const;

export type ResultadoValidacion = { ok: true; campos: CamposIncidencia } | { ok: false; error: string };

// Valida y normaliza lo escrito igual que la importación del Excel (mayúsculas,
// sin acentos, listas sin repetir), para que lo capturado y lo importado se
// cuenten juntos. `hoy` es "AAAA-MM-DD": no se aceptan fechas futuras.
export function validarIncidencia(e: EntradaIncidencia, hoy: string): ResultadoValidacion {
  const linea = LINEAS.find((l) => l === e.linea);
  if (!linea) return { ok: false, error: "Elige la línea (madera o metal)." };
  const tipo = normalizarTipo(e.tipo);
  if (!tipo) return { ok: false, error: "Elige el tipo de reporte." };
  if (!diaValidoIso(e.fecha)) return { ok: false, error: "Escribe la fecha del reporte." };
  if (e.fecha > hoy) return { ok: false, error: "La fecha no puede ser futura." };
  const proyecto = textoNormalizado(e.proyecto);
  if (!proyecto) return { ok: false, error: "Escribe el proyecto." };
  if (proyecto.length > LIMITES.proyecto) return { ok: false, error: `El proyecto es muy largo (máximo ${LIMITES.proyecto} letras).` };
  const motivo = textoNormalizado(e.motivo);
  if (!motivo) return { ok: false, error: "Escribe el motivo." };
  if (motivo.length > LIMITES.motivo) return { ok: false, error: `El motivo es muy largo (máximo ${LIMITES.motivo} letras).` };
  const areas = sinDuplicados(e.areas.flatMap(listaDeAreas));
  if (areas.length === 0) return { ok: false, error: "Elige al menos un área involucrada." };
  if (areas.length > LIMITES.areas) return { ok: false, error: `Demasiadas áreas (máximo ${LIMITES.areas}).` };
  const areasReporta = sinDuplicados(e.areasReporta.flatMap(listaDeAreas));
  if (areasReporta.length > LIMITES.areas) return { ok: false, error: `Demasiadas áreas que reportan (máximo ${LIMITES.areas}).` };
  const muebles = listaDeMuebles(e.muebles);
  if (muebles.length > LIMITES.muebles) return { ok: false, error: `Demasiados muebles (máximo ${LIMITES.muebles}).` };
  if (muebles.some((m) => m.length > LIMITES.textoMueble)) {
    return { ok: false, error: `Un mueble es muy largo (máximo ${LIMITES.textoMueble} letras); sepáralos con comas.` };
  }
  const auditor = nombreDePersona(e.auditor);
  if (!auditor) return { ok: false, error: "Elige quién auditó." };
  if (auditor.length > LIMITES.auditor) return { ok: false, error: "El nombre del auditor es muy largo." };
  const estado = ESTADOS_INCIDENCIA.find((x) => x === e.estado);
  if (!estado) return { ok: false, error: "Elige el estado." };
  const descripcion = textoLargo(e.descripcion);
  const solucion = textoLargo(e.solucion);
  const seguimiento = textoLargo(e.seguimiento);
  for (const [nombre, texto] of [["La descripción", descripcion], ["La solución", solucion], ["El seguimiento", seguimiento]] as const) {
    if (texto && texto.length > MAX_TEXTO_REPORTE) {
      return { ok: false, error: `${nombre} es muy larga (máximo ${MAX_TEXTO_REPORTE} letras).` };
    }
  }

  return {
    ok: true,
    campos: {
      linea,
      tipo,
      fecha: e.fecha,
      proyecto,
      muebles,
      areas,
      motivo,
      categoria_motivo: categoriaDeMotivo(motivo),
      areas_reporta: areasReporta,
      estado,
      auditor,
      descripcion,
      solucion,
      seguimiento,
    },
  };
}

// --- Pendientes viejos --------------------------------------------------------

export interface RangoPendiente {
  etiqueta: string;
  desde: number;
  total: number;
}

export interface PendientesViejos {
  // Abiertas con más de `dias` días desde su fecha.
  total: number;
  // Abiertas sin fecha: no se sabe qué tan viejas son, no entran en la cuenta.
  sinFecha: number;
  rangos: RangoPendiente[];
  porAuditor: ConteoAbiertos[];
  // Las más viejas primero, con los días que llevan abiertas.
  masViejas: Array<Incidencia & { dias: number }>;
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.floor((aMs(hasta) - aMs(desde)) / MS_DIA);
}

const RANGOS_PENDIENTES = [
  { etiqueta: "Más de 30 a 60 días", desde: 31, hasta: 60 },
  { etiqueta: "61 a 90 días", desde: 61, hasta: 90 },
  { etiqueta: "91 a 180 días", desde: 91, hasta: 180 },
  { etiqueta: "Más de 180 días", desde: 181, hasta: Infinity },
] as const;

// Lo abierto que lleva más de `dias` días (30 por defecto) sin cerrarse, al
// día `hoy`: cuántos, de qué antigüedad, de quién y los más viejos.
export function pendientesViejos(filas: Incidencia[], hoy: string, dias = 30, maximoLista = 15): PendientesViejos {
  const abiertas = filas.filter((i) => i.estado === "abierto");
  const viejas = abiertas
    .filter((i): i is Incidencia & { fecha: string } => !!i.fecha)
    .map((i) => ({ ...i, dias: diasEntre(i.fecha, hoy) }))
    .filter((i) => i.dias > dias)
    .sort((a, b) => b.dias - a.dias || a.id.localeCompare(b.id));
  const rangos = RANGOS_PENDIENTES.map((r) => ({
    etiqueta: r.etiqueta,
    desde: r.desde,
    total: viejas.filter((i) => i.dias >= r.desde && i.dias <= r.hasta).length,
  }));
  const porAuditor = contar(viejas, (i) => [i.auditor ?? SIN_AUDITOR]).map((c) => ({ ...c, abiertas: c.total }));
  return {
    total: viejas.length,
    sinFecha: abiertas.filter((i) => !i.fecha).length,
    rangos,
    porAuditor,
    masViejas: viejas.slice(0, maximoLista),
  };
}
