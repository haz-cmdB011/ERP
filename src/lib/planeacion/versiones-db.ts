import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemComparable } from "./diff-versiones";

const COLUMNAS =
  "id, parent_item_id, item_code, tipo_registro, modelo, descripcion, tipo_material, etapa, nivel, departamento, elevacion, cantidad_x_mueble, unidad, cantidad_total, acabados, observaciones, fila_excel_origen";

// Supabase devuelve a lo más 1000 filas por consulta: se lee por páginas.
const TAMANO_PAGINA = 1000;

interface ItemRow {
  id: string;
  parent_item_id: string | null;
  item_code: number | string;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  etapa: string | null;
  nivel: string | null;
  departamento: string | null;
  elevacion: string | null;
  cantidad_x_mueble: number | string | null;
  unidad: string | null;
  cantidad_total: number | string;
  acabados: string | null;
  observaciones: string | null;
  fila_excel_origen: number | null;
}

// Todos los ítems de una versión de un PM, listos para compararVersiones.
// null si la consulta falla.
export async function cargarItemsVersion(
  supabase: SupabaseClient,
  versionId: string
): Promise<ItemComparable[] | null> {
  const filas: ItemRow[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from("planeacion_items")
      .select(COLUMNAS)
      .eq("pedido_version_id", versionId)
      .order("fila_excel_origen")
      .order("id")
      .range(desde, desde + TAMANO_PAGINA - 1)
      .returns<ItemRow[]>();
    if (error || !data) return null;
    filas.push(...data);
    if (data.length < TAMANO_PAGINA) break;
  }

  return filas.map((r) => ({
    id: r.id,
    parentId: r.parent_item_id,
    itemCode: Number(r.item_code),
    tipoRegistro: r.tipo_registro,
    modelo: r.modelo,
    descripcion: r.descripcion,
    tipoMaterial: r.tipo_material,
    etapa: r.etapa,
    nivel: r.nivel,
    departamento: r.departamento,
    elevacion: r.elevacion,
    cantidadXMueble: r.cantidad_x_mueble === null ? null : Number(r.cantidad_x_mueble),
    unidad: r.unidad,
    cantidadTotal: Number(r.cantidad_total),
    acabados: r.acabados,
    observaciones: r.observaciones,
    fila: r.fila_excel_origen,
  }));
}
