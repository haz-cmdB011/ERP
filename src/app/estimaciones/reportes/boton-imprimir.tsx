"use client";

// Abre el diálogo de impresión del navegador (ahí se elige "Guardar como PDF").
// La página oculta navegación y formularios al imprimir (clase print:hidden).
export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
    >
      Imprimir / PDF
    </button>
  );
}
