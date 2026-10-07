"use client";

import { haceCuanto } from "@/lib/estimaciones/borrador";

// Ofrece retomar el recibo que se quedó a medias en este navegador.
export default function AvisoBorrador({
  guardadoEn,
  onRecuperar,
  onDescartar,
}: {
  guardadoEn: string;
  onRecuperar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900"
    >
      <span>
        Tienes un recibo sin guardar de {haceCuanto(guardadoEn, new Date())}. ¿Quieres retomarlo?
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={onRecuperar}
          className="rounded-md bg-brand-500 px-3 py-1 text-xs font-semibold text-on-brand hover:bg-brand-400"
        >
          Recuperar borrador
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className="rounded-md border border-brand-300 px-3 py-1 text-xs font-medium text-brand-800 hover:bg-white"
        >
          Descartar
        </button>
      </span>
    </div>
  );
}
