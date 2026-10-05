"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Lo que se ve al abrir otra pantalla:
//  - Barra fina verde arriba mientras carga: se enciende al hacer clic en un
//    enlace interno a otra ruta y se apaga sola cuando cambia la ruta (se
//    compara la ruta de entonces con la actual, sin estado que limpiar).
//  - Transición entre pantallas: en navegadores con View Transitions API
//    (Chrome, Edge, Safari 18+) la pantalla vieja se desvanece y la nueva sube
//    suavemente; la barra superior se queda quieta (ver ::view-transition en
//    globals.css). Si la nueva pantalla tarda más de medio segundo, la
//    transición se suelta para no dejar la página congelada.
export default function BarraProgreso() {
  const ruta = usePathname();
  const [desde, setDesde] = useState<{ ruta: string; n: number } | null>(null);
  const terminarTransicion = useRef<(() => void) | null>(null);

  // Cuando la ruta cambia, la pantalla nueva ya está lista: se libera la transición.
  useEffect(() => {
    terminarTransicion.current?.();
    terminarTransicion.current = null;
  }, [ruta]);

  useEffect(() => {
    function alHacerClic(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a");
      if (!enlace || (enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) {
        return;
      }
      const url = new URL(enlace.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setDesde((previo) => ({ ruta: window.location.pathname, n: (previo?.n ?? 0) + 1 }));

      const doc = document as Document & {
        startViewTransition?: (actualizar: () => Promise<void>) => unknown;
      };
      if (
        typeof doc.startViewTransition === "function" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        const lista = new Promise<void>((resolver) => {
          terminarTransicion.current = resolver;
          setTimeout(resolver, 500);
        });
        doc.startViewTransition(() => lista);
      }
    }
    // En captura: el <Link> de Next cancela el clic (preventDefault) para
    // navegar por su cuenta, y en la fase normal ya no se vería el clic limpio.
    document.addEventListener("click", alHacerClic, true);
    return () => document.removeEventListener("click", alHacerClic, true);
  }, []);

  if (!desde || desde.ruta !== ruta) return null;
  return (
    <div
      key={desde.n}
      aria-hidden="true"
      className="barra-progreso pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] bg-brand-500 shadow-[0_0_8px_var(--color-brand-500)] print:hidden"
    />
  );
}
