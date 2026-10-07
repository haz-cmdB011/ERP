import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_IMAGENES_ITEMS, rutaImagenGrande } from "./imagenes";

// Borrado DEFINITIVO de un pedido (PM), compartido por la ruta de uno y la de
// varios. Si ninguno de sus ítems tiene folio de Calidad, borra en cascada sus
// versiones/items/imágenes; si ya tiene folio(s), el RPC eliminar_pedido_definitivo
// NO borra nada y lo deja cancelado (ver migración
// preservar_folio_calidad_al_eliminar_pedido). El permiso real lo exige el RPC.
// Excepción: el desarrollador borra de verdad aunque haya folios. Cuando el
// pedido se borra, sus imágenes también se quitan del almacenamiento.
export async function eliminarPedidoDefinitivo(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null; conservadoPorFolio: boolean }> {
  // Rutas de las imágenes, antes de que el borrado en cascada se lleve las filas.
  const { data: imagenes } = await supabase
    .from("planeacion_item_imagenes")
    .select("storage_path, planeacion_items!inner ( pedido_versiones!inner ( pedido_id ) )")
    .eq("planeacion_items.pedido_versiones.pedido_id", id)
    .returns<{ storage_path: string }[]>();

  const { data: conservadoPorFolio, error } = await supabase.rpc("eliminar_pedido_definitivo", {
    p_pedido_id: id,
  });
  if (error) return { error: error.message, conservadoPorFolio: false };

  if (!conservadoPorFolio && imagenes && imagenes.length > 0) {
    // Solo después de que el RPC confirmó el borrado (y validó el permiso).
    // Un fallo aquí no revierte nada: a lo más quedan archivos sueltos.
    const rutas = imagenes.flatMap((i) => [i.storage_path, rutaImagenGrande(i.storage_path)]);
    await createAdminClient().storage.from(BUCKET_IMAGENES_ITEMS).remove(rutas);
  }
  return { error: null, conservadoPorFolio: Boolean(conservadoPorFolio) };
}
