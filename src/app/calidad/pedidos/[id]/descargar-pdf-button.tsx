"use client";

import { useState } from "react";

// Copia local del botón de Producción (descargar-pdf-button.tsx) —
// duplicado a propósito para no tocar ningún archivo bajo
// src/app/produccion/. Descarga directa: no pasa por el diálogo de
// impresión del navegador. Captura el elemento marcado con [data-informe]
// como imagen y arma el PDF en el cliente. Las librerías (jspdf +
// html2canvas-pro) se cargan solo al hacer clic. html2canvas-pro (no el
// html2canvas clásico) porque Tailwind v4 calcula colores en oklch(), que
// la librería original no sabe interpretar.
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
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      const elemento = document.querySelector<HTMLElement>(selector);
      if (!elemento) {
        setError("No se encontró contenido para generar el PDF.");
        return;
      }

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 24;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const canvas = await html2canvas(elemento, { scale: 2, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const imgHeight = Math.min((canvas.height * usableWidth) / canvas.width, usableHeight);
      doc.addImage(imgData, "PNG", margin, margin, usableWidth, imgHeight);

      doc.save(nombreArchivo);
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
        className="rounded border border-black px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {generando ? "Generando PDF..." : "Descargar PDF"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
