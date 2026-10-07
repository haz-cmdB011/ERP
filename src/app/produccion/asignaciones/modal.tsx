"use client";

import { useEffect } from "react";

// Ventana para los formularios de asignaciones (asignar, entregar, cancelar).
export default function Modal({
  titulo,
  subtitulo,
  onCerrar,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div
      // En celular sube desde abajo (hoja), más cómodo para el pulgar.
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg sm:max-w-md sm:rounded-xl">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

// En celular los campos y botones son más grandes (16 px evita el zoom
// automático de iOS al enfocar un campo).
export const estiloCampo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 focus:border-slate-400 focus:outline-none sm:py-2 sm:text-sm";
export const estiloEtiqueta = "flex flex-col gap-1 text-sm font-medium text-slate-700";
export const estiloBotonPrimario =
  "flex-1 rounded-lg bg-brand-500 px-4 py-3 text-base font-medium text-on-brand shadow-sm transition-colors hover:bg-brand-400 disabled:opacity-50 sm:flex-none sm:py-2 sm:text-sm";
export const estiloBotonSecundario =
  "rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-700 transition-colors hover:bg-slate-50 sm:py-2 sm:text-sm";
