"use client";

// Un solo mecanismo por debajo (window.print, el motor de impresión nativo
// del navegador) pero dos botones separados: en el diálogo que abre,
// "Descargar PDF" guía a elegir el destino "Guardar como PDF" y "Imprimir"
// a elegir una impresora física — no hace falta una librería de PDF aparte,
// el PDF que genera el navegador ya es de texto seleccionable, no una
// imagen.
export default function ImprimirButton({ sufijo = "" }: { sufijo?: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded border border-black px-3 py-2 text-sm font-medium text-black"
      >
        Descargar PDF{sufijo}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded bg-black px-3 py-2 text-sm font-medium text-white"
      >
        Imprimir{sufijo}
      </button>
    </div>
  );
}
