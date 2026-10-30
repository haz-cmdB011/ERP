"use client";

import { useLayoutEffect, useRef } from "react";

// Marca de la opción activa en pestañas y selectores (Activas / Terminadas /
// Todas): una sola pieza que se desliza de una opción a otra en vez de saltar.
// Va dentro del contenedor de las opciones (que debe ser `relative`) y busca la
// activa por aria-selected / aria-current. Al tocar otra opción se mueve de
// inmediato, sin esperar a que llegue la pantalla nueva.
//
// forma "linea": una raya bajo la opción (pestañas); "fondo": un recuadro
// detrás de ella (selectores). `className` le da el color y el grosor.
export default function IndicadorDeslizante({
  activa,
  forma,
  className,
}: {
  // Cambia cuando cambia la opción activa: vuelve a medir.
  activa: string;
  forma: "linea" | "fondo";
  className: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const barra = ref.current;
    const lista = barra?.parentElement;
    if (!barra || !lista) return;

    function mover(el: HTMLElement | null, animar: boolean) {
      if (!barra) return;
      if (!el) {
        barra.style.opacity = "0";
        return;
      }
      barra.style.transitionDuration = animar ? "" : "0ms";
      barra.style.width = `${el.offsetWidth}px`;
      if (forma === "fondo") {
        barra.style.height = `${el.offsetHeight}px`;
        barra.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
      } else {
        barra.style.transform = `translateX(${el.offsetLeft}px)`;
      }
      barra.style.opacity = "1";
    }
    const actual = () =>
      lista.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="true"], [aria-current="page"]');

    // La primera vez se coloca sin animar; después, cada cambio se desliza.
    mover(actual(), barra.dataset.listo === "1");
    barra.dataset.listo = "1";

    function alTocar(e: MouseEvent) {
      const el = (e.target as Element | null)?.closest<HTMLElement>("a, button");
      if (el && lista?.contains(el)) mover(el, true);
    }
    lista.addEventListener("click", alTocar);
    const observador = new ResizeObserver(() => mover(actual(), false));
    observador.observe(lista);
    return () => {
      lista.removeEventListener("click", alTocar);
      observador.disconnect();
    };
  }, [activa, forma]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      style={{ opacity: 0 }}
      className={`pointer-events-none absolute left-0 transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        forma === "fondo" ? "top-0" : "-bottom-px"
      } ${className}`}
    />
  );
}
