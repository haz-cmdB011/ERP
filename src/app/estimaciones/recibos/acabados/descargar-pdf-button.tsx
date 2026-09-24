"use client";

import { useState } from "react";
import { generarPdfDesdeElemento } from "./generar-pdf";

export default function DescargarPdfButton({
  nombreArchivo,
  selector = "[data-informe]",
  etiqueta = "Descargar PDF",
  onListo,
}: {
  nombreArchivo: string;
  selector?: string;
  etiqueta?: string;
  onListo?: () => void;
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
      await generarPdfDesdeElemento(elemento, nombreArchivo);
      onListo?.();
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
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {generando ? "Generando PDF..." : etiqueta}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
