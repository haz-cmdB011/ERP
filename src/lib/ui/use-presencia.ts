"use client";

import { useEffect, useState } from "react";

// Duración de la salida (diálogos, menús, avisos). Debe coincidir con las
// animaciones de [data-saliendo] en globals.css.
export const SALIDA_MS = 200;

// Mantiene montado algo que se cierra el tiempo justo para que se vaya con
// animación en vez de desaparecer de golpe. Uso:
//
//   const { montado, saliendo } = usePresencia(abierto);
//   {montado && <div data-saliendo={saliendo || undefined}>…</div>}
//
// Mientras sale no recibe clics (globals.css). Con "reducir movimiento" se
// desmonta al instante.
export function usePresencia(abierto: boolean, duracion = SALIDA_MS) {
  const [montado, setMontado] = useState(abierto);
  // Ajuste durante el render (patrón de React para estado derivado): al abrir
  // se monta en el mismo render, sin esperar a un efecto.
  if (abierto && !montado) setMontado(true);

  useEffect(() => {
    if (abierto || !montado) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setMontado(false), sinMovimiento ? 0 : duracion);
    return () => clearTimeout(t);
  }, [abierto, montado, duracion]);

  return { montado, saliendo: montado && !abierto };
}
