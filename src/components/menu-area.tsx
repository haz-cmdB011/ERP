"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

// Avisa a los enlaces del menú (SubnavLink) que cierren el cajón al elegir.
const CerrarMenu = createContext<() => void>(() => {});
export const useCerrarMenu = () => useContext(CerrarMenu);

// Botón de tres rayas en la barra superior que abre, desde la izquierda, el
// menú con los paneles del área (Pedidos, Cargar Excel...). Los enlaces llegan
// como children desde el layout de cada área.
export default function MenuArea({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const cajon = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    }
    window.addEventListener("keydown", alTeclear);
    // La página de atrás no se desplaza mientras el menú está abierto.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // El foco entra al menú (a la pantalla actual, o al primer enlace).
    const actual =
      cajon.current?.querySelector<HTMLElement>('[aria-current="page"]') ??
      cajon.current?.querySelector<HTMLElement>("a");
    actual?.focus();
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = anterior;
    };
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Menú de ${titulo}`}
        title={`Menú de ${titulo}`}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-nav-suave transition-colors hover:bg-nav-hover hover:text-on-nav focus-visible:outline-brand-500 sm:h-10 sm:w-10"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex bg-scrim/30 print:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <nav
            ref={cajon}
            role="dialog"
            aria-modal="true"
            aria-label={`Menú de ${titulo}`}
            className="cajon-menu flex h-full w-72 max-w-[85vw] flex-col rounded-r-2xl border-r border-slate-200 bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-slate-800 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {titulo}
              </p>
              <button
                type="button"
                onClick={() => {
                  cerrar();
                  boton.current?.focus();
                }}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Cerrar menú"
              >
                ✕
              </button>
            </div>
            <CerrarMenu.Provider value={cerrar}>
              <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">{children}</div>
            </CerrarMenu.Provider>
          </nav>
        </div>
      )}
    </>
  );
}
