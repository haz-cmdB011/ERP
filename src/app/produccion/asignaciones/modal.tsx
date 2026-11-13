"use client";

import { useEffect } from "react";

// Ventana para los formularios de asignaciones (asignar, entregar, cancelar).
// `subtitulo` puede ser un texto o un bloque propio (p. ej. los datos del mueble ordenados). `grande`
// da al título más peso, para ventanas cuyo título es el nombre de lo que se trabaja; `etiqueta` es lo
// que lee un lector de pantalla si el título solo no dice qué hace la ventana.
export default function Modal({
  titulo,
  subtitulo,
  grande = false,
  etiqueta,
  onCerrar,
  children,
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  grande?: boolean;
  etiqueta?: string;
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
      // En celular sube desde abajo (hoja), más cómodo para el pulgar. No usa portal: se
      // abre dentro de quien lo llama (p. ej. una celda de tabla), así que reinicia el
      // texto heredado (whitespace-nowrap, alineación) para que todo se acomode.
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 text-left text-base font-normal whitespace-normal sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta ?? titulo}
    >
      {/* El encabezado queda fijo y solo el contenido se desplaza, para que el título siempre se vea. */}
      <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-lg sm:max-w-md sm:rounded-xl">
        <div className="shrink-0 px-5 pt-5">
          <h2 className={grande ? "text-xl font-semibold leading-snug text-slate-900" : "text-base font-semibold text-slate-900"}>
            {titulo}
          </h2>
          {subtitulo && <div className="mt-0.5 text-sm text-slate-500">{subtitulo}</div>}
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
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
  "rounded-lg border border-slate-300 px-4 py-3 text-base text-slate-700 transition-colors hover:bg-brand-50 sm:py-2 sm:text-sm";
