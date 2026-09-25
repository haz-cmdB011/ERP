// Generador de PDF compartido por el botón de descarga y el guardado
// automático. Antes se escalaba la captura de html2canvas a un solo alto de
// página (`Math.min(alturaCalculada, altoUtil)`), lo que aplastaba la
// imagen verticalmente cuando el recibo no cabía en una sola hoja carta —
// se veía "chaparro". Aquí la escala ancho→pt es siempre la misma en ambos
// ejes (nunca se deforma) y, si el contenido no cabe en una página, se
// reparte en varias cortando el canvas por franjas.
export async function generarPdfDesdeElemento(
  elemento: HTMLElement,
  nombreArchivo: string
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 24;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const canvas = await html2canvas(elemento, { scale: 2, backgroundColor: "#ffffff" });

  // Una sola escala para ambos ejes: el alto siempre guarda la proporción
  // real del contenido, nunca se estira ni se comprime.
  const escala = usableWidth / canvas.width;
  const altoPaginaEnPx = Math.floor(usableHeight / escala);

  if (canvas.height <= altoPaginaEnPx) {
    const alturaPt = canvas.height * escala;
    doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, usableWidth, alturaPt);
    doc.save(nombreArchivo);
    return;
  }

  let offsetPx = 0;
  let pagina = 0;
  while (offsetPx < canvas.height) {
    const alturaFranjaPx = Math.min(altoPaginaEnPx, canvas.height - offsetPx);

    const franja = document.createElement("canvas");
    franja.width = canvas.width;
    franja.height = alturaFranjaPx;
    const ctx = franja.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(
      canvas,
      0,
      offsetPx,
      canvas.width,
      alturaFranjaPx,
      0,
      0,
      canvas.width,
      alturaFranjaPx
    );

    if (pagina > 0) doc.addPage();
    doc.addImage(
      franja.toDataURL("image/png"),
      "PNG",
      margin,
      margin,
      usableWidth,
      alturaFranjaPx * escala
    );

    offsetPx += alturaFranjaPx;
    pagina += 1;
  }

  doc.save(nombreArchivo);
}
