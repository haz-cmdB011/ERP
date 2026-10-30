"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModeloReciente } from "@/lib/produccion/inicio";
import { AnillosConcentricos } from "./anillo-estados";

const esOt = (ot: string | null): ot is string => !!ot && /^\d+-\d{2}$/.test(ot);

// Los modelos vigentes, del PM más reciente al más viejo, cada uno en un recuadro, en una tira con tres a
// la vista que se recorre de tres en tres con los botones, o con el dedo, el trackpad o las flechas
// del teclado. Cada recuadro
// lista todas sus O.T., tres a la vista y las demás deslizando de lado.
export default function CarruselModelos({ modelos }: { modelos: ModeloReciente[] }) {
  const tira = useRef<HTMLUListElement>(null);
  const [extremos, setExtremos] = useState({ inicio: true, fin: false });

  const medir = useCallback(() => {
    const el = tira.current;
    if (!el) return;
    setExtremos({ inicio: el.scrollLeft <= 4, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [medir]);

  // Avanza los recuadros que caben a la vista (3; 1 en el teléfono), midiendo el primero con su
  // separación; sin animación si la persona la pidió reducida.
  function mover(sentido: 1 | -1) {
    const el = tira.current;
    const primero = el?.firstElementChild as HTMLElement | null;
    if (!el || !primero) return;
    const paso = primero.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    const porVista = Math.max(1, Math.round(el.clientWidth / paso));
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: sentido * paso * porVista, behavior: quieto ? "auto" : "smooth" });
  }

  const boton =
    "grid size-9 place-items-center rounded-full border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-35 disabled:hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

  return (
    <section
      aria-label="Muebles recientes"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">
            Muebles recientes
            {modelos.length > 0 && <span className="ml-1.5 font-normal text-slate-500">({modelos.length})</span>}
          </h2>
        </div>
        {modelos.length > 0 && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => mover(-1)} disabled={extremos.inicio} aria-label="Modelos anteriores" className={boton}>
              <Flecha sentido={-1} />
            </button>
            <button type="button" onClick={() => mover(1)} disabled={extremos.fin} aria-label="Más modelos" className={boton}>
              <Flecha sentido={1} />
            </button>
          </div>
        )}
      </header>

      {modelos.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Todavía no hay muebles en producción.</p>
      ) : (
        <ul
          ref={tira}
          onScroll={medir}
          // Con el foco en la tira, las flechas del teclado la recorren (comportamiento nativo).
          tabIndex={0}
          aria-label="Modelos; desliza o usa las flechas para ver más"
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 py-4 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600"
        >
          {modelos.map((m) => (
            <li
              key={m.modelo}
              // Tres a la vista (uno en el teléfono): el ancho reparte la tira menos sus dos separaciones.
              className="flex min-h-56 w-full shrink-0 snap-start flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 sm:w-[calc((100%-1.5rem)/3)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/produccion/panel?estado=todos&q=${encodeURIComponent(m.modelo)}`}
                    className="block truncate text-lg font-bold leading-tight tracking-tight text-slate-900 hover:underline"
                    title={`Ver ${m.modelo} en el panel de asignación`}
                  >
                    {m.modelo}
                  </Link>
                  {m.descripcion && (
                    <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-slate-500">{m.descripcion.split("\n")[0]}</p>
                  )}
                </div>
                <AnillosConcentricos conteos={m.conteos} />
              </div>
              {/* Tres O.T. a la vista; las demás se deslizan de lado. */}
              <ul
                aria-label={`O.T. con ${m.modelo}`}
                className="mt-auto flex snap-x snap-mandatory gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:thin]"
              >
                {m.pms.map((p) => (
                  <li key={p.pedidoId} className="w-[calc((100%-0.75rem)/3)] shrink-0 snap-start">
                    <Link
                      href={esOt(p.ot) ? `/produccion/ot/${p.ot}` : `/produccion/pedidos/${p.pedidoId}`}
                      title={p.numeroPm}
                      className="block rounded-md border border-slate-200 bg-white px-1.5 py-1.5 text-center text-xs font-medium tabular-nums text-slate-700 transition-colors hover:border-brand-400 hover:text-slate-900"
                    >
                      {p.ot ?? p.numeroPm}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Flecha({ sentido }: { sentido: 1 | -1 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d={sentido === 1 ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} />
    </svg>
  );
}
