"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcionSelect {
  value: string;
  label: string;
}

// Reemplazo del <select> nativo: el desplegable del navegador se ve cortado
// dentro del panel de vista previa (no todas las opciones caben y no hay
// barra de desplazamiento). Este panel es un <div> normal con
// overflow-y-auto, así que siempre se puede hacer scroll y siempre se ven
// todas las opciones.
export default function SelectMenu({
  value,
  onChange,
  opciones,
  vacio,
  placeholder,
  className = "",
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  opciones: OpcionSelect[];
  vacio?: string;
  placeholder?: string;
  className?: string;
  mono?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickFuera);
      document.removeEventListener("keydown", onEscape);
    };
  }, [abierto]);

  const todas = vacio != null ? [{ value: "", label: vacio }, ...opciones] : opciones;
  const seleccionada = todas.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-left text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
          mono ? "font-mono" : ""
        } ${className}`}
      >
        <span className={seleccionada?.value ? "" : "text-slate-400"}>
          {seleccionada ? seleccionada.label : (placeholder ?? "— elegir —")}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.293l3.71-4.06a.75.75 0 1 1 1.11 1.01l-4.25 4.65a.75.75 0 0 1-1.11 0l-4.25-4.65a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {abierto && (
        <div className="absolute z-20 mt-1 max-h-60 w-full min-w-max overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {todas.map((o) => (
            <button
              key={o.value || "__vacio__"}
              type="button"
              onClick={() => {
                onChange(o.value);
                setAbierto(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 ${
                mono ? "font-mono" : ""
              } ${
                o.value === value
                  ? "bg-indigo-50 font-medium text-indigo-700"
                  : o.value === ""
                    ? "text-slate-400"
                    : "text-slate-900"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
