"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Barra fina verde arriba de la pantalla mientras se abre otra página: confirma
// que el clic hizo algo, sobre todo en pantallas que tardan. Se enciende al
// hacer clic en un enlace interno a otra ruta y se apaga sola cuando cambia la
// ruta (no hay estado que limpiar: se compara la ruta de entonces con la
// actual). Si la navegación no ocurre, la propia animación la desvanece.
export default function BarraProgreso() {
  const ruta = usePathname();
  const [desde, setDesde] = useState<{ ruta: string; n: number } | null>(null);

  useEffect(() => {
    function alHacerClic(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as Element | null)?.closest?.("a");
      if (!enlace || (enlace.target && enlace.target !== "_self") || enlace.hasAttribute("download")) {
        return;
      }
      const url = new URL(enlace.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setDesde((previo) => ({ ruta: window.location.pathname, n: (previo?.n ?? 0) + 1 }));
    }
    // En captura: el <Link> de Next cancela el clic (preventDefault) para
    // navegar por su cuenta, y en la fase normal ya no se vería el clic limpio.
    document.addEventListener("click", alHacerClic, true);
    return () => document.removeEventListener("click", alHacerClic, true);
  }, []);

  if (!desde || desde.ruta !== ruta) return null;
  return (
    <div
      key={desde.n}
      aria-hidden="true"
      className="barra-progreso pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] bg-brand-500 shadow-[0_0_8px_var(--color-brand-500)] print:hidden"
    />
  );
}
