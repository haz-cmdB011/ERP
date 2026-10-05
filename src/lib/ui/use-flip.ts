"use client";

import { useLayoutEffect, useRef } from "react";

// Movimiento al reordenar o reacomodar filas (técnica FLIP): después de cada
// render compara dónde está cada elemento con dónde estaba y lo desliza desde
// su posición anterior a la nueva. Los elementos se identifican con
// data-flip="<id estable>". Los que aparecen o desaparecen no se mueven (ya
// tienen su propia animación de entrada y salida). Se desactiva con "reducir
// movimiento". Las posiciones se miden respecto al documento, así que
// desplazar la página no cuenta como movimiento.
export function useFlip<T extends HTMLElement>() {
  const contenedor = useRef<T>(null);
  const anteriores = useRef(new Map<string, number>());

  // Sin lista de dependencias a propósito: se revisa en cada render.
  useLayoutEffect(() => {
    const raiz = contenedor.current;
    if (!raiz) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const actuales = new Map<string, number>();

    raiz.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const clave = el.dataset.flip!;
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      actuales.set(clave, arriba);
      const antes = anteriores.current.get(clave);
      if (sinMovimiento || antes === undefined) return;
      const dy = antes - arriba;
      // Saltos mínimos o enormes (cambio de página, scroll programado) no se animan.
      if (Math.abs(dy) < 2 || Math.abs(dy) > 900) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: 300,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    });

    anteriores.current = actuales;
  });

  return contenedor;
}
