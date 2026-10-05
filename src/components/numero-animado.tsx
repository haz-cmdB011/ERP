"use client";

import { useEffect, useRef } from "react";

// Número que sube de 0 a su valor al aparecer. El servidor entrega ya el valor
// final (sin JavaScript o con movimiento reducido se ve tal cual); la cuenta
// se hace escribiendo directo en el nodo, sin estado de React.
export default function NumeroAnimado({
  valor,
  duracionMs = 900,
}: {
  valor: number;
  duracionMs?: number;
}) {
  const nodo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = nodo.current;
    if (!el || valor <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const formato = (n: number) => Math.round(n).toLocaleString("es-MX");
    let cuadro = 0;
    let inicio: number | null = null;
    el.textContent = formato(0);

    const paso = (ahora: number) => {
      inicio ??= ahora;
      const t = Math.min((ahora - inicio) / duracionMs, 1);
      const suave = 1 - Math.pow(1 - t, 3); // frena al final
      el.textContent = formato(valor * suave);
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => {
      cancelAnimationFrame(cuadro);
      el.textContent = formato(valor);
    };
  }, [valor, duracionMs]);

  return (
    <span ref={nodo} suppressHydrationWarning>
      {valor.toLocaleString("es-MX")}
    </span>
  );
}
