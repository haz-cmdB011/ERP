"use client";

import { useEffect, useRef } from "react";

// Sección del dashboard que se despliega al hacer clic en su título. Empieza
// cerrada; si la URL apunta a ella (#id, como el enlace "PM contra cobrado" de
// arriba o el de regreso desde el detalle de una O.T.) se abre sola y se
// muestra.
export default function SeccionDesplegable({
  id,
  titulo,
  descripcion,
  resumen,
  children,
}: {
  id: string;
  titulo: string;
  descripcion?: string;
  // Dato corto a la derecha del título, visible aun con la sección cerrada.
  resumen?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function abrirSiEsMia() {
      if (window.location.hash !== `#${id}` || !ref.current) return;
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    }
    abrirSiEsMia();
    window.addEventListener("hashchange", abrirSiEsMia);
    return () => window.removeEventListener("hashchange", abrirSiEsMia);
  }, [id]);

  return (
    <details
      ref={ref}
      id={id}
      className="group scroll-mt-4 rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-slate-50">
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold text-slate-900">{titulo}</span>
          {descripcion && <span className="mt-0.5 block text-sm text-slate-500">{descripcion}</span>}
        </span>
        {resumen && (
          <span className="hidden shrink-0 text-sm font-medium text-slate-600 sm:block">
            {resumen}
          </span>
        )}
        <span
          aria-hidden="true"
          className="text-slate-500 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}
