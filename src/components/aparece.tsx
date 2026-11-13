"use client";

import { usePresencia } from "@/lib/ui/use-presencia";

const DURACION_MS = 320;

// Sección que se despliega dentro de la pantalla (el detalle de un mueble, los
// PM de una O.T.): crece desde cero al abrir y se pliega al cerrar, en vez de
// aparecer y desaparecer de golpe. A diferencia de Colapsable, cerrado no queda
// montado: el contenido empieza de nuevo cada vez, como con `{abierto && …}`.
// Solo recorta mientras se mueve, así los menús de adentro pueden salirse.
// `className` va en el contenedor del contenido.
export default function Aparece({
  abierto,
  children,
  className = "",
}: {
  abierto: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { montado, saliendo } = usePresencia(abierto, DURACION_MS);
  if (!montado) return null;
  return (
    <div className={`aparece ${saliendo ? "" : "aparece-abierto"}`} data-saliendo={saliendo || undefined}>
      <div className={`min-h-0 ${className}`}>{children}</div>
    </div>
  );
}
