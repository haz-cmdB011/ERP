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
    // Una imagen se guarda una sola vez por su contenido (ver
    // rutaImagenPorContenido): si otro pedido todavía la usa, se queda.
    const admin = createAdminClient();
    const propias = [...new Set(imagenes.map((i) => i.storage_path))];
    const usadas = new Set<string>();
    // Por tandas: la lista va en la URL de la consulta y un pedido trae cientos.
    for (let i = 0; i < propias.length; i += 100) {
      const { data: enUso, error: errorEnUso } = await admin
        .from("planeacion_item_imagenes")
        .select("storage_path")
        .in("storage_path", propias.slice(i, i + 100))
        .returns<{ storage_path: string }[]>();
      // Sin saber quién más las usa, no se borra ninguna (a lo más quedan sueltas).
      if (errorEnUso) return { error: null, conservadoPorFolio: false };
      for (const fila of enUso ?? []) usadas.add(fila.storage_path);
    }
    const rutas = propias
      .filter((r) => !usadas.has(r))
      .flatMap((r) => [r, rutaImagenGrande(r)]);
    if (rutas.length > 0) await admin.storage.from(BUCKET_IMAGENES_ITEMS).remove(rutas);
  }
  return { error: null, conservadoPorFolio: Boolean(conservadoPorFolio) };
}
