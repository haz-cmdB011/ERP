import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePlaneacionLibro } from "@/lib/planeacion/parser";
import type { FilaError, PlaneacionItemParsed } from "@/lib/planeacion/types";
import {
  comprimirImagenGrande,
  comprimirImagenItem,
  quitarImagenesDelExcel,
} from "@/lib/planeacion/optimizar-almacenamiento";
import { rutaImagenGrande } from "@/lib/planeacion/imagenes";
import { avisoNumeroPM, normalizarNumeroPM } from "@/lib/planeacion/numero-pm";
import { validarItemsParaRecibos } from "@/lib/planeacion/validar-para-recibos";

export const runtime = "nodejs";
// Un Excel grande (muchas imágenes que se comprimen y suben por tandas) tarda.
export const maxDuration = 300;

const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40 MB
// .xlsm (Excel con macros) tiene el mismo formato interno que .xlsx: se lee
// igual y las macros simplemente se ignoran (no se ejecutan).
const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm"];
const CONTENT_TYPE_EXCEL: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
};
const BUCKET_IMAGENES_ITEMS = "planeacion-item-imagenes";

type ItemParaIngesta = Omit<PlaneacionItemParsed, "imagenes"> & {
  imagen_paths: string[];
};

// Un PM (una hoja del Excel) ya ingerido; los campos de la versión vienen
// del RPC ingest_planeacion_version.
interface PedidoCargado {
  hoja: string;
  numero_pedido: string;
  filas: number;
  pedido_id: string;
  pedido_version_id: string;
  numero_version: number;
  items_mo: number;
  items_fu: number;
  // El PM ya existía con otro proyecto o cliente (ej. un error de dedo que se
  // corrigió en el Excel): quedó con el de esta versión.
  proyecto_anterior: { nombre: string; cliente: string } | null;
}

// Cuántos ítems suben sus imágenes al mismo tiempo. Subirlas todas de golpe
// (un Excel grande trae cientos) agota las conexiones de Storage a la base
// de datos: "Too many connections issued to the database".
const SUBIDAS_SIMULTANEAS = 4;
const REINTENTOS_SUBIDA = 4;

// Como Promise.all(items.map(fn)), pero con a lo más `limite` en curso.
async function mapConLimite<T, R>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      resultados[i] = await fn(items[i]);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

// Sube a Storage reintentando con espera creciente: la saturación de
// conexiones es pasajera, así que un error aislado no debe tirar la carga.
async function subirConReintentos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
  cuerpo: Buffer,
  contentType: string
): Promise<{ message: string } | null> {
  let ultimoError: { message: string } | null = null;
  for (let intento = 0; intento < REINTENTOS_SUBIDA; intento++) {
    if (intento > 0) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (intento - 1)));
    }
    const { error } = await supabase.storage
      .from(BUCKET_IMAGENES_ITEMS)
      // upsert: un intento anterior pudo haber subido el archivo aunque
      // respondiera con error.
      .upload(path, cuerpo, { contentType, upsert: true });
    if (!error) return null;
    ultimoError = error;
  }
  return ultimoError;
}

// Las imágenes extraídas por el parser traen el buffer binario en memoria
// (no son jsonb-safe): se suben a Storage aquí, antes de llamar al RPC de
// ingestión, que solo recibe las rutas resultantes.
async function subirImagenesDeItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  // Carpeta del bucket donde quedan las imágenes (la carga, o la carga y la
  // hoja cuando el archivo trae varios PM).
  carpeta: string,
  items: PlaneacionItemParsed[]
): Promise<ItemParaIngesta[]> {
  return mapConLimite(items, SUBIDAS_SIMULTANEAS, async ({ imagenes, ...resto }) => {
    const imagenPaths: string[] = [];
    // Las imágenes de un mismo ítem, una tras otra.
    for (const [indice, imagenOriginal] of imagenes.entries()) {
      // La miniatura (la de las tablas y el visor) se redimensiona antes de
      // subir (ver comprimirImagenItem): el
      // original embebido en el Excel puede pesar varios cientos de KB.
      const imagen = await comprimirImagenItem(
        imagenOriginal.buffer,
        imagenOriginal.extension
      );
      const path = `${carpeta}/${resto.fila_excel_origen}-${indice}.${imagen.extension}`;
      const error = await subirConReintentos(
        supabase,
        path,
        imagen.buffer,
        `image/${imagen.extension === "jpg" ? "jpeg" : imagen.extension}`
      );
      if (error) {
        throw new Error(
          `No se pudo subir una imagen de la fila ${resto.fila_excel_origen}: ${error.message}`
        );
      }

      // Versión grande para la vista ampliada con zoom. Es un extra: si no
      // se pudo generar o subir, la carga sigue y se usará la miniatura.
      const grande = await comprimirImagenGrande(imagenOriginal.buffer);
      if (grande) {
        await subirConReintentos(supabase, rutaImagenGrande(path), grande, "image/webp");
      }
      imagenPaths.push(path);
    }
    return { ...resto, imagen_paths: imagenPaths };
  });
}

// Supabase Storage rechaza keys con acentos, espacios u otros caracteres
// fuera de [A-Za-z0-9._-]. El nombre original se conserva tal cual en
// cargas_archivo.nombre_archivo (columna de texto, sin esa restricción);
// esto solo sanitiza la ruta física del objeto en el bucket.
function extensionDe(nombre: string): string {
  return nombre.slice(nombre.lastIndexOf(".")).toLowerCase();
}

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

  // El navegador sube el Excel directo a Storage (carpeta "entrantes/") y
  // aquí solo llega su ruta: Vercel rechaza cuerpos de más de 4.5 MB, y un
  // Excel con muchas imágenes los pasa fácilmente (el navegador lo veía
  // como "error de red"). Se acepta también el archivo en el cuerpo
  // (multipart) para archivos chicos / desarrollo local.
  let nombreArchivo: string;
  let tamanoBytes: number;
  let buffer: Buffer;
  let rutaEntrante: string | null = null;

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = await request.json().catch(() => null);
    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
    nombreArchivo = typeof body?.nombreArchivo === "string" ? body.nombreArchivo : "";
    // Solo archivos que el propio usuario subió a su carpeta de entrantes.
    if (!storagePath.startsWith(`${user.id}/entrantes/`) || storagePath.includes("..") || !nombreArchivo) {
      return NextResponse.json({ error: "Archivo no válido." }, { status: 400 });
    }
    const { data: descargado, error: descargaError } = await supabase.storage
      .from("cargas-excel")
      .download(storagePath);
    if (descargaError || !descargado) {
      return NextResponse.json(
        { error: `No se pudo leer el archivo subido: ${descargaError?.message ?? "no encontrado"}` },
        { status: 400 }
      );
    }
    rutaEntrante = storagePath;
    buffer = Buffer.from(await descargado.arrayBuffer());
    tamanoBytes = buffer.length;
  } else {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
    }
    nombreArchivo = file.name;
    tamanoBytes = file.size;
    buffer = Buffer.from(await file.arrayBuffer());
  }

  // El original de "entrantes/" ya no se necesita al terminar (se archiva
  // abajo una copia sin imágenes). Service role: Storage no deja borrar al
  // usuario. Si falla, a lo más queda un archivo suelto.
  const limpiarEntrante = async () => {
    if (rutaEntrante) await createAdminClient().storage.from("cargas-excel").remove([rutaEntrante]);
  };

  const extensionValida = ALLOWED_EXTENSIONS.some((ext) =>
    nombreArchivo.toLowerCase().endsWith(ext)
  );
  if (!extensionValida) {
    await limpiarEntrante();
    return NextResponse.json(
      { error: "Formato de archivo no soportado. Solo se aceptan archivos de Excel .xlsx o .xlsm." },
      { status: 400 }
    );
  }

  if (tamanoBytes > MAX_FILE_BYTES) {
    await limpiarEntrante();
    return NextResponse.json(
      { error: `El archivo excede el tamaño máximo permitido (${MAX_FILE_BYTES / (1024 * 1024)} MB).` },
      { status: 400 }
    );
  }

  // 1. Parseo y validación de estructura ANTES de tocar la base de datos.
  //    Usa el buffer ORIGINAL (con imágenes): de ahí es de donde el parser
  //    extrae la imagen de cada fila. Se leen todas las hojas: un mismo
  //    Excel puede traer varios PM (ej. "PEDIDO" y "SDC-1"), uno por hoja.
  const libro = await parsePlaneacionLibro(buffer, { nombreArchivo });

  // El título del PM siempre se guarda como "PM<NUMERO>-<AÑO>", sin importar
  // cómo venga escrito en la celda "No. PEDIDO" o en el nombre del archivo.
  // Si la celda y el nombre del archivo no coinciden en el número de PM, se
  // avisa al terminar la carga (ver avisoNumeroPM).
  const avisoPmPorHoja = new Map<string, string>();
  for (const hoja of libro.hojas) {
    if (hoja.resultado.ok) {
      const opciones = {
        // El nombre del archivo solo aplica a la primera hoja (ver parser).
        nombreArchivo: hoja === libro.hojas[0] ? nombreArchivo : undefined,
        fechaPedido: hoja.resultado.metadata.fecha_pedido,
        // Distingue a los PM sin número por el nombre del archivo.
        proyecto: hoja.resultado.metadata.proyecto_nombre,
      };
      const celda = hoja.resultado.metadata.numero_pedido;
      const pm = normalizarNumeroPM(celda, opciones);
      const aviso = avisoNumeroPM(celda, pm, opciones);
      if (aviso) avisoPmPorHoja.set(hoja.nombreHoja, aviso);
      hoja.resultado.metadata.numero_pedido = pm;
    }
  }

  // Todo o nada al validar: si una hoja tiene errores (o dos hojas dan el
  // mismo PM, que se pisarían como versiones) no se carga ninguna.
  const varias = libro.hojas.length > 1;
  const conHoja = (nombreHoja: string, mensaje: string) =>
    varias ? `Hoja "${nombreHoja}": ${mensaje}` : mensaje;
  const erroresValidacion: FilaError[] = [];
  const hojaPorPm = new Map<string, string>();
  for (const hoja of libro.hojas) {
    if (!hoja.resultado.ok) {
      for (const e of hoja.resultado.errores) {
        erroresValidacion.push({ ...e, mensaje: conHoja(hoja.nombreHoja, e.mensaje) });
      }
      continue;
    }
    const pm = hoja.resultado.metadata.numero_pedido;
    const otraHoja = hojaPorPm.get(pm);
    if (otraHoja) {
      erroresValidacion.push({
        fila: 0,
        mensaje: `Las hojas "${otraHoja}" y "${hoja.nombreHoja}" tienen el mismo No. PEDIDO (${pm}).`,
      });
    }
    hojaPorPm.set(pm, hoja.nombreHoja);
  }
  const filasTotales = libro.hojas.reduce((suma, h) => suma + h.resultado.filasTotales, 0);

  // 2. Subir a Storage, para auditoría y siempre (haya sido válido o no),
  //    una copia del archivo SIN las imágenes embebidas: son puro peso
  //    redundante ahí, porque esas mismas imágenes ya quedan guardadas
  //    (más livianas) por ítem en el paso 3. Los datos/fórmulas/texto del
  //    Excel quedan 100% intactos — solo las imágenes se verían "rotas" si
  //    alguien abre este archivo archivado directamente en Excel.
  const bufferArchivo = await quitarImagenesDelExcel(buffer);
  const storagePath = `${user.id}/${Date.now()}-${sanitizarNombreArchivo(nombreArchivo)}`;
  const { error: storageError } = await supabase.storage
    .from("cargas-excel")
    .upload(storagePath, bufferArchivo, {
      contentType: CONTENT_TYPE_EXCEL[extensionDe(nombreArchivo)] ?? CONTENT_TYPE_EXCEL[".xlsx"],
      upsert: false,
    });

  await limpiarEntrante();

  if (storageError) {
    return NextResponse.json(
      { error: `No se pudo guardar el archivo: ${storageError.message}` },
      { status: 500 }
    );
  }

  const valido = erroresValidacion.length === 0;
  const { data: carga, error: cargaError } = await supabase
    .from("cargas_archivo")
    .insert({
      area: "planeacion",
      nombre_archivo: nombreArchivo,
      storage_path: storagePath,
      tamano_bytes: bufferArchivo.length,
      cargado_por: user.id,
      estado: valido ? "procesando" : "error",
      filas_totales: filasTotales,
      filas_error: valido ? 0 : erroresValidacion.length,
      errores: valido ? null : erroresValidacion,
      procesado_en: valido ? null : new Date().toISOString(),
    })
    .select("id")
    .single();

  if (cargaError || !carga) {
    return NextResponse.json(
      { error: `No se pudo registrar la carga: ${cargaError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  if (!valido) {
    return NextResponse.json(
      {
        error: "El archivo no cumple el formato esperado.",
        detalles: erroresValidacion,
        cargaId: carga.id,
      },
      { status: 422 }
    );
  }

  // 3 y 4. Por cada hoja: subir sus imágenes (el RPC solo recibe jsonb, no
  //    buffers) e ingerirla como su propio PM, vía la función RPC atómica.
  //    Una hoja tras otra; si una falla, las anteriores ya quedaron cargadas
  //    y se reporta cuál falló.
  const pedidos: PedidoCargado[] = [];
  const avisos: FilaError[] = [];
  let errorCarga: string | null = null;

  for (const hoja of libro.hojas) {
    if (!hoja.resultado.ok) continue; // ya validado arriba
    const { metadata, items } = hoja.resultado;

    let itemsParaIngesta: ItemParaIngesta[];
    try {
      // Carpeta por hoja: los números de fila se repiten entre hojas.
      const carpeta = varias ? `${carga.id}/hoja-${hoja.indiceHoja + 1}` : carga.id;
      itemsParaIngesta = await subirImagenesDeItems(supabase, carpeta, items);
    } catch (err) {
      errorCarga = conHoja(hoja.nombreHoja, err instanceof Error ? err.message : "error desconocido");
      break;
    }

    const { data: ingestData, error: ingestError } = await supabase.rpc(
      "ingest_planeacion_version",
      {
        p_proyecto_nombre: metadata.proyecto_nombre,
        p_cliente: metadata.cliente,
        p_numero_pedido: metadata.numero_pedido,
        // ?? null explícito: un valor undefined desaparece al serializar el
        // body de la llamada RPC, y Postgres responde "no encuentra la
        // función" en vez de un error claro sobre el argumento faltante.
        p_fecha_pedido: metadata.fecha_pedido ?? null,
        p_fecha_entrega: metadata.fecha_entrega ?? null,
        p_carga_id: carga.id,
        p_items: itemsParaIngesta,
      }
    );

    if (ingestError) {
      errorCarga = conHoja(hoja.nombreHoja, `No se pudo ingerir el pedido: ${ingestError.message}`);
      break;
    }

    pedidos.push({
      hoja: hoja.nombreHoja,
      numero_pedido: metadata.numero_pedido,
      filas: items.length,
      ...ingestData,
    });
    const avisoPm = avisoPmPorHoja.get(hoja.nombreHoja);
    if (avisoPm) avisos.push({ fila: 0, mensaje: conHoja(hoja.nombreHoja, avisoPm) });
    for (const aviso of hoja.resultado.avisos) {
      avisos.push({ ...aviso, mensaje: conHoja(hoja.nombreHoja, aviso.mensaje) });
    }
    // Datos que luego causan descuadres en el generador de recibos (cantidades
    // negativas, en cero o con decimales, muebles sin modelo, componentes sin
    // padre; ver validar-para-recibos.ts). No bloquean la carga.
    for (const aviso of validarItemsParaRecibos(items)) {
      avisos.push({ ...aviso, mensaje: conHoja(hoja.nombreHoja, aviso.mensaje) });
    }
    const anterior = (ingestData as { proyecto_anterior?: PedidoCargado["proyecto_anterior"] })
      .proyecto_anterior;
    if (anterior) {
      avisos.push({
        fila: 0,
        mensaje: conHoja(
          hoja.nombreHoja,
          `El PM ${metadata.numero_pedido} ya existía con el proyecto «${anterior.nombre}» (cliente ${anterior.cliente}); ahora queda con «${metadata.proyecto_nombre}» (cliente ${metadata.cliente}).`
        ),
      });
    }
  }

  await supabase
    .from("cargas_archivo")
    .update({
      // Con varios PM la carga queda ligada al primero (cada versión de cada
      // PM guarda su carga_id, que es el vínculo que se consulta).
      pedido_id: pedidos[0]?.pedido_id ?? null,
      estado: errorCarga ? "error" : "exitoso",
      filas_exitosas: pedidos.reduce((suma, p) => suma + p.filas, 0),
      filas_error: errorCarga ? 1 : 0,
      // Avisos de datos incompletos (la carga fue exitosa igual) o el error.
      errores: errorCarga
        ? [{ fila: 0, mensaje: errorCarga }, ...avisos]
        : avisos.length > 0
          ? avisos
          : null,
      procesado_en: new Date().toISOString(),
    })
    .eq("id", carga.id);

  if (errorCarga) {
    return NextResponse.json(
      { error: errorCarga, cargaId: carga.id, pedidos, hojasIgnoradas: libro.hojasIgnoradas },
      { status: 500 }
    );
  }

  const [primero] = pedidos;
  return NextResponse.json({
    ok: true,
    cargaId: carga.id,
    avisos,
    hojasIgnoradas: libro.hojasIgnoradas,
    pedidos,
    // Campos del primer PM, como cuando el archivo traía uno solo.
    ...primero,
  });
}
