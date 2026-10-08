"use client";

import { useEffect, useRef } from "react";

// Brillo del color de marca que sigue al ratón sobre su contenedor, como el de
// las tarjetas inclinables pero sin inclinar nada (para barras y paneles
// grandes). Se pone dentro de un elemento con position relative/absolute; los
// eventos se escuchan en ese padre, así que sirve también en componentes de
// servidor. Solo con puntero fino y sin "reducir movimiento" (.brillo-cursor
// en globals.css).
export default function BrilloCursor() {
  const brillo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = brillo.current;
    const padre = el?.parentElement;
    if (!el || !padre) return;

    function alMover(e: PointerEvent) {
      if (e.pointerType !== "mouse" || !el || !padre) return;
      const r = padre.getBoundingClientRect();
      el.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(0)}px`);
      el.style.setProperty("--my", `${(e.clientY - r.top).toFixed(0)}px`);
      el.dataset.activo = "";
    }
    function alSalir() {
      delete el?.dataset.activo;
    }

    padre.addEventListener("pointermove", alMover);
    padre.addEventListener("pointerleave", alSalir);
    return () => {
      padre.removeEventListener("pointermove", alMover);
      padre.removeEventListener("pointerleave", alSalir);
    };
  }, []);

  return <span ref={brillo} className="brillo-cursor" aria-hidden="true" />;
}
