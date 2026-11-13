"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Va dentro de una fila que se desplaza de lado (la de áreas de la barra superior): al cargar deja
// a la vista el enlace marcado con aria-current, para que en el celular el área activa no quede
// cortada fuera de la pantalla. Solo mueve la fila, nunca la página.
export default function DesplazarAlActivo() {
  const ref = useRef<HTMLSpanElement>(null);
  const ruta = usePathname();

  useEffect(() => {
    const fila = ref.current?.parentElement;
    const activo = fila?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!fila || !activo) return;
    fila.scrollLeft = activo.offsetLeft - (fila.clientWidth - activo.offsetWidth) / 2;
  }, [ruta]);

  return <span ref={ref} hidden />;
}
