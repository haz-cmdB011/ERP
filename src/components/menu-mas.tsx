"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Opciones del menú "Más": lo secundario de una pantalla o de una fila, para que a la vista
// quede solo la acción principal. Una opción es un enlace (`href`) o una acción (`alHacer`).
export type OpcionMenuMas =
  | { etiqueta: string; href: string; target?: "_blank"; peligro?: boolean; deshabilitada?: boolean }
  | { etiqueta: string; alHacer: () => void; peligro?: boolean; deshabilitada?: boolean };

// El panel se posiciona con `fixed` para que no lo recorte una tabla con desplazamiento
// (las últimas filas, si no, lo dejarían escondido). Se cierra al elegir, tocar fuera,
// con Esc o al mover la pantalla.
export default function MenuMas({
  opciones,
  etiqueta = "Más",
  etiquetaAccesible,
  compacto = false,
}: {
  opciones: OpcionMenuMas[];
  etiqueta?: string;
  // Para lectores de pantalla cuando varias filas repiten el botón ("Más acciones del mueble 3").
  etiquetaAccesible?: string;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; right: number } | null>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setAbierto(false);
    const fuera = (e: MouseEvent | TouchEvent) => {
      const destino = e.target as Node;
      if (panelRef.current?.contains(destino) || botonRef.current?.contains(destino)) return;
      setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        botonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  function alternar(e: React.MouseEvent) {
    // En las filas clicables, abrir el menú no debe abrir la fila.
    e.stopPropagation();
    if (abierto) {
      setAbierto(false);
      return;
    }
    const caja = botonRef.current?.getBoundingClientRect();
    if (caja) setPosicion({ top: caja.bottom + 4, right: window.innerWidth - caja.right });
    setAbierto(true);
  }

  const claseOpcion = (peligro?: boolean, deshabilitada?: boolean) =>
    `block w-full px-3 py-2.5 text-left text-sm font-medium transition-colors ${
      deshabilitada
        ? "cursor-not-allowed text-slate-300"
        : peligro
          ? "text-rose-700 hover:bg-rose-50"
          : "text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={alternar}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={etiquetaAccesible}
        className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white font-medium text-slate-700 transition-colors hover:bg-slate-50 ${
          compacto ? "min-h-9 px-2 text-xs pointer-coarse:min-h-11 sm:px-2.5" : "min-h-10 px-3 text-sm"
        }`}
      >
        {etiqueta}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 ${compacto ? "hidden sm:block" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {abierto && posicion && (
        <div
          ref={panelRef}
          role="menu"
          style={{ position: "fixed", top: posicion.top, right: posicion.right }}
          className="z-50 min-w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {opciones.map((o) =>
            "href" in o ? (
              o.deshabilitada ? (
                <span key={o.etiqueta} role="menuitem" aria-disabled="true" className={claseOpcion(o.peligro, true)}>
                  {o.etiqueta}
                </span>
              ) : (
                <Link
                  key={o.etiqueta}
                  href={o.href}
                  target={o.target}
                  rel={o.target ? "noopener noreferrer" : undefined}
                  role="menuitem"
                  prefetch={false}
                  onClick={() => setAbierto(false)}
                  className={claseOpcion(o.peligro)}
                >
                  {o.etiqueta}
                </Link>
              )
            ) : (
              <button
                key={o.etiqueta}
                type="button"
                role="menuitem"
                disabled={o.deshabilitada}
                onClick={() => {
                  setAbierto(false);
                  o.alHacer();
                }}
                className={claseOpcion(o.peligro, o.deshabilitada)}
              >
                {o.etiqueta}
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}
