import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePlaneacionExcel } from "@/lib/planeacion/parser";
import type { PlaneacionItemParsed } from "@/lib/planeacion/types";
import {
  comprimirImagenGrande,
  comprimirImagenItem,
  quitarImagenesDelExcel,
} from "@/lib/planeacion/optimizar-almacenamiento";
import { rutaImagenGrande } from "@/lib/planeacion/imagenes";
import { normalizarNumeroPM } from "@/lib/planeacion/numero-pm";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = [".xlsx"];
const BUCKET_IMAGENES_ITEMS = "planeacion-item-imagenes";

type ItemParaIngesta = Omit<PlaneacionItemParsed, "imagenes"> & {
  imagen_paths: string[];
};

// Las imágenes extraídas por el parser traen el buffer binario en memoria
// (no son jsonb-safe): se suben a Storage aquí, antes de llamar al RPC de
// ingestión, que solo recibe las rutas resultantes.
async function subirImagenesDeItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cargaId: string,
  items: PlaneacionItemParsed[]
): Promise<ItemParaIngesta[]> {
  return Promise.all(
    items.map(async ({ imagenes, ...resto }) => {
      const imagenPaths = await Promise.all(
        imagenes.map(async (imagenOriginal, indice) => {
          // La miniatura (la de las tablas y el visor) se redimensiona antes de
          // subir (ver comprimirImagenItem): el
          // original embebido en el Excel puede pesar varios cientos de KB.
          const imagen = await comprimirImagenItem(
            imagenOriginal.buffer,
            imagenOriginal.extension
          );
          const path = `${cargaId}/${resto.fila_excel_origen}-${indice}.${imagen.extension}`;
          const { error } = await supabase.storage
            .from(BUCKET_IMAGENES_ITEMS)
            .upload(path, imagen.buffer, {
              contentType: `image/${imagen.extension === "jpg" ? "jpeg" : imagen.extension}`,
              upsert: false,
            });
          if (error) {
            throw new Error(
              `No se pudo subir una imagen de la fila ${resto.fila_excel_origen}: ${error.message}`
            );
          }

          // Versión grande para la vista ampliada con zoom. Es un extra: si no
          // se pudo generar o subir, la carga sigue y se usará la miniatura.
          const grande = await comprimirImagenGrande(imagenOriginal.buffer);
          if (grande) {
            await supabase.storage
              .from(BUCKET_IMAGENES_ITEMS)
              .upload(rutaImagenGrande(path), grande, {
                contentType: "image/webp",
                upsert: false,
              });
          }
          return path;
        })
      );
      return { ...resto, imagen_paths: imagenPaths };
    })
  );
}

// Supabase Storage rechaza keys con acentos, espacios u otros caracteres
// fuera de [A-Za-z0-9._-]. El nombre original se conserva tal cual en
// cargas_archivo.nombre_archivo (columna de texto, sin esa restricción);
// esto solo sanitiza la ruta física del objeto en el bucket.
function sanitizarNombreArchivo(nombre: string): string {
  const normalizado = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita acentos
  return normalizado.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  }

  const extensionValida = ALLOWED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );
  if (!extensionValida) {
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

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 1. Parseo y validación de estructura ANTES de tocar la base de datos.
  //    Usa el buffer ORIGINAL (con imágenes): de ahí es de donde el parser
  //    extrae la imagen de cada fila.
  const resultado = await parsePlaneacionExcel(buffer);

  // El título del PM siempre se guarda como "PM<NUMERO>-<AÑO>", sin importar
  // cómo venga escrito en la celda "No. PEDIDO" o en el nombre del archivo.
  if (resultado.ok) {
    resultado.metadata.numero_pedido = normalizarNumeroPM(resultado.metadata.numero_pedido, {
      nombreArchivo: file.name,
      fechaPedido: resultado.metadata.fecha_pedido,
    });
  }

  // 2. Subir a Storage, para auditoría y siempre (haya sido válido o no),
  //    una copia del archivo SIN las imágenes embebidas: son puro peso
  //    redundante ahí, porque esas mismas imágenes ya quedan guardadas
  //    (más livianas) por ítem en el paso 3. Los datos/fórmulas/texto del
  //    Excel quedan 100% intactos — solo las imágenes se verían "rotas" si
  //    alguien abre este archivo archivado directamente en Excel.
  const bufferArchivo = await quitarImagenesDelExcel(buffer);
  const storagePath = `${user.id}/${Date.now()}-${sanitizarNombreArchivo(file.name)}`;
  const { error: storageError } = await supabase.storage
    .from("cargas-excel")
    .upload(storagePath, bufferArchivo, {
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });

  if (storageError) {
    return NextResponse.json(
      { error: `No se pudo guardar el archivo: ${storageError.message}` },
      { status: 500 }
    );
  }

  const { data: carga, error: cargaError } = await supabase
    .from("cargas_archivo")
    .insert({
      area: "planeacion",
      nombre_archivo: file.name,
      storage_path: storagePath,
      tamano_bytes: bufferArchivo.length,
      cargado_por: user.id,
      estado: resultado.ok ? "procesando" : "error",
      filas_totales: resultado.filasTotales,
      filas_error: resultado.ok ? 0 : resultado.errores.length,
      errores: resultado.ok ? null : resultado.errores,
      procesado_en: resultado.ok ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (cargaError || !carga) {
    return NextResponse.json(
      { error: `No se pudo registrar la carga: ${cargaError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  if (!resultado.ok) {
    return NextResponse.json(
      {
        error: "El archivo no cumple el formato esperado.",
        detalles: resultado.errores,
        cargaId: carga.id,
      },
      { status: 422 }
    );
  }

  // 3. Subir a Storage las imágenes embebidas de cada fila, ANTES de la
  //    ingestión: el RPC solo recibe jsonb (rutas de texto), no buffers.
  let itemsParaIngesta: ItemParaIngesta[];
  try {
    itemsParaIngesta = await subirImagenesDeItems(supabase, carga.id, resultado.items);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "error desconocido";
    await supabase
      .from("cargas_archivo")
      .update({
        estado: "error",
        errores: [{ fila: 0, mensaje }],
        procesado_en: new Date().toISOString(),
      })
      .eq("id", carga.id);

    return NextResponse.json({ error: mensaje, cargaId: carga.id }, { status: 500 });
  }

  // 4. Ingestión atómica vía función RPC (todo o nada).
  const { data: ingestData, error: ingestError } = await supabase.rpc(
    "ingest_planeacion_version",
    {
      p_proyecto_nombre: resultado.metadata.proyecto_nombre,
      p_cliente: resultado.metadata.cliente,
      p_numero_pedido: resultado.metadata.numero_pedido,
      // ?? null explícito: un valor undefined desaparece al serializar el
      // body de la llamada RPC, y Postgres responde "no encuentra la
      // función" en vez de un error claro sobre el argumento faltante.
      p_fecha_pedido: resultado.metadata.fecha_pedido ?? null,
      p_fecha_entrega: resultado.metadata.fecha_entrega ?? null,
      p_carga_id: carga.id,
      p_items: itemsParaIngesta,
    }
  );

  if (ingestError) {
    await supabase
      .from("cargas_archivo")
      .update({
        estado: "error",
        errores: [{ fila: 0, mensaje: ingestError.message }],
        procesado_en: new Date().toISOString(),
      })
      .eq("id", carga.id);

    return NextResponse.json(
      { error: `No se pudo ingerir el pedido: ${ingestError.message}`, cargaId: carga.id },
      { status: 500 }
    );
  }

  await supabase
    .from("cargas_archivo")
    .update({
      pedido_id: ingestData.pedido_id,
      estado: "exitoso",
      filas_exitosas: resultado.items.length,
      filas_error: 0,
      procesado_en: new Date().toISOString(),
    })
    .eq("id", carga.id);

  return NextResponse.json({
    ok: true,
    cargaId: carga.id,
    ...ingestData,
  });
}
