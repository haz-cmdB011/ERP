"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Ventana para pedir un motivo (p. ej. al cancelar un ítem). Se monta solo
// cuando está abierta, así el texto empieza limpio (o con el motivo previo) cada
// vez. Sube desde abajo en celular. Va en un portal para no heredar la posición
// de la fila o celda de tabla donde se abra.
export default function DialogoMotivo({
  titulo,
  descripcion,
  etiquetaConfirmar,
  motivoInicial = "",
  enviando = false,
  error = null,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  descripcion?: string;
  etiquetaConfirmar: string;
  motivoInicial?: string;
  enviando?: boolean;
  error?: string | null;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState(motivoInicial);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape" && !enviando) onCancelar();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [enviando, onCancelar]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (motivo.trim() && !enviando) onConfirmar(motivo.trim());
        }}
        className="w-full rounded-t-2xl bg-white p-5 shadow-lg sm:max-w-md sm:rounded-xl"
      >
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {descripcion && <p className="mt-1 text-sm text-slate-600">{descripcion}</p>}
        <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-slate-700">
          Motivo
          <textarea
            autoFocus
            required
            rows={3}
            maxLength={300}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={enviando}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-normal text-slate-900 focus:border-slate-400 focus:outline-none sm:py-2 sm:text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            disabled={enviando}
            className="rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 sm:py-2 sm:text-sm"
          >
            Volver
          </button>
          <button
            type="submit"
            disabled={enviando || !motivo.trim()}
            className="rounded-lg bg-red-600 px-4 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50 sm:py-2 sm:text-sm"
          >
            {enviando ? "Guardando…" : etiquetaConfirmar}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
