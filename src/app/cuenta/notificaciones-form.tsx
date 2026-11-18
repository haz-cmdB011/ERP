"use client";

import { useState } from "react";
import { avisar } from "@/components/avisos";
import type { EstadoNotificaciones } from "@/lib/notificaciones/estado";
import { mensajeDeError, useNotificaciones } from "@/lib/notificaciones/use-notificaciones";

const TEXTOS: Partial<Record<EstadoNotificaciones, string>> = {
  "no-soportado": "Este navegador no permite notificaciones. Usa Chrome, Edge o Firefox; en iPhone, instala la app.",
  "ios-sin-instalar":
    "En iPhone las notificaciones solo funcionan con la app instalada: toca Compartir → Agregar a inicio, abre la app desde tu pantalla de inicio y vuelve aquí.",
  "sin-configurar": "Las notificaciones todavía no están configuradas en el servidor. Avisa a tu administrador.",
  bloqueado:
    "Bloqueaste las notificaciones de este sitio. Para activarlas: toca el candado junto a la dirección, entra a Permisos o Notificaciones, elige Permitir y recarga esta página.",
};

// Notificaciones del navegador: avisos de lo importante de tu área en la computadora o el celular, aunque no tengas
// el ERP a la vista. Se activan por aparato (y por navegador).
export default function NotificacionesForm() {
  const { estado, revisando, trabajando, error: errorActivar, activar, desactivar } = useNotificaciones();
  const [errorPrueba, setErrorPrueba] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const error = errorPrueba ?? errorActivar;

  async function alActivar() {
    setErrorPrueba(null);
    if (await activar()) avisar("Notificaciones activadas en este aparato");
  }

  async function alDesactivar() {
    setErrorPrueba(null);
    await desactivar();
    avisar("Notificaciones desactivadas en este aparato", "info");
  }

  async function probar() {
    setProbando(true);
    setErrorPrueba(null);
    try {
      const respuesta = await fetch("/api/notificaciones/prueba", { method: "POST" });
      if (!respuesta.ok) throw new Error(await mensajeDeError(respuesta, "No se pudo enviar la prueba."));
      avisar("Te enviamos una notificación de prueba. Debe llegar en unos segundos.", "info");
    } catch (e) {
      setErrorPrueba(e instanceof Error ? e.message : "No se pudo enviar la prueba.");
    } finally {
      setProbando(false);
    }
  }

  const ocupado = trabajando || probando;
  const boton =
    "inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

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
            <button type="button" onClick={probar} disabled={ocupado} className={`${boton} bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}>
              {probando ? "Enviando..." : "Enviar notificación de prueba"}
            </button>
            <button type="button" onClick={alDesactivar} disabled={ocupado} className={`${boton} border border-slate-300 text-slate-700 hover:bg-brand-50`}>
              Desactivar
            </button>
          </div>
        </>
      ) : estado === "sin-activar" ? (
        <>
          <p className="text-sm text-slate-600">
            Recibe avisos de lo importante de tu área en este aparato (computadora o celular), aunque no tengas el ERP a la vista. El navegador te pedirá permiso.
          </p>
          <button type="button" onClick={alActivar} disabled={ocupado} className={`${boton} w-fit bg-brand-500 text-on-brand shadow-sm hover:bg-brand-400`}>
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
