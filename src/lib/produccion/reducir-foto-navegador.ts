// Reduce en el navegador la foto que toma el encargado antes de subirla: una
// foto de celular pesa 3–8 MB y Vercel no acepta cuerpos de más de 4.5 MB. El
// servidor la vuelve a comprimir (WebP) para guardarla.
const LADO_MAXIMO = 2400;
const CALIDAD_JPEG = 0.85;

export async function reducirFotoEnNavegador(archivo: File): Promise<Blob> {
  // createImageBitmap respeta la orientación EXIF con imageOrientation.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    // Formato que el navegador no sabe abrir (p. ej. HEIC en Windows): se
    // manda tal cual y el servidor decide.
    return archivo;
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.round(bitmap.width * escala);
  const alto = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return archivo;
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG)
  );
  return blob && blob.size < archivo.size ? blob : archivo;
}
