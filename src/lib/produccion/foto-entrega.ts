import sharp from "sharp";
import { detectarFormatoImagen, LIMITE_PIXELES } from "@/lib/seguridad/imagen";

// Foto de la hoja de entrega (papel) que sube el encargado al
// registrar una entrega. Tiene que leerse la letra escrita a mano, así que se
// deja más grande que las imágenes de los ítems, pero acotada: una foto de
// celular (4000 px, 3–8 MB) queda en ~150–400 KB en WebP.
const LADO_MAXIMO = 1800;
const CALIDAD_WEBP = 75;

// Tope de lo que acepta la ruta: el navegador ya la reduce antes de subirla
// (Vercel no recibe cuerpos de más de 4.5 MB).
export const TAMANO_MAXIMO_FOTO = 4 * 1024 * 1024;

// rotate() sin argumentos aplica la orientación EXIF (las fotos de celular
// vienen "acostadas" con una marca de rotación) y la quita de los metadatos.
// Devuelve null si el archivo no es una imagen que sharp pueda leer.
export async function comprimirFotoEntrega(buffer: Buffer): Promise<Buffer | null> {
  // Solo JPG, PNG, WebP o GIF por su contenido real (no por el tipo declarado).
  if (!detectarFormatoImagen(buffer)) return null;
  try {
    return await sharp(buffer, { limitInputPixels: LIMITE_PIXELES })
      .rotate()
      .resize({
        width: LADO_MAXIMO,
        height: LADO_MAXIMO,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: CALIDAD_WEBP })
      .toBuffer();
  } catch {
    return null;
  }
}
