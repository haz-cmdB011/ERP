"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { avisar } from "@/components/avisos";
import { claveVapidABytes, estadoNotificaciones, type EstadoNotificaciones } from "@/lib/notificaciones/estado";
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

// El permiso lo puede cambiar la persona desde los ajustes del navegador: se escucha para que la pantalla lo note.
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

async function suscripcionActual(): Promise<PushSubscription | null> {
  const registro = await navigator.serviceWorker.getRegistration();
  return (await registro?.pushManager.getSubscription()) ?? null;
}

async function mensajeDeError(respuesta: Response, porDefecto: string): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as { error?: string } | null;
  return cuerpo?.error ?? porDefecto;
}

const TEXTOS: Partial<Record<EstadoNotificaciones, string>> = {
  "no-soportado": "Este navegador no permite notificaciones. En Android usa Chrome; en iPhone, instala la app.",
  "ios-sin-instalar":
    "En iPhone las notificaciones solo funcionan con la app instalada: toca Compartir → Agregar a inicio, abre la app desde tu pantalla de inicio y vuelve aquí.",
  "sin-configurar": "Las notificaciones todavía no están configuradas en el servidor. Avisa a tu administrador.",
  bloqueado:
    "Bloqueaste las notificaciones de este sitio. Para activarlas: toca el candado junto a la dirección, entra a Permisos o Notificaciones, elige Permitir y recarga esta página.",
};

// Notificaciones al celular: avisos de lo importante de tu área, aunque tengas la app cerrada. Se activan por aparato.
export default function NotificacionesForm() {
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

  async function activar() {
    setTrabajando(true);
    setError(null);
    try {
      // El service worker (public/sw.js) es quien recibe los avisos; se registra al activar.
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registro = await navigator.serviceWorker.ready;
      const respuestaPermiso = await Notification.requestPermission();
      if (respuestaPermiso !== "granted") {
        if (respuestaPermiso === "default") setError("No elegiste una opción. Toca Activar otra vez y permite las notificaciones.");
        return;
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
      avisar("Notificaciones activadas en este aparato");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudieron activar las notificaciones. Inténtalo de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  async function probar() {
    setTrabajando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/notificaciones/prueba", { method: "POST" });
      if (!respuesta.ok) throw new Error(await mensajeDeError(respuesta, "No se pudo enviar la prueba."));
      avisar("Te enviamos una notificación de prueba. Debe llegar en unos segundos.", "info");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la prueba.");
    } finally {
      setTrabajando(false);
    }
  }

  async function desactivar() {
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
      avisar("Notificaciones desactivadas en este aparato", "info");
    } catch {
      setError("No se pudieron desactivar. Inténtalo de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  const boton =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const revisando = soportado && suscrito === null && estado !== "sin-configurar" && estado !== "bloqueado";

  if (revisando) return <p className="text-sm text-slate-500">Revisando el estado…</p>;

  return (
    <div className="flex flex-col gap-4">
      {estado === "activas" ? (
        <>
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <strong className="font-semibold text-slate-900">Activadas en este aparato.</strong> Te avisaremos de lo importante de tu área.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={probar} disabled={trabajando} className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}>
              {trabajando ? "Enviando..." : "Enviar notificación de prueba"}
            </button>
            <button type="button" onClick={desactivar} disabled={trabajando} className={`${boton} border border-slate-300 text-slate-700 hover:bg-brand-50`}>
              Desactivar
            </button>
          </div>
        </>
      ) : estado === "sin-activar" ? (
        <>
          <p className="text-sm text-slate-600">
            Recibe avisos de lo importante de tu área en el celular, aunque tengas la app cerrada. El navegador te pedirá permiso.
          </p>
          <button type="button" onClick={activar} disabled={trabajando} className={`${boton} w-fit bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}>
            {trabajando ? "Activando..." : "Activar notificaciones"}
          </button>
        </>
      ) : (
        <p className="text-sm leading-relaxed text-slate-600">{TEXTOS[estado]}</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
