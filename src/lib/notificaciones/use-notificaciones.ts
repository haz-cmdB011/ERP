"use client";

// Las notificaciones del navegador vistas desde el aparato: si están activas, activarlas y desactivarlas. Lo usan
// la sección de Mi perfil (notificaciones-form.tsx) y el aviso que las ofrece al entrar (pedir-notificaciones.tsx),
// para que los dos hagan exactamente lo mismo. La lógica sin navegador está en estado.ts.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { claveVapidABytes, estadoNotificaciones, type EstadoNotificaciones } from "./estado";
import { plataformaDe, type Plataforma } from "@/lib/ui/instalar-app";

// Llave pública del servidor para las notificaciones (se genera una vez; ver docs/operacion.md). Sin ella no se puede activar.
const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

type Permiso = NotificationPermission | "no-disponible";

// Lo que se lee del aparato no cambia mientras la pantalla está abierta (salvo el permiso, ver suscribirPermiso).
function suscribirNada() {
  return () => {};
}
const leerPlataforma = (): Plataforma => plataformaDe(navigator.userAgent, navigator.maxTouchPoints);
const leerEnApp = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
const leerSoportado = (): boolean => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const leerPermiso = (): Permiso => ("Notification" in window ? Notification.permission : "no-disponible");

// El permiso lo puede cambiar la persona desde los ajustes del navegador (el candado junto a la dirección): se
// escucha para que la pantalla lo note. Al activar desde aquí el navegador también avisa por este camino.
function suscribirPermiso(alCambiar: () => void) {
  let vivo = true;
  let estado: PermissionStatus | null = null;
  navigator.permissions
    ?.query({ name: "notifications" as PermissionName })
    .then((s) => {
      if (!vivo) return;
      estado = s;
      s.addEventListener("change", alCambiar);
    })
    .catch(() => {});
  return () => {
    vivo = false;
    estado?.removeEventListener("change", alCambiar);
  };
}

export async function suscripcionActual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration();
  return (await registro?.pushManager.getSubscription()) ?? null;
}

export async function mensajeDeError(respuesta: Response, porDefecto: string): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
  return cuerpo?.error ?? porDefecto;
}

export interface Notificaciones {
  estado: EstadoNotificaciones;
  // Todavía se está revisando si este aparato ya tiene una suscripción.
  revisando: boolean;
  trabajando: boolean;
  error: string | null;
  // Lanza el permiso del navegador. Devuelve true si quedaron activadas.
  activar: () => Promise<boolean>;
  desactivar: () => Promise<void>;
}

export function useNotificaciones(): Notificaciones {
  const plataforma = useSyncExternalStore(suscribirNada, leerPlataforma, () => "otra" as Plataforma);
  const enApp = useSyncExternalStore(suscribirNada, leerEnApp, () => false);
  const soportado = useSyncExternalStore(suscribirNada, leerSoportado, () => false);
  const permiso = useSyncExternalStore(suscribirPermiso, leerPermiso, () => "no-disponible" as Permiso);

  // null = todavía se está revisando si este aparato ya tiene una suscripción.
  const [suscrito, setSuscrito] = useState<boolean | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!soportado) return;
    let vivo = true;
    suscripcionActual()
      .then((s) => vivo && setSuscrito(s !== null))
      .catch(() => vivo && setSuscrito(false));
    return () => {
      vivo = false;
    };
  }, [soportado]);

  const estado = estadoNotificaciones({
    soportado,
    permiso,
    suscrito: suscrito === true,
    configurado: CLAVE_PUBLICA.length > 0,
    plataforma,
    enApp,
  });
  const revisando = soportado && suscrito === null && estado !== "sin-configurar" && estado !== "bloqueado";

  const activar = useCallback(async (): Promise<boolean> => {
    setTrabajando(true);
    setError(null);
    try {
      // El service worker (public/sw.js) es quien recibe los avisos; se registra al activar.
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registro = await navigator.serviceWorker.ready;
      const respuestaPermiso = await Notification.requestPermission();
      if (respuestaPermiso !== "granted") {
        if (respuestaPermiso === "default") setError("No elegiste una opción. Toca Activar otra vez y permite las notificaciones.");
        return false;
      }
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveVapidABytes(CLAVE_PUBLICA) }));
      const respuesta = await fetch("/api/notificaciones/suscribir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(suscripcion.toJSON()),
      });
      if (!respuesta.ok) {
        // Si el servidor no la guardó no sirve de nada tenerla en el aparato.
        await suscripcion.unsubscribe().catch(() => {});
        throw new Error(await mensajeDeError(respuesta, "No se pudieron activar las notificaciones."));
      }
      setSuscrito(true);
      return true;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudieron activar las notificaciones. Inténtalo de nuevo.");
      return false;
    } finally {
      setTrabajando(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setTrabajando(true);
    setError(null);
    try {
      const suscripcion = await suscripcionActual();
      if (suscripcion) {
        await fetch("/api/notificaciones/suscribir", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        });
        await suscripcion.unsubscribe();
      }
      setSuscrito(false);
    } catch {
      setError("No se pudieron desactivar. Inténtalo de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }, []);

  return { estado, revisando, trabajando, error, activar, desactivar };
}
