// Cómo está la activación de notificaciones en este aparato y qué decirle a la persona. Lógica sin navegador, para
// poder probarla; la pantalla vive en src/app/cuenta/notificaciones-form.tsx.

import type { Plataforma } from "@/lib/ui/instalar-app";

export type EstadoNotificaciones =
  | "no-soportado" // el navegador no sabe de notificaciones
  | "ios-sin-instalar" // en iPhone solo funcionan con la app instalada
  | "sin-configurar" // el servidor no tiene sus llaves
  | "bloqueado" // la persona las bloqueó en el navegador
  | "sin-activar" // falta tocar "Activar"
  | "activas";

export interface DatosNotificaciones {
  soportado: boolean;
  permiso: NotificationPermission | "no-disponible";
  // Este aparato ya tiene una suscripción guardada en el navegador.
  suscrito: boolean;
  // El servidor tiene la llave pública (NEXT_PUBLIC_VAPID_PUBLIC_KEY).
  configurado: boolean;
  plataforma: Plataforma;
  // Abierta como app instalada.
  enApp: boolean;
}

export function estadoNotificaciones(d: DatosNotificaciones): EstadoNotificaciones {
  // Safari de iPhone ni siquiera ofrece las notificaciones fuera de la app instalada: se dice cómo instalarla.
  if (d.plataforma === "ios" && !d.enApp) return "ios-sin-instalar";
  if (!d.soportado) return "no-soportado";
  if (!d.configurado) return "sin-configurar";
  if (d.permiso === "denied") return "bloqueado";
  if (d.permiso === "granted" && d.suscrito) return "activas";
  return "sin-activar";
}

// La llave pública viaja en base64url y el navegador la pide en bytes.
export function claveVapidABytes(clave: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (clave.length % 4)) % 4);
  const base64 = (clave + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const texto = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(texto.length));
  for (let i = 0; i < texto.length; i++) bytes[i] = texto.charCodeAt(i);
  return bytes;
}
