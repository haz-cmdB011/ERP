"use client";

import Chevron from "./chevron";

// Flecha de las filas que se despliegan (un mueble con sus componentes). Antes la fila entera se
// abría con clic, pero no había nada que se pudiera alcanzar con Tab ni anunciar a un lector de
// pantalla: con teclado era imposible desplegar un mueble. Ahora la flecha es un botón de verdad
// (aria-expanded + nombre accesible); la fila sigue abriéndose con clic o toque como siempre.
export default function BotonDesplegar({
  abierto,
  alAlternar,
  descripcion,
  className = "h-3.5 w-3.5",
}: {
  abierto: boolean;
  alAlternar: () => void;
  /** Qué se muestra u oculta: "los 3 componentes del ítem 12". Completa "Mostrar …" / "Ocultar …". */
  descripcion: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // La fila también alterna al hacer clic: sin esto se abriría y se cerraría a la vez.
        e.stopPropagation();
        alAlternar();
      }}
      aria-expanded={abierto}
      aria-label={`${abierto ? "Ocultar" : "Mostrar"} ${descripcion}`}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-700"
    >
      <Chevron abierto={abierto} className={className} />
    </button>
  );
}
