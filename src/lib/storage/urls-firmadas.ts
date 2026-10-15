// URLs firmadas de Storage que se reusan mientras les quede vigencia.
//
// Cada URL firmada lleva su propio token, así que firmar de nuevo en cada visita
// cambia la URL y el navegador vuelve a descargar todas las imágenes aunque ya
// las tenga. Reusar la misma URL deja que las guarde en caché: menos descargas
// de Supabase (el plan gratuito incluye 5 GB al mes) y páginas más rápidas.
//
// La caché vive en la memoria del servidor (una instancia de Vercel atiende
// muchas peticiones seguidas) y no cuesta nada: si la instancia se reinicia,
// solo se vuelve a firmar.
//
// Es compartida entre personas, y es seguro: las rutas siempre salen de una
// consulta hecha con la sesión de quien pide (si el RLS no le deja ver la fila,
// no llega a pedir su URL), y en estos buckets leer el archivo exige lo mismo
// que leer la fila (is_staff()). Solo se guardan firmas que salieron bien: un
// error pasajero no esconde la imagen.

import type { SupabaseClient } from "@supabase/supabase-js";

// Vigencia de cada URL. Se reusa solo mientras le quede al menos REUSO_MINIMO_S,
// para que quien la recibe tenga lo mismo de antes: una hora para navegar.
export const VIGENCIA_URL_S = 2 * 3600;
const REUSO_MINIMO_S = 3600;
const MAX_ENTRADAS = 5000;

export class CacheUrlsFirmadas {
  // clave -> URL y hasta cuándo se reusa (ms).
  private entradas = new Map<string, { url: string; reusarHasta: number }>();

  constructor(private readonly maxEntradas = MAX_ENTRADAS) {}

  obtener(clave: string, ahora: number): string | undefined {
    const e = this.entradas.get(clave);
    if (!e) return undefined;
    if (e.reusarHasta <= ahora) {
      this.entradas.delete(clave);
      return undefined;
    }
    return e.url;
  }

  guardar(clave: string, url: string, ahora: number): void {
    this.entradas.delete(clave);
    this.entradas.set(clave, { url, reusarHasta: ahora + (VIGENCIA_URL_S - REUSO_MINIMO_S) * 1000 });
    // La más vieja sale primero (los Map recuerdan el orden de inserción).
    while (this.entradas.size > this.maxEntradas) {
      const primera = this.entradas.keys().next().value;
      if (primera === undefined) break;
      this.entradas.delete(primera);
    }
  }
}

const cache = new CacheUrlsFirmadas();

/**
 * Firma (o reusa) las URLs de `rutas` en `bucket`. Devuelve ruta -> URL solo de las que se
 * pudieron firmar (las que no existen o fallaron no vienen: la pantalla las muestra sin imagen).
 */
export async function firmarUrls(
  supabase: SupabaseClient,
  bucket: string,
  rutas: string[]
): Promise<Map<string, string>> {
  const ahora = Date.now();
  const urls = new Map<string, string>();
  const faltan: string[] = [];
  for (const ruta of new Set(rutas)) {
    const guardada = cache.obtener(`${bucket}/${ruta}`, ahora);
    if (guardada) urls.set(ruta, guardada);
    else faltan.push(ruta);
  }
  if (faltan.length === 0) return urls;

  const { data: firmadas } = await supabase.storage.from(bucket).createSignedUrls(faltan, VIGENCIA_URL_S);
  for (const f of firmadas ?? []) {
    if (f.error || !f.path || !f.signedUrl) continue;
    urls.set(f.path, f.signedUrl);
    cache.guardar(`${bucket}/${f.path}`, f.signedUrl, ahora);
  }
  return urls;
}
