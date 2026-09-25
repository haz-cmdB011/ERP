import JSZip from "jszip";
import sharp from "sharp";

// Las imágenes de un ítem se muestran como miniatura (40x40) y, al hacer
// click, ampliadas en un visor — 600px de lado se ve nítido ampliado sin
// cargar el peso completo de la imagen embebida original (algunas superan
// los 400 KB); en WebP quedan en unas decenas de KB.
const LADO_MAXIMO_MINIATURA = 600;
const CALIDAD_WEBP = 80;

// Recomprime una imagen extraída del Excel para guardarla en Storage:
// redimensiona a tamaño de miniatura y la convierte a WebP. Si sharp no
// puede procesarla (formato raro, buffer corrupto), se sube la original
// tal cual en vez de fallar toda la carga por una sola imagen.
export async function comprimirImagenItem(
  buffer: Buffer,
  extensionOriginal: string
): Promise<{ buffer: Buffer; extension: string }> {
  try {
    const comprimida = await sharp(buffer)
      .resize({
        width: LADO_MAXIMO_MINIATURA,
        height: LADO_MAXIMO_MINIATURA,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();
    return { buffer: comprimida, extension: "webp" };
  } catch {
    return { buffer, extension: extensionOriginal };
  }
}

// Versión para la vista ampliada con zoom: mucho más grande que la miniatura
// pero acotada (un original embebido puede superar los 4000 px) para que el
// bucket no se llene. Se guarda aparte de la miniatura, que sigue siendo la
// única que carga en las tablas.
const LADO_MAXIMO_GRANDE = 1600;
const CALIDAD_WEBP_GRANDE = 85;

// Devuelve null si sharp no puede procesar la imagen: la versión grande es un
// extra, así que en ese caso simplemente no se guarda (se usará la miniatura).
export async function comprimirImagenGrande(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .resize({
        width: LADO_MAXIMO_GRANDE,
        height: LADO_MAXIMO_GRANDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD_WEBP_GRANDE })
      .toBuffer();
  } catch {
    return null;
  }
}

// El Excel original archivado en Storage (bucket cargas-excel, para
// auditoría) trae las mismas imágenes que ya extraemos y guardamos aparte
// —más livianas— para mostrarlas en la app: son puro peso redundante ahí.
// Se quitan solo los binarios de xl/media/ (fotos, .wdp) sin tocar ninguna
// otra parte del archivo (hojas, fórmulas, texto, controles, drawings) —
// los datos quedan 100% intactos; solo las imágenes se ven "rotas" si
// alguien abre este archivo archivado directamente en Excel.
export async function quitarImagenesDelExcel(buffer: Buffer): Promise<Buffer> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const rutasMedia = Object.keys(zip.files).filter((ruta) => ruta.startsWith("xl/media/"));
    if (rutasMedia.length === 0) return buffer;

    for (const ruta of rutasMedia) {
      zip.remove(ruta);
    }

    return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  } catch {
    // Si el archivo no se pudo procesar como zip por algún motivo, se
    // archiva tal cual — preservar el original completo es más importante
    // que el ahorro de espacio.
    return buffer;
  }
}
