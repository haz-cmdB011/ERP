// Superficie Sólida solo se asigna a muebles padre que la llevan: el mueble o
// alguno de sus componentes menciona "superficie sólida", "solid surface" o una
// marca del material (Corian, Krion, Hi-Macs). Espejo de la función SQL
// admite_superficie_solida; la base vuelve a exigirlo al asignar.

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const MATERIAL = "(superficie solida|solid surface|corian|krion|hi ?macs)";
// "SIN SUPERFICIE SÓLIDA", "NO INCLUYE CORIAN"...: se descartan.
const NEGACION = new RegExp(`\\b(no incluyen?|no llevan?|sin)( (la|el|las|los|de))? ${MATERIAL}\\b`, "g");
const MENCION = new RegExp(`\\b${MATERIAL}\\b`);

export function descripcionMencionaSuperficieSolida(descripcion: string | null | undefined): boolean {
  const d = sinAcentos((descripcion ?? "").toLowerCase()).replace(/[\s-]+/g, " ");
  return MENCION.test(d.replace(NEGACION, ""));
}

export function admiteSuperficieSolida(
  descripcionMueble: string | null | undefined,
  descripcionesComponentes: ReadonlyArray<string | null | undefined> = []
): boolean {
  return [descripcionMueble, ...descripcionesComponentes].some(descripcionMencionaSuperficieSolida);
}
