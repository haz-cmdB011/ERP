// Electrificación solo se asigna a muebles padre que la llevan. Hay dos señales:
//  - iluminación en la descripción (misma regla que Estimaciones; espejo de la
//    función SQL descripcion_incluye_iluminacion), y
//  - la palabra "electrificación" en el propio mueble o en alguno de sus
//    componentes (ej. "CHAROLA ELECTRIFICACIÓN"; espejo de admite_electrificacion).
// La base vuelve a exigirlo al asignar. Estimaciones conserva su regla (solo
// iluminación del padre).

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const ELEMENTOS = "(iluminacion|leds?|lamparas?|luminari[ao]s?|focos?|spots?)";
// "NO INCLUYE ILUMINACIÓN", "SIN LED", "NO LLEVA LÁMPARA"...: se descartan.
const NEGACION = new RegExp(`\\b(no incluyen?|no llevan?|sin)( (la|el|las|los))? ${ELEMENTOS}\\b`, "g");
const NEGACION_ELECTRIFICACION = /\b(no incluyen?|no llevan?|sin)( (la|el|las|los))? electrificacion\b/g;

function normalizar(descripcion: string | null | undefined): string {
  return sinAcentos((descripcion ?? "").toLowerCase()).replace(/\s+/g, " ");
}

export function descripcionIncluyeIluminacion(descripcion: string | null | undefined): boolean {
  const d = normalizar(descripcion).replace(NEGACION, "");
  return d.includes("ilumina") || /\b(leds?|lamparas?|luminari[ao]s?|focos?|spots?)\b/.test(d);
}

export function descripcionMencionaElectrificacion(descripcion: string | null | undefined): boolean {
  return /\belectrific/.test(normalizar(descripcion).replace(NEGACION_ELECTRIFICACION, ""));
}

// Un mueble admite Electrificación si él o alguno de sus componentes la menciona
// (o lleva iluminación).
export function admiteElectrificacion(
  descripcionMueble: string | null | undefined,
  descripcionesComponentes: ReadonlyArray<string | null | undefined> = []
): boolean {
  return [descripcionMueble, ...descripcionesComponentes].some(
    (d) => descripcionIncluyeIluminacion(d) || descripcionMencionaElectrificacion(d)
  );
}
