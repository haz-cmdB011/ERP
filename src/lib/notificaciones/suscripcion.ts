// Notificaciones al celular (Web Push): lo que el navegador manda al activarlas y cómo se valida antes de
// guardarlo. Lógica sin base de datos ni navegador, para poder probarla.
//
// Seguridad: el servidor le manda la notificación a la dirección (`endpoint`) que dio el navegador. Si se aceptara
// cualquiera, alguien podría hacer que el servidor pidiera direcciones internas o ajenas (SSRF): por eso solo se
// aceptan las de los servicios de push de los navegadores.

export interface SuscripcionPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Servicios de push de los navegadores: Chrome y Edge de Android o escritorio (Google), Firefox, Safari y Edge (Windows).
const SERVICIOS_PUSH: RegExp[] = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/,
];

export const MAX_LARGO_ENDPOINT = 1024;
// Llaves en base64url (con o sin relleno): la pública mide ~87 caracteres y el secreto de autenticación ~22.
const BASE64_URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function esServicioDePush(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // Solo https, sin usuario ni contraseña en la dirección y sin puerto raro.
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  return SERVICIOS_PUSH.some((patron) => patron.test(url.hostname.toLowerCase()));
}

export type ResultadoSuscripcion = { ok: true; suscripcion: SuscripcionPush } | { ok: false; error: string };

// Valida lo que manda `PushSubscription.toJSON()`: { endpoint, keys: { p256dh, auth } }.
export function validarSuscripcion(entrada: unknown): ResultadoSuscripcion {
  if (!entrada || typeof entrada !== "object") return { ok: false, error: "Falta la suscripción." };
  const { endpoint, keys } = entrada as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } | null };

  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_LARGO_ENDPOINT) {
    return { ok: false, error: "La dirección de la suscripción no es válida." };
  }
  if (!esServicioDePush(endpoint)) {
    return { ok: false, error: "Ese servicio de notificaciones no está permitido." };
  }
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (typeof p256dh !== "string" || p256dh.length < 60 || p256dh.length > 120 || !BASE64_URL.test(p256dh)) {
    return { ok: false, error: "La llave de la suscripción no es válida." };
  }
  if (typeof auth !== "string" || auth.length < 12 || auth.length > 40 || !BASE64_URL.test(auth)) {
    return { ok: false, error: "El secreto de la suscripción no es válido." };
  }
  return { ok: true, suscripcion: { endpoint, p256dh, auth } };
}
