"use client";

// Copia local del botón de Producción (imprimir-button.tsx) — duplicado a
// propósito para no tocar ningún archivo bajo src/app/produccion/.
export default function ImprimirButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-black px-3 py-2 text-sm font-medium text-white print:hidden"
    >
      Imprimir
    </button>
  );
}
