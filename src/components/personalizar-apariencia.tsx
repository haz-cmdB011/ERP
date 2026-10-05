"use client";

import { useEffect, useRef, useState } from "react";
import {
  APARIENCIA_INICIAL,
  CLAVE_APARIENCIA,
  LIMITES,
  PRESETS,
  aplicarApariencia,
  normalizarApariencia,
  type Apariencia,
} from "@/lib/apariencia";

function leerGuardada(): Apariencia {
  try {
    return normalizarApariencia(JSON.parse(localStorage.getItem(CLAVE_APARIENCIA) ?? "null"));
  } catch {
    return APARIENCIA_INICIAL;
  }
}

function guardar(a: Apariencia) {
  try {
    localStorage.setItem(CLAVE_APARIENCIA, JSON.stringify(a));
  } catch {
    // Sin localStorage la apariencia dura hasta recargar; no es grave.
  }
}

function iguales(a: Apariencia, b: Apariencia) {
  return (Object.keys(a) as (keyof Apariencia)[]).every((k) => a[k] === b[k]);
}

const CAMPOS_COLOR: { clave: "marca" | "fondo1" | "fondo2" | "fondo3"; etiqueta: string }[] = [
  { clave: "marca", etiqueta: "Acento (botones y pestañas)" },
  { clave: "fondo1", etiqueta: "Tono del papel" },
  { clave: "fondo2", etiqueta: "Trazos de muebles" },
  { clave: "fondo3", etiqueta: "Cotas y medidas" },
];

// Botón de la barra (paleta) que abre un panel para elegir colores e
// intensidad del vidrio. Los cambios se ven al momento y se guardan en este
// navegador; otras pestañas abiertas se actualizan solas.
export default function PersonalizarApariencia() {
  const [abierto, setAbierto] = useState(false);
  const [valores, setValores] = useState<Apariencia>(APARIENCIA_INICIAL);
  const boton = useRef<HTMLButtonElement>(null);

  // Cambios hechos en otra pestaña.
  useEffect(() => {
    function desdeOtraPestana(e: StorageEvent) {
      if (e.key !== CLAVE_APARIENCIA) return;
      const a = leerGuardada();
      aplicarApariencia(a);
      setValores(a);
    }
    window.addEventListener("storage", desdeOtraPestana);
    return () => window.removeEventListener("storage", desdeOtraPestana);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") cerrar();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  function abrir() {
    setValores(leerGuardada());
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    boton.current?.focus();
  }

  function cambiar(nuevos: Apariencia) {
    setValores(nuevos);
    aplicarApariencia(nuevos);
    guardar(nuevos);
  }

  const presetActivo = PRESETS.find((p) => iguales(p.valores, valores))?.id;

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={abrir}
        title="Personalizar apariencia"
        aria-label="Personalizar apariencia"
        aria-haspopup="dialog"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-nav-suave transition-colors hover:bg-nav-hover hover:text-on-nav focus-visible:outline-brand-500 sm:h-10 sm:w-10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[18px] w-[18px]"
          aria-hidden="true"
        >
          <path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-1.8a1.7 1.7 0 0 0-1.2 2.9c.6.6.6 1.4.2 2A3 3 0 0 1 12 22Z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
          <circle cx="12" cy="7" r="1" fill="currentColor" />
          <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
        </svg>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-end bg-scrim/10 p-3 pt-[max(4.5rem,calc(env(safe-area-inset-top)+4rem))] print:hidden sm:p-4 sm:pt-16"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-apariencia"
            className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="titulo-apariencia" className="text-base font-semibold text-slate-900">
                Personalizar apariencia
              </h2>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Se guarda en este navegador. El modo claro u oscuro se cambia con el botón de al lado.
            </p>

            <fieldset className="mt-5">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Combinaciones
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => cambiar(p.valores)}
                    aria-pressed={presetActivo === p.id}
                    className={`group flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs font-medium transition-colors ${
                      presetActivo === p.id
                        ? "border-brand-500 bg-brand-50 text-slate-900"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className="relative h-9 w-full overflow-hidden rounded-lg border border-black/5"
                      style={{ background: `color-mix(in oklab, ${p.valores.fondo1} 14%, #f4f3ee)` }}
                      aria-hidden="true"
                    >
                      {/* Miniatura del plano: una silla con su cota. */}
                      <svg viewBox="0 0 60 36" className="absolute inset-0 h-full w-full" fill="none">
                        <path
                          d="M14 4h3l2 26h-3ZM16 18h18l-1 12h-2l1-10h-14"
                          stroke={p.valores.fondo2}
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                        <path d="M10 33h26M8 35l4-4M34 35l4-4" stroke={p.valores.fondo3} strokeWidth="1" />
                      </svg>
                      <span
                        className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full ring-2 ring-white/80"
                        style={{ background: p.valores.marca }}
                      />
                    </span>
                    {p.nombre}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Colores
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                {CAMPOS_COLOR.map(({ clave, etiqueta }) => (
                  <label
                    key={clave}
                    className={`flex items-center gap-2 rounded-lg p-1 text-sm ${clave === "marca" ? "col-span-2" : ""}`}
                  >
                    <input
                      type="color"
                      value={valores[clave]}
                      onChange={(e) => cambiar({ ...valores, [clave]: e.target.value })}
                      className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-slate-300 bg-transparent p-0.5"
                    />
                    <span className="min-w-0 truncate">{etiqueta}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5 space-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Vidrio
              </legend>
              <label className="block text-sm">
                <span className="flex justify-between">
                  <span>Opacidad de los paneles</span>
                  <span className="tabular-nums text-slate-500">{valores.opacidad}%</span>
                </span>
                <input
                  type="range"
                  min={LIMITES.opacidad.min}
                  max={LIMITES.opacidad.max}
                  value={valores.opacidad}
                  onChange={(e) => cambiar({ ...valores, opacidad: Number(e.target.value) })}
                  className="mt-1 w-full accent-brand-600"
                />
              </label>
              <label className="block text-sm">
                <span className="flex justify-between">
                  <span>Desenfoque</span>
                  <span className="tabular-nums text-slate-500">{valores.desenfoque} px</span>
                </span>
                <input
                  type="range"
                  min={LIMITES.desenfoque.min}
                  max={LIMITES.desenfoque.max}
                  value={valores.desenfoque}
                  onChange={(e) => cambiar({ ...valores, desenfoque: Number(e.target.value) })}
                  className="mt-1 w-full accent-brand-600"
                />
              </label>
            </fieldset>

            <div className="mt-6 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => cambiar(APARIENCIA_INICIAL)}
                disabled={iguales(valores, APARIENCIA_INICIAL)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Restablecer
              </button>
              <button
                type="button"
                onClick={cerrar}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-on-brand shadow-sm hover:bg-brand-400"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
