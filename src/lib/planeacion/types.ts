import type { FaseTaller } from "./fases-taller";

export type TipoRegistroItem = "MO" | "FU";

export type CategoriaComponente = "MOBILIARIO" | "FUNCION" | "PERIMETRO";

export type EstadoLiberacion = "pendiente" | "enviado_a_produccion";

export interface PlaneacionItemParsed {
  item_code: number;
  // MO (padre) / FU (hijo) se determina por la forma del ITEM (entero vs
  // decimal), no por el texto de la columna COMPONENTE.
  tipo_registro: TipoRegistroItem;
  // Categoría real de la columna COMPONENTE (MOB/MO, FUN/FU, PER...),
  // independiente de si la fila es padre o hijo: un PER puede ser padre,
  // y sus hijos pueden venir etiquetados MOB o FUN indistintamente.
  // Es opcional: algunos proyectos usan esa columna para otra cosa (ej.
  // códigos de modelo) y no siguen esta clasificación en absoluto.
  categoria_componente: CategoriaComponente | null;
  tipo_material: string | null;
  etapa: string | null;
  nivel: string | null;
  departamento: string | null;
  elevacion: string | null;
  modelo: string | null;
  descripcion: string | null;
  cantidad_x_mueble: number | null;
  unidad: string | null;
  cantidad_total: number;
  acabados: string | null;
  observaciones: string | null;
  fila_excel_origen: number;
  // Banderas de validación de Planeación (Filtros Rápidos de Liberación).
  // null = la columna no existe en este archivo (no todos los PM la traen),
  // distinto de false = existe y está marcada como no cumplida.
  ingenieria: boolean | null;
  lista_insumos: string | null;
  suministro_mats: boolean | null;
  // Solo incluye las fases cuya columna existe en el archivo.
  fases_taller: Partial<Record<FaseTaller, boolean>>;
}

export interface PlaneacionMetadata {
  proyecto_nombre: string;
  cliente: string;
  numero_pedido: string;
  fecha_pedido: string | null; // ISO date (YYYY-MM-DD)
  fecha_entrega: string | null; // ISO date (YYYY-MM-DD)
}

export interface FilaError {
  fila: number;
  mensaje: string;
}

export interface ParseResultOk {
  ok: true;
  metadata: PlaneacionMetadata;
  items: PlaneacionItemParsed[];
  filasTotales: number;
}

export interface ParseResultError {
  ok: false;
  errores: FilaError[];
  filasTotales: number;
}

export type ParseResult = ParseResultOk | ParseResultError;
