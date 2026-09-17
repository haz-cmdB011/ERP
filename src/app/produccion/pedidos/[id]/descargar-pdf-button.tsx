"use client";

import { useState } from "react";

// Descarga directa: no pasa por el diálogo de impresión del navegador.
// Captura cada ficha (elementos marcados con [data-viajero-ficha], una por
// página del PDF) como imagen y arma el PDF en el cliente. Las librerías
// (jspdf + html2canvas-pro) se cargan solo al hacer clic para no pesar la
// carga inicial de la página. html2canvas-pro (no el html2canvas clásico)
// porque Tailwind v4 calcula colores en oklch(), que la librería original
// no sabe interpretar.
export default function DescargarPdfButton({
  nombreArchivo,
  selector = "[data-viajero-ficha]",
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

      const fichas = Array.from(document.querySelectorAll<HTMLElement>(selector));
      if (fichas.length === 0) {
        setError("No se encontró contenido para generar el PDF.");
        return;
      }

      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 24;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      for (let i = 0; i < fichas.length; i++) {
        const canvas = await html2canvas(fichas[i], { scale: 2, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");
        const imgHeight = Math.min((canvas.height * usableWidth) / canvas.width, usableHeight);
        if (i > 0) doc.addPage();
        doc.addImage(imgData, "PNG", margin, margin, usableWidth, imgHeight);
      }

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
