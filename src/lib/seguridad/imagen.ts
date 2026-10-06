// Validación del contenido real de una imagen subida, ANTES de pasarla a sharp.
//
// El tipo que declara el navegador (file.type) lo controla quien sube el archivo
// y sharp detecta el formato por su cuenta: un SVG, un PDF u otro formato
// disfrazado de PNG llegaría al decodificador (librsvg, etc.), que ha tenido
// vulnerabilidades. Aquí se mira la firma de los primeros bytes y solo se
// aceptan los cuatro formatos de foto que la app necesita.

export type FormatoImagen = "jpeg" | "png" | "webp" | "gif";

// Tope de píxeles que sharp acepta decodificar (evita "bombas" de descompresión:
// un PNG diminuto en disco que ocupa gigabytes al abrirlo). 40 MP cubre cualquier
// cámara de celular.
export const LIMITE_PIXELES = 40_000_000;

export function detectarFormatoImagen(buffer: Buffer | Uint8Array): FormatoImagen | null {
  const b = buffer;
  if (b.length < 12) return null;
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "webp";
  }
  // GIF: "GIF87a" / "GIF89a"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) {
    return "gif";
  }
  return null;
}
