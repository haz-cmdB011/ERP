"use client";

import { useEffect, useRef, useState } from "react";
import { moverPestana, ordenFinal, soltarSobre } from "@/lib/ui/orden-pestanas";

const PREFIJO = "erp-orden-pestanas:";

function leerGuardado(clave: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(PREFIJO + clave) ?? "null");
  } catch {
    return null;
  }
}

function guardar(clave: string, orden: string[] | null) {
  try {
    if (orden) localStorage.setItem(PREFIJO + clave, JSON.stringify(orden));
    else localStorage.removeItem(PREFIJO + clave);
  } catch {
    // Sin localStorage el orden dura hasta recargar; no es grave.
  }
}

// Fila de pestañas del área que cada persona puede reordenar. Las pestañas son
// los enlaces (SubnavLink) que llegan como `children`; aquí solo se cambia su
// posición visual (CSS `order`), sin tocar qué enlaces hay ni a dónde llevan.
// El orden se guarda en este navegador, por usuario y área.
//  - "Ordenar": se activa el modo; se arrastra una pestaña sobre otra (PC) o se
//    toca una y se usan las flechas (celular y tableta).
//  - "Restablecer": vuelve al orden original.
export default function SubnavOrdenable({
  clave,
  children,
}: {
  clave: string;
  children: React.ReactNode;
}) {
  const fila = useRef<HTMLDivElement>(null);
  const arrastrada = useRef<string | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const enlaces = () =>
    Array.from(fila.current?.querySelectorAll<HTMLAnchorElement>(":scope > a[href]") ?? []);

  // Orden visual actual (por la propiedad order; si no hay, el del DOM).
  function ordenActual(): string[] {
    return enlaces()
      .map((a, i) => ({ href: a.getAttribute("href")!, pos: Number(a.style.order || i) }))
      .sort((x, y) => x.pos - y.pos)
      .map((x) => x.href);
  }

  function aplicar(orden: string[]) {
    for (const a of enlaces()) {
      const i = orden.indexOf(a.getAttribute("href")!);
      a.style.order = i === -1 ? "" : String(i);
    }
  }

  // Aplica lo guardado al cargar, y otra vez si cambian las pestañas (por
  // ejemplo, aparece "Discrepancias" para quien puede decidirlas).
  useEffect(() => {
    const contenedor = fila.current;
    if (!contenedor) return;
    const reaplicar = () => {
      const hrefs = enlaces().map((a) => a.getAttribute("href")!);
      const guardado = leerGuardado(clave);
      if (guardado) aplicar(ordenFinal(hrefs, guardado));
    };
    reaplicar();
    const vigilante = new MutationObserver(reaplicar);
    vigilante.observe(contenedor, { childList: true });
    return () => vigilante.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enlaces/aplicar solo leen refs
  }, [clave]);

  // En modo ordenar las pestañas se pueden arrastrar.
  useEffect(() => {
    for (const a of enlaces()) a.draggable = ordenando;
  }, [ordenando]);

  // Marca visualmente la pestaña elegida.
  useEffect(() => {
    for (const a of enlaces()) {
      a.toggleAttribute("data-elegida", ordenando && a.getAttribute("href") === seleccion);
    }
  }, [ordenando, seleccion]);

  function cambiar(nuevo: string[]) {
    aplicar(nuevo);
    guardar(clave, nuevo);
  }

  function alHacerClic(e: React.MouseEvent) {
    if (!ordenando) return;
    const a = (e.target as Element).closest("a[href]");
    if (!a || !fila.current?.contains(a)) return;
    // En modo ordenar, tocar una pestaña la selecciona en vez de abrirla.
    e.preventDefault();
    e.stopPropagation();
    setSeleccion(a.getAttribute("href"));
  }

  function mover(delta: number) {
    if (!seleccion) return;
    cambiar(moverPestana(ordenActual(), seleccion, delta));
  }

  function restablecer() {
    for (const a of enlaces()) a.style.order = "";
    guardar(clave, null);
    setSeleccion(null);
  }

  function salir() {
    setOrdenando(false);
    setSeleccion(null);
  }

  const boton =
    "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-brand-600 hover:bg-brand-50 disabled:opacity-40";

  return (
    <div
      ref={fila}
      data-ordenando={ordenando ? "" : undefined}
      onClickCapture={alHacerClic}
      onDragStart={(e) => {
        const a = (e.target as Element).closest("a[href]");
        arrastrada.current = a?.getAttribute("href") ?? null;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", arrastrada.current ?? "");
      }}
      onDragOver={(e) => {
        if (ordenando && arrastrada.current) e.preventDefault();
      }}
      onDrop={(e) => {
        const destino = (e.target as Element).closest("a[href]")?.getAttribute("href");
        const origen = arrastrada.current;
        arrastrada.current = null;
        if (!ordenando || !origen || !destino) return;
        e.preventDefault();
        cambiar(soltarSobre(ordenActual(), origen, destino));
        setSeleccion(origen);
      }}
      className="desplazable-sin-barra pestanas-ordenables flex items-stretch gap-5 overflow-x-auto whitespace-nowrap px-4 text-sm sm:gap-6 sm:px-6"
    >
      {children}
      {/* order alto: los controles siempre quedan al final de la fila. */}
      <div
        className="ml-auto flex shrink-0 items-center gap-2 py-1.5 pl-3"
        style={{ order: 9999 }}
        data-controles
      >
        {ordenando ? (
          <>
            <span className="hidden text-xs text-slate-500 md:inline">
              {seleccion ? "Mueve la pestaña elegida" : "Toca o arrastra una pestaña"}
            </span>
            <button type="button" className={boton} disabled={!seleccion} onClick={() => mover(-1)} aria-label="Mover a la izquierda">
              ←
            </button>
            <button type="button" className={boton} disabled={!seleccion} onClick={() => mover(1)} aria-label="Mover a la derecha">
              →
            </button>
            <button type="button" className={boton} onClick={restablecer}>
              Restablecer
            </button>
            <button
              type="button"
              className={`${boton} border-brand-600 bg-brand-500 text-on-brand hover:bg-brand-400`}
              onClick={salir}
            >
              Listo
            </button>
          </>
        ) : (
          <button
            type="button"
            className={`${boton} border-transparent bg-transparent text-slate-500`}
            onClick={() => setOrdenando(true)}
            title="Cambiar el orden de las pestañas"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3" />
            </svg>
            Ordenar
          </button>
        )}
      </div>
    </div>
  );
}
