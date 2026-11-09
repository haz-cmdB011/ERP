"use client";

// Abre el diálogo de impresión del navegador (también sirve para guardar en PDF).
export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-brand-50 print:hidden"
    >
      Imprimir
    </button>
  );
}
