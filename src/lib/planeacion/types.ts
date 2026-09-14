export type TipoRegistroItem = "MO" | "FU";

export type CategoriaComponente = "MOBILIARIO" | "FUNCION" | "PERIMETRO";

export interface PlaneacionItemParsed {
  item_code: number;
  // MO (padre) / FU (hijo) se determina por la forma del ITEM (entero vs
  // decimal), no por el texto de la columna COMPONENTE.
  tipo_registro: TipoRegistroItem;
  // Categoría real de la columna COMPONENTE (MOB/MO, FUN/FU, PER...),
  // independiente de si la fila es padre o hijo: un PER puede ser padre,
  // y sus hijos pueden venir etiquetados MOB o FUN indistintamente.
  categoria_componente: CategoriaComponente;
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
