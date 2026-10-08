"use client";

import Link from "next/link";
import { useEffect } from "react";
import Marca from "@/components/marca";

// Falla inesperada al mostrar una pantalla: se puede reintentar sin perder la
// sesión. `error.digest` identifica el fallo en los registros del servidor.
export default function ErrorPantalla({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Un fallo del servidor ya lo avisa instrumentation.ts (trae digest). Los que solo
  // ocurren en el navegador (sin digest) se avisan desde aquí. Si el aviso falla, no pasa nada.
  useEffect(() => {
    if (error.digest) return;
    void fetch("/api/errores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: error.message, ruta: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-nav px-6 text-center text-on-nav">
      <Marca sobreOscuro className="h-12 sm:h-14" />
      <div>
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="mt-2 max-w-sm text-sm text-on-nav-suave">
          No pudimos mostrar esta pantalla. Inténtalo otra vez; si sigue pasando, avisa al equipo
          de desarrollo.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-on-nav-suave">Código: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400"
        >
          Reintentar
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-lg border border-nav-line px-5 text-sm font-medium text-on-nav transition hover:bg-nav-hover"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
