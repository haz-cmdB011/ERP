import { headers } from "next/headers";

// URL base absoluta del sitio tal como la está viendo quien hizo la
// petición — funciona igual en localhost, previews de Vercel y producción,
// sin necesidad de configurar una variable de entorno aparte. Se usa para
// armar links absolutos (ej. el QR de la Hoja de Viajero, que debe abrir
// la página al escanearlo, no solo mostrar texto).
export async function getBaseUrl(): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol =
    hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
