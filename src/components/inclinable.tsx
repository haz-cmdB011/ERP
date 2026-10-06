"use client";

import { useRef } from "react";

// Envoltura para tarjetas: con el ratón encima, la tarjeta se inclina apenas
// hacia el cursor y un brillo verde la sigue. Es solo visual y solo con puntero
// fino (ratón); en pantallas táctiles y con "reducir movimiento" no hace nada
// (ver .inclinable en globals.css). El contenido conserva su comportamiento.
export default function Inclinable({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const caja = useRef<HTMLDivElement>(null);

  function alMover(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const el = caja.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
  }

  function alSalir() {
    caja.current?.style.setProperty("--rx", "0deg");
    caja.current?.style.setProperty("--ry", "0deg");
  }

  return (
    <div
      ref={caja}
      onPointerMove={alMover}
      onPointerLeave={alSalir}
      className={`inclinable ${className}`}
      style={style}
    >
      {children}
      <span className="inclinable-brillo" aria-hidden="true" />
    </div>
  );
}
