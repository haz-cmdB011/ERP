"use client";

import { useState } from "react";
import { generarPdfCarta } from "@/lib/pdf/generar-pdf-carta";

// Descarga directa: no pasa por el diálogo de impresión del navegador.
// Captura el elemento marcado con [data-informe] como imagen y arma el PDF
// tamaño carta en el cliente (ver src/lib/pdf/generar-pdf-carta.ts).
export default function DescargarPdfButton({
  nombreArchivo,
  selector = "[data-informe]",
}: {
  nombreArchivo: string;
  selector?: string;
}) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setGenerando(true);
    setError(null);
    try {
      const elemento = document.querySelector<HTMLElement>(selector);
      if (!elemento) {
        setError("No se encontró contenido para generar el PDF.");
        return;
      }

      await generarPdfCarta([elemento], nombreArchivo);
    } catch {
      setError("No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <button
        type="button"
        onClick={descargar}
        disabled={generando}
        className="rounded border border-brand-700 px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-50"
      >
        {generando ? "Generando PDF..." : "Descargar PDF"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
