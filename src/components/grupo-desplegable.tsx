"use client";

import { useEffect, useState } from "react";

// <tbody> de un mueble (padre) con sus componentes (hijos) que se desmontan
// DESPUÉS de animar su salida: al cerrar, los hijos se retiran en cascada (de
// abajo hacia arriba) y recién entonces dejan de existir. Al abrir entran con
// la animación de .fila-hija (ver globals.css).
//
// `children` recibe si hay que dibujar las filas hijas (abierto o cerrándose).
// Cada fila hija debe llevar la clase "fila-hija" y su posición en "--i".
export default function GrupoDesplegable({
  abierto,
  total,
  className,
  children,
}: {
  abierto: boolean;
  total: number;
  className?: string;
  children: (mostrarHijos: boolean) => React.ReactNode;
}) {
  const [montado, setMontado] = useState(abierto);
  const [previo, setPrevio] = useState(abierto);

  // Ajuste durante el render (patrón de React para derivar estado de props):
  // al abrir se montan de inmediato las filas.
  if (abierto !== previo) {
    setPrevio(abierto);
    if (abierto) setMontado(true);
  }

  // Al cerrar se espera a que termine la animación de salida para desmontar.
  useEffect(() => {
    if (abierto || !montado) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const espera = sinMovimiento ? 0 : 220 + total * 25 + 40;
    const temporizador = setTimeout(() => setMontado(false), espera);
    return () => clearTimeout(temporizador);
  }, [abierto, montado, total]);

  return (
    <tbody
      className={className}
      data-cerrando={!abierto && montado ? "" : undefined}
      style={{ "--n": total } as React.CSSProperties}
    >
      {children(abierto || montado)}
    </tbody>
  );
}
