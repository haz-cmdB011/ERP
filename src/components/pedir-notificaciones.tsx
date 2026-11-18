"use client";

import { useSyncExternalStore } from "react";
import { avisar } from "@/components/avisos";
import { useNotificaciones } from "@/lib/notificaciones/use-notificaciones";

// Cuando alguien dice "Ahora no" no se le vuelve a insistir en este navegador; puede activarlas cuando quiera en
// Mi perfil. Se guarda en el navegador (try/catch: en ventanas privadas o con el sitio bloqueado puede fallar).
const CLAVE_DESCARTADO = "erp-pedir-notificaciones-descartado";

const oyentes = new Set<() => void>();
function suscribirDescartado(alCambiar: () => void) {
  oyentes.add(alCambiar);
  return () => {
    oyentes.delete(alCambiar);
  };
}
function leerDescartado(): boolean {
  try {
    return localStorage.getItem(CLAVE_DESCARTADO) === "1";
  } catch {
    return false;
  }
}
function descartar() {
  try {
    localStorage.setItem(CLAVE_DESCARTADO, "1");
  } catch {
    // Sin almacenamiento solo se esconde hasta recargar.
  }
  oyentes.forEach((avisarCambio) => avisarCambio());
}

// Ofrece las notificaciones del navegador al entrar, como cuando una página te pregunta "¿Permitir notificaciones?":
// un recuadro con "Activar" que lanza el permiso real del navegador. Solo sale si todo está listo para activarlas
// (el navegador las soporta, el servidor tiene sus llaves y la persona no las bloqueó ni las tiene ya).
export default function PedirNotificaciones() {
  const { estado, revisando, trabajando, error, activar } = useNotificaciones();
  const descartado = useSyncExternalStore(suscribirDescartado, leerDescartado, () => true);

  if (descartado || revisando || estado !== "sin-activar") return null;

  async function alActivar() {
    if (await activar()) avisar("Notificaciones activadas en este aparato");
  }

  return (
    <div
      role="region"
      aria-label="Notificaciones del navegador"
      className="fixed right-3 top-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] z-50 w-[calc(100vw-1.5rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-2xl print:hidden sm:right-4 sm:top-16"
    >
      <p className="text-sm font-semibold text-slate-900">¿Quieres recibir avisos en este navegador?</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        Te avisaremos de lo importante de tu área (entregas, rechazos, recibos…) aunque no tengas el ERP a la vista. Puedes
        cambiarlo cuando quieras en Mi perfil.
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={descartar}
          disabled={trabajando}
          className="inline-flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-brand-50 disabled:opacity-50 pointer-coarse:min-h-11"
        >
          Ahora no
        </button>
        <button
          type="button"
          onClick={alActivar}
          disabled={trabajando}
          className="inline-flex min-h-9 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
        >
          {trabajando ? "Activando..." : "Activar"}
        </button>
      </div>
    </div>
  );
}
