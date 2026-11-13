// Mandar notificaciones al celular (Web Push). Solo para código de servidor: usa la llave privada.
//
// Hace falta configurar en el servidor (ver .env.example y docs/operacion.md): NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY y VAPID_SUBJECT. Sin ellas todo sigue funcionando, solo que no se manda nada.

import { sendNotification } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarCarga, type Notificacion } from "./carga";
import type { SuscripcionPush } from "./suscripcion";

// Lo que el servicio de push responde cuando la suscripción ya no existe (la persona la quitó o desinstaló la app).
const CODIGOS_CADUCADA = [404, 410];

interface ConfiguracionVapid {
  publica: string;
  privada: string;
  contacto: string;
}

// Quién manda las notificaciones (lo piden los servicios de push): un correo "mailto:" o una dirección https.
function contactoVapid(): string | null {
  const definido = process.env.VAPID_SUBJECT?.trim();
  if (definido && /^(mailto:|https:\/\/)/.test(definido)) return definido;
  const sitio = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return sitio && /^https:\/\//.test(sitio) ? sitio : null;
}

export function leerConfiguracionVapid(): ConfiguracionVapid | null {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privada = process.env.VAPID_PRIVATE_KEY?.trim();
  const contacto = contactoVapid();
  return publica && privada && contacto ? { publica, privada, contacto } : null;
}

export function notificacionesConfiguradas(): boolean {
  return leerConfiguracionVapid() !== null;
}

export interface ResultadoEnvio {
  enviadas: number;
  // Direcciones que el servicio de push dijo que ya no existen: hay que borrarlas.
  caducadas: string[];
  fallidas: number;
}

// Manda una notificación a esas suscripciones. No lanza: cuenta lo que salió bien, lo que caducó y lo que falló.
export async function enviarASuscripciones(suscripciones: SuscripcionPush[], notificacion: Notificacion): Promise<ResultadoEnvio> {
  const resultado: ResultadoEnvio = { enviadas: 0, caducadas: [], fallidas: 0 };
  const config = leerConfiguracionVapid();
  if (!config) return { ...resultado, fallidas: suscripciones.length };

  const carga = armarCarga(notificacion);
  const opciones = {
    vapidDetails: { subject: config.contacto, publicKey: config.publica, privateKey: config.privada },
    TTL: 60 * 60,
    urgency: "normal" as const,
    timeout: 10_000,
  };

  const respuestas = await Promise.allSettled(
    suscripciones.map((s) => sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, opciones))
  );
  respuestas.forEach((r, i) => {
    if (r.status === "fulfilled") {
      resultado.enviadas += 1;
      return;
    }
    const codigo = (r.reason as { statusCode?: number } | null)?.statusCode;
    if (codigo && CODIGOS_CADUCADA.includes(codigo)) resultado.caducadas.push(suscripciones[i].endpoint);
    else {
      resultado.fallidas += 1;
      console.error("notificaciones: no se pudo enviar", codigo ?? (r.reason as Error | undefined)?.message);
    }
  });
  return resultado;
}

// Manda una notificación a todos los aparatos de esas personas (para los avisos de cada área) y limpia las
// suscripciones que ya no sirven. Lee con la clave de servicio: solo se llama desde rutas de servidor.
export async function enviarAUsuarios(usuarioIds: string[], notificacion: Notificacion): Promise<ResultadoEnvio> {
  const vacio: ResultadoEnvio = { enviadas: 0, caducadas: [], fallidas: 0 };
  if (usuarioIds.length === 0 || !notificacionesConfiguradas()) return vacio;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("suscripciones_push")
    .select("endpoint, p256dh, auth")
    .in("user_id", usuarioIds)
    .returns<SuscripcionPush[]>();
  if (error) {
    console.error("notificaciones: no se pudieron leer las suscripciones", error.message);
    return vacio;
  }
  const resultado = await enviarASuscripciones(data ?? [], notificacion);
  if (resultado.caducadas.length > 0) {
    await admin.from("suscripciones_push").delete().in("endpoint", resultado.caducadas);
  }
  return resultado;
}
