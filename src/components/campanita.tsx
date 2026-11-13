"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/http/fetch-json";
import { tiempoRelativo, type AreaAviso, type Aviso } from "@/lib/notificaciones/avisos";
import { usePresencia } from "@/lib/ui/use-presencia";

// Cada cuánto vuelve a preguntar por avisos nuevos (solo con la pestaña a la vista).
const CADA_MS = 60_000;

interface Respuesta {
  disponible: boolean;
  avisos: Aviso[];
  noLeidos: number;
}

// Campanita de la barra: los avisos importantes del área (se liberó un mueble, hubo una entrega, Calidad
// aprobó o rechazó, llegó un recibo…). Se esconde sola si la base todavía no tiene los avisos. Los mismos
// avisos le llegan al celular como notificación si la persona las activó en Mi perfil.
export default function Campanita({ area }: { area: AreaAviso }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const { montado, saliendo } = usePresencia(abierto);

  const cargar = useCallback(async () => {
    // Sin conexión o con un error se queda con lo último que tenía.
    const r = await fetchJson<Respuesta>(`/api/avisos?area=${area}`, { cache: "no-store", esperaMs: 15_000 });
    if (r.ok) setDatos(r.data);
  }, [area]);

  // Al entrar, al volver a la pestaña y cada minuto mientras está a la vista.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga de datos al montar la campanita
    void cargar();
    const alVolver = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    const reloj = window.setInterval(alVolver, CADA_MS);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(reloj);
    };
  }, [cargar]);

  // Esc cierra el panel.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  if (!datos?.disponible) return null;

  const { avisos, noLeidos } = datos;

  // Marca como leídos (se ve al instante; si falla, la próxima lectura lo corrige).
  function marcarLeidos(ids: string[]) {
    if (ids.length === 0) return;
    const marcados = new Set(ids);
    setDatos((d) =>
      d
        ? {
            ...d,
            avisos: d.avisos.map((a) => (marcados.has(a.id) ? { ...a, leido: true } : a)),
            noLeidos: d.avisos.filter((a) => !a.leido && !marcados.has(a.id)).length,
          }
        : d
    );
    void fetchJson("/api/avisos/leer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      keepalive: true,
    });
  }

  function abrir() {
    setAbierto(true);
    void cargar();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        title={noLeidos > 0 ? `${noLeidos} aviso${noLeidos === 1 ? "" : "s"} sin leer` : "Avisos"}
        aria-label={noLeidos > 0 ? `Avisos, ${noLeidos} sin leer` : "Avisos"}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-nav-suave transition-colors hover:bg-nav-hover hover:text-on-nav focus-visible:outline-brand-500 sm:h-10 sm:w-10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[22px] w-[22px]"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {noLeidos > 0 && (
          <span className="anim-aviso absolute right-0 top-0 min-w-[1.125rem] rounded-full bg-rose-600 px-1 py-0.5 text-center text-[0.65rem] font-bold leading-none text-white">
            {noLeidos > 9 ? "9+" : noLeidos}
          </span>
        )}
      </button>

      {montado && (
        <div
          data-saliendo={saliendo || undefined}
          className="fixed inset-0 z-50 flex items-start justify-end bg-scrim/10 p-3 pt-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] print:hidden sm:p-4 sm:pt-16"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAbierto(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-avisos"
            className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <h2 id="titulo-avisos" className="text-base font-semibold text-slate-900">
                Avisos
              </h2>
              <div className="flex items-center gap-1">
                {noLeidos > 0 && (
                  <button
                    type="button"
                    onClick={() => marcarLeidos(avisos.filter((a) => !a.leido).map((a) => a.id))}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 pointer-coarse:min-h-11"
                  >
                    Marcar todo como leído
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-brand-100 hover:text-slate-800 pointer-coarse:min-h-11"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>
            </div>

            {avisos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Todavía no hay avisos. Aquí aparecerá lo importante de tu área.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-y-auto">
                {avisos.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.url ?? "/"}
                      onClick={() => {
                        marcarLeidos(a.leido ? [] : [a.id]);
                        setAbierto(false);
                      }}
                      className={`flex gap-3 px-4 py-3 text-left transition-colors hover:bg-brand-50 pointer-coarse:min-h-11 ${
                        a.leido ? "" : "bg-brand-50/60"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.leido ? "bg-transparent" : "bg-rose-600"}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm text-slate-900 ${a.leido ? "font-medium" : "font-semibold"}`}>
                          {a.titulo}
                          {!a.leido && <span className="sr-only"> (sin leer)</span>}
                        </span>
                        {a.cuerpo && <span className="mt-0.5 block text-xs text-slate-600">{a.cuerpo}</span>}
                        <span className="mt-0.5 block text-xs text-slate-400">{tiempoRelativo(a.creadoEn)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
