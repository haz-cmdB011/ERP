"use client";

// Abre el diálogo de impresión del navegador (ahí se elige "Guardar como PDF").
// La página oculta navegación y formularios al imprimir (clase print:hidden) y
// despliega las secciones para que salgan completas; al terminar las deja como
// estaban.
export default function BotonImprimir() {
  function imprimir() {
    const cerradas = [...document.querySelectorAll<HTMLDetailsElement>("main details")].filter(
      (d) => !d.open
    );
    for (const d of cerradas) d.open = true;
    window.addEventListener(
      "afterprint",
      () => {
        for (const d of cerradas) d.open = false;
      },
      { once: true }
    );
    window.print();
  }

  return (
    <button
      type="button"
      onClick={imprimir}
      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
    >
      Imprimir / PDF
    </button>
  );
}
