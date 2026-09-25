import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarPlaneacion } from "@/lib/auth/get-perfil";
import { parsePlaneacionExcel } from "@/lib/planeacion/parser";
import { comprimirImagenGrande } from "@/lib/planeacion/optimizar-almacenamiento";
import { BUCKET_IMAGENES_ITEMS, rutaImagenGrande } from "@/lib/planeacion/imagenes";
import {
  emparejarImagenes,
  enParalelo,
  type ImagenGuardada,
  type ItemGuardado,
} from "@/lib/planeacion/mejorar-imagenes";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB, igual que la carga normal
const SUBIDAS_SIMULTANEAS = 6;

// Genera la versión grande (para el zoom) de las imágenes de una versión de
// pedido YA cargada, a partir del Excel original con sus imágenes. No crea
// versión, ítems ni folios: solo agrega archivos "-hd" junto a las miniaturas
// existentes (el Excel archivado en Storage ya no trae las imágenes, por eso
// hay que volver a subirlo). Es idempotente: las que ya tienen versión grande
// se omiten.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!puedeEditarPlaneacion(perfil)) {
    return NextResponse.json(
      { error: "Solo Planeación (o un desarrollador) puede mejorar las imágenes." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file");
  const numeroVersion = Number(formData.get("version"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Formato de archivo no soportado. Solo se aceptan archivos .xlsx." },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `El archivo excede el tamaño máximo permitido (${MAX_FILE_BYTES / (1024 * 1024)} MB).` },
      { status: 400 }
    );
  }

  // Versión sobre la que se trabaja: la indicada, o la activa.
  const { data: versiones } = await supabase
    .from("pedido_versiones")
    .select("id, numero_version, es_version_activa")
    .eq("pedido_id", id)
    .returns<{ id: string; numero_version: number; es_version_activa: boolean }[]>();
  const version =
    (Number.isFinite(numeroVersion) && versiones?.find((v) => v.numero_version === numeroVersion)) ||
    versiones?.find((v) => v.es_version_activa) ||
    null;
  if (!version) {
    return NextResponse.json({ error: "El pedido no tiene versiones." }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("planeacion_items")
    .select("id, fila_excel_origen, item_code")
    .eq("pedido_version_id", version.id)
    .returns<ItemGuardado[]>();
  const itemIds = (items ?? []).map((i) => i.id);
  const { data: imagenes } = itemIds.length
    ? await supabase
        .from("planeacion_item_imagenes")
        .select("planeacion_item_id, storage_path, orden")
        .in("planeacion_item_id", itemIds)
        .returns<ImagenGuardada[]>()
    : { data: [] as ImagenGuardada[] };

  if (!imagenes || imagenes.length === 0) {
    return NextResponse.json(
      { error: "Esta versión del pedido no tiene imágenes guardadas." },
      { status: 422 }
    );
  }

  let resultado: Awaited<ReturnType<typeof parsePlaneacionExcel>>;
  try {
    resultado = await parsePlaneacionExcel(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el archivo: no parece un Excel (.xlsx) válido." },
      { status: 422 }
    );
  }
  if (!resultado.ok) {
    return NextResponse.json(
      { error: "El archivo no cumple el formato esperado.", detalles: resultado.errores },
      { status: 422 }
    );
  }

  const { pares, itemsSinCoincidencia, imagenesSinRegistro } = emparejarImagenes(
    items ?? [],
    imagenes,
    resultado.items
  );

  if (pares.length === 0) {
    return NextResponse.json(
      {
        error:
          "Este Excel no coincide con la versión seleccionada (los ítems de sus filas no son los mismos) o no trae imágenes. Sube el mismo archivo con el que se cargó esa versión.",
        itemsSinCoincidencia,
      },
      { status: 422 }
    );
  }

  let actualizadas = 0;
  let yaExistian = 0;
  let fallidas = 0;

  await enParalelo(pares, SUBIDAS_SIMULTANEAS, async (par) => {
    const grande = await comprimirImagenGrande(par.buffer);
    if (!grande) {
      fallidas += 1;
      return;
    }
    const { error } = await supabase.storage
      .from(BUCKET_IMAGENES_ITEMS)
      .upload(rutaImagenGrande(par.rutaMiniatura), grande, {
        contentType: "image/webp",
        upsert: false,
      });
    if (!error) {
      actualizadas += 1;
    } else if (/already exists|duplicate/i.test(error.message)) {
      yaExistian += 1;
    } else {
      fallidas += 1;
    }
  });

  return NextResponse.json({
    ok: true,
    version: version.numero_version,
    actualizadas,
    yaExistian,
    fallidas,
    itemsSinCoincidencia,
    imagenesSinRegistro,
  });
}
