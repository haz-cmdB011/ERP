import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePlaneacionExcel } from "@/lib/planeacion/parser";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_EXTENSIONS = [".xlsx"];

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
  const resultado = await parsePlaneacionExcel(buffer);

  // 2. Subir el archivo original a Storage para auditoría, siempre
  //    (haya sido válido o no), y registrar el intento en cargas_archivo.
  const storagePath = `${user.id}/${Date.now()}-${sanitizarNombreArchivo(file.name)}`;
  const { error: storageError } = await supabase.storage
    .from("cargas-excel")
    .upload(storagePath, buffer, {
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
      tamano_bytes: file.size,
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

  // 3. Ingestión atómica vía función RPC (todo o nada).
  const { data: ingestData, error: ingestError } = await supabase.rpc(
    "ingest_planeacion_version",
    {
      p_proyecto_nombre: resultado.metadata.proyecto_nombre,
      p_cliente: resultado.metadata.cliente,
      p_numero_pedido: resultado.metadata.numero_pedido,
      p_fecha_pedido: resultado.metadata.fecha_pedido,
      p_fecha_entrega: resultado.metadata.fecha_entrega,
      p_carga_id: carga.id,
      p_items: resultado.items,
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
