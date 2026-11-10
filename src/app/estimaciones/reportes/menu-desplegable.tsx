"use client";

import { useEffect, useRef } from "react";

// Botón con un panel flotante (elegir periodo, filtros). Se cierra al hacer clic
// fuera o con Escape, para que no se quede tapando el reporte.
export default function MenuDesplegable({
  etiqueta,
  alinear = "izquierda",
  children,
}: {
  etiqueta: React.ReactNode;
  alinear?: "izquierda" | "derecha";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // El panel se alinea con el botón, pero en celular el botón no está pegado al borde y el panel
  // (casi tan ancho como la pantalla) se salía y se cortaba. Al abrirlo se corre lo necesario para
  // quedar dentro, con 1 rem de margen.
  function acomodar() {
    const d = ref.current;
    const p = panel.current;
    if (!d?.open || !p) return;
    p.style.translate = "";
    const r = p.getBoundingClientRect();
    const margen = 16;
    const ancho = document.documentElement.clientWidth;
    let dx = 0;
    if (r.right > ancho - margen) dx = ancho - margen - r.right;
    if (r.left + dx < margen) dx = margen - r.left;
    if (dx !== 0) p.style.translate = `${Math.round(dx)}px 0`;
  }

  useEffect(() => {
    function cerrarFuera(e: Event) {
      const d = ref.current;
      if (d?.open && e.target instanceof Node && !d.contains(e.target)) d.open = false;
    }
    function cerrarConEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("pointerdown", cerrarFuera);
    document.addEventListener("keydown", cerrarConEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarFuera);
      document.removeEventListener("keydown", cerrarConEscape);
    };
  }, []);

  return (
    <details ref={ref} onToggle={acomodar} className="group relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-brand-50 group-open:bg-slate-50 sm:min-h-9">
        {etiqueta}
        <span aria-hidden="true" className="text-xs text-slate-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div
        ref={panel}
        className={`absolute z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg ${
          alinear === "derecha" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </details>
  );
}
