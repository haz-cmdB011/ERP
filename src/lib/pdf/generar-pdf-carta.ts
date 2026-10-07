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
//
// Para que no se trabe en celulares y tabletas con muchas fichas (un lote de
// viajeros llega a 20 o más):
//   * Entre una ficha y otra se le devuelve el control al navegador, para que la
//     pantalla siga respondiendo, y se avisa el progreso (`alProgreso`).
//   * Cada imagen se libera apenas se pasa al PDF. Los navegadores de celular
//     topan la memoria total de imágenes; al pasarse, el PDF sale en blanco.
//   * La escala baja en fichas muy largas: un canvas de más de ~16 millones de
//     píxeles queda en blanco en iOS.
// html2canvas-pro (no el clásico) porque Tailwind v4 usa colores oklch().

// Ancho (px CSS) al que se maqueta la ficha. 640 px sobre 540 pt útiles
// (8.5" − 2 × 0.5") ≈ 0.84 pt/px: un text-xs (12 px) sale en ~10 pt.
const ANCHO_MAQUETA_PX = 640;
const MARGEN_PT = 36; // 0.5"
// Hasta este exceso sobre el alto útil se reduce para caber en una hoja en
// lugar de partir la ficha.
const TOLERANCIA_UNA_HOJA = 1.15;
const ESCALA_MAXIMA = 3;
// iOS Safari deja en blanco un canvas de más de 16 777 216 píxeles.
const MAX_PIXELES_CANVAS = 16_000_000;

// Escala con la que se captura una ficha de `altoPx` px de alto (a ANCHO_MAQUETA_PX
// de ancho): la máxima mientras el canvas no pase del tope; si no, la que lo deja justo.
export function escalaParaFicha(altoPx: number): number {
  const pixeles = ANCHO_MAQUETA_PX * Math.max(altoPx, 1);
  return Math.max(1, Math.min(ESCALA_MAXIMA, Math.sqrt(MAX_PIXELES_CANVAS / pixeles)));
}

// Alto (px) que tendrá la ficha ya maquetada a ANCHO_MAQUETA_PX. Si en pantalla es más
// ancha, a 640 px queda más alta: se estima por proporción (nunca menos que el actual).
function altoEstimado(elemento: HTMLElement): number {
  return elemento.scrollHeight * Math.max(1, elemento.offsetWidth / ANCHO_MAQUETA_PX);
}

export interface OpcionesPdf {
  /** Se llama con (0, total) al empezar y con (hechas, total) al terminar cada ficha. */
  alProgreso?: (hechas: number, total: number) => void;
}

// Devuelve el control al navegador para que pinte y atienda toques. Con la pestaña
// oculta no hace falta (y setTimeout se frenaría a 1 s por vuelta).
function cederAlNavegador(): Promise<void> {
  if (typeof document !== "undefined" && document.hidden) return Promise.resolve();
  return new Promise((resolver) => setTimeout(resolver, 0));
}

// Suelta la memoria del canvas sin esperar al recolector de basura.
function liberar(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

type Pdf = InstanceType<(typeof import("jspdf"))["jsPDF"]>;

// Pasa la captura de una ficha al PDF: en una hoja (si cabe, o casi), o repartida
// en franjas del alto de una hoja. Cada ficha empieza en hoja nueva.
function agregarFicha(doc: Pdf, canvas: HTMLCanvasElement, nuevaPagina: () => void) {
  const anchoUtil = doc.internal.pageSize.getWidth() - MARGEN_PT * 2;
  const altoUtil = doc.internal.pageSize.getHeight() - MARGEN_PT * 2;
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
    return;
  }

  // Más larga: se reparte en franjas del alto de una hoja.
  const altoPaginaPx = Math.floor(altoUtil / escala);
  for (let offsetPx = 0; offsetPx < canvas.height; offsetPx += altoPaginaPx) {
    const altoFranjaPx = Math.min(altoPaginaPx, canvas.height - offsetPx);
    const franja = document.createElement("canvas");
    franja.width = canvas.width;
    franja.height = altoFranjaPx;
    try {
      const ctx = franja.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(canvas, 0, offsetPx, canvas.width, altoFranjaPx, 0, 0, canvas.width, altoFranjaPx);
      nuevaPagina();
      doc.addImage(franja.toDataURL("image/png"), "PNG", MARGEN_PT, MARGEN_PT, anchoUtil, altoFranjaPx * escala);
    } finally {
      liberar(franja);
    }
  }
}

export async function generarPdfCarta(
  elementos: HTMLElement[],
  nombreArchivo: string,
  { alProgreso }: OpcionesPdf = {}
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let hayPagina = false;
  function nuevaPagina() {
    if (hayPagina) doc.addPage();
    hayPagina = true;
  }

  alProgreso?.(0, elementos.length);
  for (const [indice, elemento] of elementos.entries()) {
    const canvas = await html2canvas(elemento, {
      scale: escalaParaFicha(altoEstimado(elemento)),
      backgroundColor: "#ffffff",
      onclone: (_doc, copia) => {
        copia.style.width = `${ANCHO_MAQUETA_PX}px`;
        copia.style.maxWidth = "none";
        copia.style.margin = "0";
      },
    });

    try {
      agregarFicha(doc, canvas, nuevaPagina);
    } finally {
      liberar(canvas);
    }
    alProgreso?.(indice + 1, elementos.length);
    await cederAlNavegador();
  }

  doc.save(nombreArchivo);
}
