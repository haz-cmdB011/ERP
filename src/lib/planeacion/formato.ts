import type { FaseTaller } from "./fases-taller";

/**
 * Formato del Excel "PEDIDO DE MANUFACTURA": la referencia es la plantilla
 * PM_v5.xlsm (hoja PEDIDOS, fila 9). Los nombres de plantillas anteriores
 * ("CANT TOTAL", "COMP", "CANTIDAD POR MUEBLE"…) se leen igual y salen como AVISO
 * (recuadro amarillo); la columna COMPONENTE puede faltar (también avisa). Si falta
 * cualquier otra obligatoria con un nombre que no se reconoce, el archivo no se
 * carga y se dice qué columna parece ser. Las columnas no reconocidas se ignoran
 * (suelen ser notas de Planeación), pero se muestran en la vista previa para que
 * se vea qué no entra.
 */

// Normaliza un encabezado para compararlo: sin acentos, mayúsculas y con
// espacios simples. "Cantidad  Total" y "CANTIDAD TOTAL" son el mismo nombre.
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export const COLUMNAS_REQUERIDAS = [
  "ITEM",
  "COMPONENTE",
  "TIPO",
  "MODELO",
  "DESCRIPCION",
  "CANTIDAD X MUEBLE",
  "UNIDAD",
  "CANTIDAD TOTAL",
] as const;

// Nombre de cada fase de taller en la plantilla, por su clave en la app. No se
// usa mientras las fases no se lean (ver FASES_TALLER_COLUMNS).
export const COLUMNA_DE_FASE: Record<FaseTaller, string> = {
  "HAB MAD": "HAB MADERA",
  "HAB MET": "HAB METAL",
  "ENS MAD": "ENSAMBLE MADERA",
  "ENS MET": "ENSAMBLE METAL",
  "ACAB MAD": "ACABADO MADERA",
  "ACAB MET": "ACABADO METAL",
  TAPIZ: "TAPIZ",
  EMPAQUE: "EMPAQUE",
  PT: "PT",
};

export const COLUMNAS_OPCIONALES: readonly string[] = [
  "ETAPA",
  "NIVEL",
  "DEPARTAMENTO",
  "ELEVACION/UBICACION",
  "ACABADOS",
  "OBSERVACIONES",
  "IMAGEN",
  "INGENIERIA",
  "LISTA DE INSUMOS",
  "SUMINISTRO DE MATS",
];

// Nombres que usan plantillas anteriores (o variantes comunes) -> nombre actual (todos ya normalizados). Se
// leen igual, pero cada uno sale como AVISO ("la columna se llama X; se leyó como Y") para que se corrija en el
// Excel: así un PM de una plantilla vieja se carga en vez de rechazarse. Si el nombre exacto también está, manda
// el exacto (el alias solo cubre lo que falta). Los nombres que no están aquí se siguen rechazando, con la columna
// parecida señalada.
const ALIAS_COLUMNAS: Record<string, string> = {
  ELEVACION: "ELEVACION/UBICACION",
  COMP: "COMPONENTE",
  "CANT TOTAL": "CANTIDAD TOTAL",
  "CANT. TOTAL": "CANTIDAD TOTAL",
  TOTAL: "CANTIDAD TOTAL",
  "CANTIDAD POR MUEBLE": "CANTIDAD X MUEBLE",
  "CANT X MUEBLE": "CANTIDAD X MUEBLE",
  "CANT. X MUEBLE": "CANTIDAD X MUEBLE",
  "CANT POR MUEBLE": "CANTIDAD X MUEBLE",
};

// Alias de siempre que no avisan (ya eran aceptados en silencio).
const ALIAS_SIN_AVISO = new Set(["ELEVACION"]);

// Obligatorias que, si faltan, NO impiden cargar: la plantilla anterior no traía la columna COMPONENTE (la
// categoría MOB/FUN/PER). El rol padre/hijo lo decide la forma del ITEM; sin la columna, la categoría queda vacía y
// se avisa.
export const COLUMNAS_TOLERADAS: readonly string[] = ["COMPONENTE"];

// Nombre que se compara con el formato: normalizado y con los alias resueltos.
export function nombreCanonico(texto: string): string {
  const nombre = normalize(texto);
  return ALIAS_COLUMNAS[nombre] ?? nombre;
}

const NOMBRES_CONOCIDOS = new Set<string>(
  [...COLUMNAS_REQUERIDAS, ...COLUMNAS_OPCIONALES].map((nombre) => normalize(nombre))
);

// Columna del encabezado: número de columna (desde 1) y texto tal como está en la celda.
export interface ColumnaEncabezado {
  columna: number;
  texto: string;
}

export interface FaltaColumna {
  nombre: string;
  // Columna no reconocida que parece ser esta (ej. "CANT TOTAL" para CANTIDAD TOTAL).
  sugerida: ColumnaEncabezado | null;
}

// Columna que se leyó por otro nombre (ej. "CANT TOTAL" como CANTIDAD TOTAL).
export interface ColumnaEquivalente extends ColumnaEncabezado {
  nombre: string;
}

export interface DiagnosticoEncabezados {
  faltantes: FaltaColumna[];
  desconocidas: ColumnaEncabezado[];
  // Columnas leídas por un alias (solo las que deben avisar).
  equivalentes: ColumnaEquivalente[];
}

export function letraColumna(numero: number): string {
  let letra = "";
  let n = numero;
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

// Dos palabras "se parecen" si una es prefijo de la otra y tienen al menos 3
// letras: "CANT" ~ "CANTIDAD". Las palabras cortas (DE, EN, X) no cuentan.
function parecida(texto: string, nombre: string): boolean {
  const palabrasNombre = normalize(nombre).split(" ");
  return normalize(texto)
    .split(" ")
    .some((p) =>
      p.length >= 3 &&
      palabrasNombre.some((q) => q.length >= 3 && (p.startsWith(q) || q.startsWith(p)))
    );
}

export function diagnosticarEncabezados(columnas: ColumnaEncabezado[]): DiagnosticoEncabezados {
  const presentes = new Set<string>();
  const usadasComoExactas = new Set<number>();
  // 1.º los nombres exactos: un segundo TIPO no cuenta como otra columna.
  for (const c of columnas) {
    const nombre = normalize(c.texto);
    if (NOMBRES_CONOCIDOS.has(nombre) && !presentes.has(nombre)) {
      presentes.add(nombre);
      usadasComoExactas.add(c.columna);
    }
  }
  // 2.º los alias, solo para lo que no tiene su nombre exacto.
  const equivalentes: ColumnaEquivalente[] = [];
  const usadasComoAlias = new Set<number>();
  for (const c of columnas) {
    if (usadasComoExactas.has(c.columna)) continue;
    const nombre = normalize(c.texto);
    const canonico = ALIAS_COLUMNAS[nombre];
    if (!canonico || presentes.has(canonico)) continue;
    presentes.add(canonico);
    usadasComoAlias.add(c.columna);
    if (!ALIAS_SIN_AVISO.has(nombre)) equivalentes.push({ ...c, nombre: canonico });
  }
  const desconocidas = columnas.filter((c) => !usadasComoExactas.has(c.columna) && !usadasComoAlias.has(c.columna));

  const usadas = new Set<number>();
  const faltantes: FaltaColumna[] = [];
  for (const nombre of COLUMNAS_REQUERIDAS) {
    if (presentes.has(nombre)) continue;
    const sugerida =
      desconocidas.find((c) => !usadas.has(c.columna) && parecida(c.texto, nombre)) ?? null;
    if (sugerida) usadas.add(sugerida.columna);
    faltantes.push({ nombre, sugerida });
  }

  return { faltantes, desconocidas, equivalentes };
}
