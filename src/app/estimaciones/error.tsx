"use client";

import Link from "next/link";
import { useEffect } from "react";

// No se pudieron leer los datos de Estimaciones. Se dice claro para que nadie
// lo confunda con "no hay recibos" y se queda el menú del área a la vista.
export default function ErrorEstimaciones({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 p-4 sm:p-6">
      <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900">
        <h1 className="text-lg font-semibold">No se pudieron cargar los datos</h1>
        <p className="mt-1 text-sm">
          Esto no significa que no haya recibos: la lectura falló y no quisimos mostrarte una lista
          incompleta. Reintenta; si sigue pasando, avisa al equipo de desarrollo.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs">Código: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-5 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-400"
        >
          Reintentar
        </button>
        <Link
          href="/estimaciones"
          className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Ir al panel
        </Link>
      </div>
    </main>
  );
}
