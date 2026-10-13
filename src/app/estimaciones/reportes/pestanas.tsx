"use client";

import { useEffect, useState } from "react";

export interface Pestana {
  id: string;
  etiqueta: string;
  // Punto de aviso junto a la etiqueta (algo requiere atención ahí).
  aviso?: boolean;
  contenido: React.ReactNode;
}

const LLAVE = "reporte-pestana";

// Pestañas del reporte. Todos los paneles vienen ya dibujados por el servidor y
// solo se oculta el que no está activo, así que cambiar de pestaña no consulta
// nada. Una ancla (#id) que apunte a una pestaña o a algo dentro de ella la
// abre; la última pestaña se recuerda en la sesión. Al imprimir salen todas.
export default function Pestanas({ pestanas }: { pestanas: Pestana[] }) {
  const [activa, setActiva] = useState(pestanas[0].id);
  const ids = pestanas.map((p) => p.id);

  useEffect(() => {
    function idDeLaAncla(): string | null {
      const hash = window.location.hash.slice(1);
      if (!hash) return null;
      if (ids.includes(hash)) return hash;
      return document.getElementById(hash)?.closest<HTMLElement>("[data-pestana]")?.dataset.pestana ?? null;
    }
    function irALaAncla() {
      const id = idDeLaAncla();
      if (!id) return;
      setActiva(id);
      // El panel recién se muestra al terminar de pintar.
      requestAnimationFrame(() =>
        document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" })
      );
    }
    // La pestaña recordada vive en el navegador: solo se puede leer ya montado.
    function restaurarGuardada() {
      try {
        const guardada = window.sessionStorage.getItem(LLAVE);
        if (guardada && ids.includes(guardada)) setActiva(guardada);
      } catch {
        // Sin almacenamiento: se queda en la primera.
      }
    }
    if (idDeLaAncla()) irALaAncla();
    else restaurarGuardada();
    window.addEventListener("hashchange", irALaAncla);
    return () => window.removeEventListener("hashchange", irALaAncla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegir(id: string) {
    setActiva(id);
    try {
      window.sessionStorage.setItem(LLAVE, id);
    } catch {
      // Es solo una comodidad.
    }
  }

  function teclas(e: React.KeyboardEvent, i: number) {
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const siguiente = pestanas[(i + paso + pestanas.length) % pestanas.length];
    elegir(siguiente.id);
    document.getElementById(`pestana-${siguiente.id}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Secciones del reporte"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0 print:hidden"
      >
        {pestanas.map((p, i) => (
          <button
            key={p.id}
            id={`pestana-${p.id}`}
            type="button"
            role="tab"
            aria-selected={activa === p.id}
            aria-controls={`panel-${p.id}`}
            tabIndex={activa === p.id ? 0 : -1}
            onClick={() => elegir(p.id)}
            onKeyDown={(e) => teclas(e, i)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activa === p.id
                ? "border-brand-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {p.etiqueta}
            {p.aviso && (
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-500" />
            )}
            {p.aviso && <span className="sr-only">(requiere atención)</span>}
          </button>
        ))}
      </div>

      {pestanas.map((p) => (
        <section
          key={p.id}
          id={`panel-${p.id}`}
          role="tabpanel"
          aria-labelledby={`pestana-${p.id}`}
          data-pestana={p.id}
          className={`flex flex-col gap-5 ${activa === p.id ? "" : "hidden print:flex"}`}
        >
          <h2 className="hidden border-b border-slate-300 pb-1 text-lg font-semibold text-slate-900 print:block">
            {p.etiqueta}
          </h2>
          {p.contenido}
        </section>
      ))}
    </div>
  );
}
