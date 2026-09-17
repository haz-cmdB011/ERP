"use client";

export default function ImprimirButton({ sufijo = "" }: { sufijo?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-black px-3 py-2 text-sm font-medium text-white print:hidden"
    >
      Imprimir{sufijo}
    </button>
  );
}
