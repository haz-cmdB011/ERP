"use client";

import { useState } from "react";
import { generarPdfCarta } from "@/lib/pdf/generar-pdf-carta";

// Descarga directa: no pasa por el diálogo de impresión del navegador.
// Captura cada ficha (elementos marcados con [data-viajero-ficha], una por
// página del PDF) como imagen y arma el PDF tamaño carta en el cliente
// (ver src/lib/pdf/generar-pdf-carta.ts).
export default function DescargarPdfButton({
  nombreArchivo,
  selector = "[data-viajero-ficha]",
}: {
  nombreArchivo: string;
  selector?: string;
}) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fichas ya capturadas / total: con un lote grande se ve que avanza y no que se trabó.
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);

  async function descargar() {
    setGenerando(true);
    setError(null);
    try {
      const fichas = Array.from(document.querySelectorAll<HTMLElement>(selector));
      if (fichas.length === 0) {
        setError("No se encontró contenido para generar el PDF.");
        return;
      }

      await generarPdfCarta(fichas, nombreArchivo, {
        alProgreso: (hechas, total) => setProgreso({ hechas, total }),
      });
    } catch {
      setError("No se pudo generar el PDF.");
    } finally {
      setGenerando(false);
      setProgreso(null);
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
        {generando
          ? progreso && progreso.total > 1
            ? `Generando PDF... ${progreso.hechas} de ${progreso.total}`
            : "Generando PDF..."
          : "Descargar PDF"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
