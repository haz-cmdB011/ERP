import type { FaseTaller } from "./fases-taller";

/**
 * Formato del Excel "PEDIDO DE MANUFACTURA": los nombres de las columnas son
 * fijos. La referencia es la plantilla PM_v5.xlsm (hoja PEDIDOS, fila 9). Si
 * falta una obligatoria, el archivo no se carga. Las no reconocidas se ignoran
 * (suelen ser notas de Planeación), pero se muestran en la vista previa para
 * que se vea qué no entra.
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

// Nombres de archivos anteriores a la plantilla -> nombre actual (ya
// normalizados). Se siguen aceptando para no rechazar archivos viejos.
const ALIAS_COLUMNAS: Record<string, string> = {
  ELEVACION: "ELEVACION/UBICACION",
};

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

export interface DiagnosticoEncabezados {
  faltantes: FaltaColumna[];
  desconocidas: ColumnaEncabezado[];
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
  const desconocidas: ColumnaEncabezado[] = [];
  for (const c of columnas) {
    const nombre = nombreCanonico(c.texto);
    // Un nombre repetido (ej. un segundo TIPO) no cuenta como otra columna.
    if (NOMBRES_CONOCIDOS.has(nombre) && !presentes.has(nombre)) {
      presentes.add(nombre);
    } else {
      desconocidas.push(c);
    }
  }

  const usadas = new Set<number>();
  const faltantes: FaltaColumna[] = [];
  for (const nombre of COLUMNAS_REQUERIDAS) {
    if (presentes.has(nombre)) continue;
    const sugerida =
      desconocidas.find((c) => !usadas.has(c.columna) && parecida(c.texto, nombre)) ?? null;
    if (sugerida) usadas.add(sugerida.columna);
    faltantes.push({ nombre, sugerida });
  }

  return { faltantes, desconocidas };
}
