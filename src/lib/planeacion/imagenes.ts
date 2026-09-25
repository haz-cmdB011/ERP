import type { createClient } from "@/lib/supabase/server";

export const BUCKET_IMAGENES_ITEMS = "planeacion-item-imagenes";
const SIGNED_URL_EXPIRES_SECONDS = 3600;

interface ImagenRow {
  planeacion_item_id: string;
  storage_path: string;
  orden: number;
}

export interface ImagenItemUrls {
  // Miniatura (200 px): la que se muestra en las tablas.
  url: string;
  // Versión grande para la vista ampliada; null en las cargas anteriores a
  // que se guardara (ahí la vista ampliada usa la miniatura).
  urlGrande: string | null;
}

// Ruta de la versión grande de una imagen, por convención junto a la
// miniatura: "carga/12-0.webp" -> "carga/12-0-hd.webp". No hay columna en la
// base: si el archivo no existe, simplemente no se firma y se usa la miniatura.
export function rutaImagenGrande(rutaMiniatura: string): string {
  return rutaMiniatura.replace(/\.[^./]+$/, "") + "-hd.webp";
}

// Igual que getImagenesPorItem, pero cada imagen trae también su versión
// grande (si existe) para la vista ampliada con zoom.
export async function getImagenesConGrandePorItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[]
): Promise<Map<string, ImagenItemUrls[]>> {
  if (itemIds.length === 0) return new Map();

  const { data: imagenes } = await supabase
    .from("planeacion_item_imagenes")
    .select("planeacion_item_id, storage_path, orden")
    .in("planeacion_item_id", itemIds)
    .order("orden")
    .returns<ImagenRow[]>();

  const rutas = Array.from(
    new Set(
      (imagenes ?? []).flatMap((i) => [i.storage_path, rutaImagenGrande(i.storage_path)])
    )
  );
  const { data: firmadas } = rutas.length
    ? await supabase.storage
        .from(BUCKET_IMAGENES_ITEMS)
        .createSignedUrls(rutas, SIGNED_URL_EXPIRES_SECONDS)
    : { data: [] };

  // Las versiones grandes que no existen (cargas viejas) vuelven con error y
  // quedan fuera del mapa.
  const urlPorRuta = new Map(
    (firmadas ?? [])
      .filter((f): f is typeof f & { signedUrl: string } => !f.error && !!f.signedUrl)
      .map((f) => [f.path, f.signedUrl])
  );

  const imagenesPorItem = new Map<string, ImagenItemUrls[]>();
  for (const img of imagenes ?? []) {
    const url = urlPorRuta.get(img.storage_path);
    if (!url) continue;
    const lista = imagenesPorItem.get(img.planeacion_item_id) ?? [];
    lista.push({ url, urlGrande: urlPorRuta.get(rutaImagenGrande(img.storage_path)) ?? null });
    imagenesPorItem.set(img.planeacion_item_id, lista);
  }
  return imagenesPorItem;
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
