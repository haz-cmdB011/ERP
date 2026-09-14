export type TipoRegistroItem = "MO" | "FU";

export interface PlaneacionItemParsed {
  item_code: number;
  tipo_registro: TipoRegistroItem;
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
