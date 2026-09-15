import type { createClient } from "@/lib/supabase/server";

export const BUCKET_IMAGENES_ITEMS = "planeacion-item-imagenes";
const SIGNED_URL_EXPIRES_SECONDS = 3600;

interface ImagenRow {
  planeacion_item_id: string;
  storage_path: string;
  orden: number;
}

// Resuelve las imágenes de un conjunto de ítems a URLs firmadas del bucket
// privado planeacion-item-imagenes (mismo patrón que ya usa la vista de
// detalle de pedido en Planeación) — devuelve un mapa item_id -> URLs, en
// el orden guardado.
export async function getImagenesPorItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[]
): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) return new Map();

  const { data: imagenes } = await supabase
    .from("planeacion_item_imagenes")
    .select("planeacion_item_id, storage_path, orden")
    .in("planeacion_item_id", itemIds)
    .order("orden")
    .returns<ImagenRow[]>();

  const rutasUnicas = Array.from(new Set((imagenes ?? []).map((i) => i.storage_path)));
  const { data: firmadas } = rutasUnicas.length
    ? await supabase.storage
        .from(BUCKET_IMAGENES_ITEMS)
        .createSignedUrls(rutasUnicas, SIGNED_URL_EXPIRES_SECONDS)
    : { data: [] };

  const urlPorRuta = new Map(
    (firmadas ?? [])
      .filter((f): f is typeof f & { signedUrl: string } => !f.error && !!f.signedUrl)
      .map((f) => [f.path, f.signedUrl])
  );

  const imagenesPorItem = new Map<string, string[]>();
  for (const img of imagenes ?? []) {
    const url = urlPorRuta.get(img.storage_path);
    if (!url) continue;
    const lista = imagenesPorItem.get(img.planeacion_item_id) ?? [];
    lista.push(url);
    imagenesPorItem.set(img.planeacion_item_id, lista);
  }
  return imagenesPorItem;
}
