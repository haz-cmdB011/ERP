// Generador de PDF tamaño carta compartido por todas las áreas (recibos de
// Estimaciones, informes de Calidad y hojas de viajero de Producción).
//
// Antes cada botón capturaba la ficha a su ancho de pantalla (angosta, tipo
// ticket) y recortaba el alto a una sola hoja con
// `Math.min(alturaCalculada, altoUtil)`: la imagen quedaba aplastada y el
// contenido se veía comprimido en la hoja. Aquí:
//   * Cada ficha se maqueta en una copia a un ancho fijo proporcional al
//     área útil de la hoja carta, así llena la hoja con letra legible.
//   * La escala es la misma en ambos ejes: nunca se deforma.
//   * Si apenas se pasa de una hoja se reduce un poco para que quepa en una;
//     si es más larga se reparte en varias hojas.
//   * Cada ficha empieza en hoja nueva.
// Las librerías (jspdf + html2canvas-pro) se cargan solo al generar.
// html2canvas-pro (no el clásico) porque Tailwind v4 usa colores oklch().

// Ancho (px CSS) al que se maqueta la ficha. 640 px sobre 540 pt útiles
// (8.5" − 2 × 0.5") ≈ 0.84 pt/px: un text-xs (12 px) sale en ~10 pt.
const ANCHO_MAQUETA_PX = 640;
const MARGEN_PT = 36; // 0.5"
// Hasta este exceso sobre el alto útil se reduce para caber en una hoja en
// lugar de partir la ficha.
const TOLERANCIA_UNA_HOJA = 1.15;

export async function generarPdfCarta(
  elementos: HTMLElement[],
  nombreArchivo: string
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const anchoUtil = doc.internal.pageSize.getWidth() - MARGEN_PT * 2;
  const altoUtil = doc.internal.pageSize.getHeight() - MARGEN_PT * 2;
  let hayPagina = false;

  function nuevaPagina() {
    if (hayPagina) doc.addPage();
    hayPagina = true;
  }

  for (const elemento of elementos) {
    const canvas = await html2canvas(elemento, {
      scale: 3,
      backgroundColor: "#ffffff",
      onclone: (_doc, copia) => {
        copia.style.width = `${ANCHO_MAQUETA_PX}px`;
        copia.style.maxWidth = "none";
        copia.style.margin = "0";
      },
    });

    const escala = anchoUtil / canvas.width;
    const altoPt = canvas.height * escala;

    if (altoPt <= altoUtil * TOLERANCIA_UNA_HOJA) {
      // Cabe (o casi) en una hoja: se ajusta sin deformar y se centra.
      const ajuste = Math.min(1, altoUtil / altoPt);
      const ancho = anchoUtil * ajuste;
      nuevaPagina();
      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        MARGEN_PT + (anchoUtil - ancho) / 2,
        MARGEN_PT,
        ancho,
        altoPt * ajuste
      );
      continue;
    }

    // Más larga: se reparte en franjas del alto de una hoja.
    const altoPaginaPx = Math.floor(altoUtil / escala);
    for (let offsetPx = 0; offsetPx < canvas.height; offsetPx += altoPaginaPx) {
      const altoFranjaPx = Math.min(altoPaginaPx, canvas.height - offsetPx);
      const franja = document.createElement("canvas");
      franja.width = canvas.width;
      franja.height = altoFranjaPx;
      const ctx = franja.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(
        canvas,
        0,
        offsetPx,
        canvas.width,
        altoFranjaPx,
        0,
        0,
        canvas.width,
        altoFranjaPx
      );
      nuevaPagina();
      doc.addImage(
        franja.toDataURL("image/png"),
        "PNG",
        MARGEN_PT,
        MARGEN_PT,
        anchoUtil,
        altoFranjaPx * escala
      );
    }
  }

  doc.save(nombreArchivo);
}
