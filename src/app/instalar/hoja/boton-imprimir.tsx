"use client";

export default function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-5 text-base font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-400 focus-visible:outline-brand-700"
    >
      Imprimir hoja
    </button>
  );
}
