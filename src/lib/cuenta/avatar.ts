// Foto de perfil. Vive en un bucket privado ("avatares") bajo la carpeta del
// propio usuario; la ruta vigente se guarda en app_metadata.avatar_path del
// usuario de Auth (solo el servidor puede escribirla; el usuario no puede
// cambiarla desde el navegador). Cada foto nueva usa un nombre nuevo, así el
// navegador nunca muestra una foto vieja desde su caché.

import { createAdminClient } from "@/lib/supabase/admin";

export const BUCKET_AVATARES = "avatares";
export const LADO_AVATAR = 256;
export const MAX_BYTES_FOTO = 2 * 1024 * 1024;
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;

const VIGENCIA_URL_S = 3600;

// La ruta guardada debe estar en la carpeta del propio usuario: evita que
// alguien apunte su perfil a la foto de otra persona.
export function rutaAvatarValida(userId: string, ruta: unknown): ruta is string {
  return (
    typeof ruta === "string" &&
    ruta.startsWith(`${userId}/`) &&
    !ruta.includes("..") &&
    /^[0-9a-f-]{36}\/[\w.-]+\.webp$/i.test(ruta)
  );
}

export function nuevaRutaAvatar(userId: string, ahora: number = Date.now()): string {
  return `${userId}/${ahora}.webp`;
}

// Crea el bucket si todavía no existe (idempotente). Así la función de fotos
// funciona aunque nadie haya aplicado aún la migración del bucket.
export async function asegurarBucketAvatares(): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.createBucket(BUCKET_AVATARES, {
    public: false,
    fileSizeLimit: MAX_BYTES_FOTO,
    allowedMimeTypes: ["image/webp"],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(error.message);
  }
}

// URL firmada de la foto, con caché en memoria mientras sigue vigente (la ruta
// cambia en cada foto nueva, así que nunca queda una URL vieja).
const cache = new Map<string, { url: string; expira: number }>();

export async function urlAvatar(userId: string, ruta: unknown): Promise<string | null> {
  if (!rutaAvatarValida(userId, ruta)) return null;
  const guardada = cache.get(ruta);
  if (guardada && guardada.expira > Date.now()) return guardada.url;

  const { data, error } = await createAdminClient()
    .storage.from(BUCKET_AVATARES)
    .createSignedUrl(ruta, VIGENCIA_URL_S);
  if (error || !data) return null;
  cache.set(ruta, { url: data.signedUrl, expira: Date.now() + (VIGENCIA_URL_S - 600) * 1000 });
  return data.signedUrl;
}
