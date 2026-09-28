import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_IMAGENES_ITEMS, rutaImagenGrande } from "@/lib/planeacion/imagenes";

// Borrado DEFINITIVO de un pedido (PM): si ninguno de sus ítems tiene
// folio de Calidad, borra en cascada sus versiones/items/imágenes (sin
// forma de deshacerlo). Si ya tiene folio(s), el RPC eliminar_pedido_definitivo
// NO borra nada — deja el pedido y sus ítems como "cancelado" para no
// perder ese historial (ver migración preservar_folio_calidad_al_eliminar_pedido).
// El permiso real lo sigue exigiendo el RPC (is_admin() / is_admin_planeacion()).
// Excepción: el desarrollador borra de verdad aunque haya folios (ver
// migración desarrollador_elimina_definitivo). Cuando el pedido se borra, sus
// imágenes también se quitan del almacenamiento.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;

  // Rutas de las imágenes de sus ítems, antes de que el borrado en cascada
  // se lleve las filas que las registran.
  const { data: imagenes } = await supabase
    .from("planeacion_item_imagenes")
    .select("storage_path, planeacion_items!inner ( pedido_versiones!inner ( pedido_id ) )")
    .eq("planeacion_items.pedido_versiones.pedido_id", id)
    .returns<{ storage_path: string }[]>();

  const { data: conservadoPorFolio, error } = await supabase.rpc("eliminar_pedido_definitivo", {
    p_pedido_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (!conservadoPorFolio && imagenes && imagenes.length > 0) {
    // Solo después de que el RPC confirmó el borrado (y validó el permiso).
    // Un fallo aquí no revierte nada: a lo más quedan archivos sueltos.
    const rutas = imagenes.flatMap((i) => [i.storage_path, rutaImagenGrande(i.storage_path)]);
    await createAdminClient().storage.from(BUCKET_IMAGENES_ITEMS).remove(rutas);
  }

  return NextResponse.json({ ok: true, conservadoPorFolio });
}
