// Formato canónico del número de PM: "PM<NUMERO>-<AÑO>", ej. "PM107-26".
// Los archivos reales lo traen escrito de muchas formas ("PM 107-26",
// "009-26-2", "pm-107/2026"...), así que se normaliza al ingerir para que
// el título del pedido sea siempre el mismo sin importar cómo venga.
//
// Varios PM pueden pertenecer a una misma Orden de Trabajo: se distinguen
// con un número al inicio, "<N>PM<ORDEN DE TRABAJO>-<AÑO>" (ej. "1PM134-26",
// "2PM134-26"). Cada uno es un pedido distinto y la OT ("134-26") los agrupa
// (columna generada pedidos.orden_trabajo). En archivos reales también
// viene como sufijo después del año ("PM 102-24-2"): es el mismo dato y se
// normaliza igual, "2PM102-24".

const DIGITOS_NUMERO = 3;

// Busca "<numero>-<año>" (separador -, /, _ o espacio). El año puede venir
// con 2 o 4 dígitos; cualquier sufijo extra (ej. el "-2" de "009-26-2") se
// ignora.
const PATRON_NUMERO_ANIO = /(?:PM)?\s*[-_ ]?\s*(\d{1,5})\s*[-/_ ]\s*(\d{4}|\d{2})(?!\d)/i;
const PATRON_SOLO_NUMERO = /(?:PM)?\s*[-_ ]?\s*(\d{1,5})/i;
// Número de PM dentro de la OT: dígitos al inicio seguidos de "PM".
const PATRON_PREFIJO = /^\s*(\d{1,3})\s*[-_ ]?\s*(?=PM)/i;

// Número de PM como sufijo: "<OT>-<AÑO>-<N>" al inicio del texto (puede
// venir precedido de "PM" u "OT").
const PATRON_SUFIJO =
  /^\s*(?:PM|O\.?\s*T\.?)?\s*[-_ ]?\s*\d{1,5}\s*[-/_ ]\s*(?:\d{4}|\d{2})\s*-\s*(\d{1,2})(?![\d.])/i;

// Etiqueta de una hoja extra antes del número de la OT, ej. la solicitud de
// cambio "SDC-1_OT 009-26-2": letras + número, y luego el número de la OT
// (con o sin "OT"/"PM" de por medio). Se conserva en el título del PM.
const PATRON_ETIQUETA =
  /^\s*((?!PM|OT)[A-Z]{2,5})\s*-?\s*(\d{1,3})\s*[_\s]+(?:O\.?\s*T\.?\s*)?(?=\d|PM)/i;

// `explicito`: el número viene antes de "PM" ("17 PM 193-24"), sin duda el
// número de PM. El sufijo ("193-24-2") es ambiguo: hay OT cuyo nombre lleva
// ese "-2" (la carpeta "193-24-2 PH MONTERREY" y todos sus PM dicen
// "193-24-2 ..." en la celda), así que un número explícito le gana.
function extraerPrefijo(texto: string): {
  prefijo: string | null;
  explicito: boolean;
  resto: string;
} {
  const m = texto.match(PATRON_PREFIJO);
  if (m) return { prefijo: String(Number(m[1])), explicito: true, resto: texto.slice(m[0].length) };
  const sufijo = texto.match(PATRON_SUFIJO);
  return { prefijo: sufijo ? String(Number(sufijo[1])) : null, explicito: false, resto: texto };
}

function formatear(numero: string, anio: string): string {
  const num = String(Number(numero)).padStart(DIGITOS_NUMERO, "0");
  const anio2 = anio.slice(-2);
  return `PM${num}-${anio2}`;
}

function extraerNumeroYAnio(texto: string): { numero: string; anio: string } | null {
  const m = texto.match(PATRON_NUMERO_ANIO);
  return m ? { numero: m[1], anio: m[2] } : null;
}

/**
 * Normaliza el número de PM al formato "PM<NUMERO>-<AÑO>".
 *
 * Prioridad: el valor de la celda "No. PEDIDO"; si ahí no viene el año, se
 * busca en el nombre del archivo; si tampoco, se usa el año de la fecha del
 * pedido (o el año actual). Si no se encuentra ningún número, se devuelve
 * el valor original sin tocar.
 */
export function normalizarNumeroPM(
  numeroPedido: string,
  opciones: { nombreArchivo?: string; fechaPedido?: string | null; hoy?: Date } = {}
): string {
  // "SDC-1_OT 009-26-2" -> "SDC-1 2PM009-26": un PM aparte (no una versión
  // de 2PM009-26) que sigue perteneciendo a la OT 009-26.
  const etiqueta = numeroPedido.match(PATRON_ETIQUETA);
  if (etiqueta) {
    const pm = normalizarNumeroPM(numeroPedido.slice(etiqueta[0].length), opciones);
    return `${etiqueta[1].toUpperCase()}-${Number(etiqueta[2])} ${pm}`;
  }

  const celda = extraerPrefijo(numeroPedido);
  const archivo = opciones.nombreArchivo ? extraerPrefijo(opciones.nombreArchivo) : null;
  const base = normalizarBase(celda.resto, { ...opciones, nombreArchivo: archivo?.resto });
  if (!base) return numeroPedido; // sin número reconocible

  // Número de PM dentro de la OT. El del nombre del archivo solo cuenta si
  // el archivo es de la misma OT. Orden: explícito de la celda, explícito
  // del archivo, sufijo de la celda, sufijo del archivo.
  const otArchivo = archivo?.prefijo ? extraerNumeroYAnio(archivo.resto) : null;
  const archivoValido =
    archivo?.prefijo && otArchivo && formatear(otArchivo.numero, otArchivo.anio) === base
      ? archivo
      : null;
  const candidatos = [
    celda.explicito ? celda.prefijo : null,
    archivoValido?.explicito ? archivoValido.prefijo : null,
    celda.prefijo,
    archivoValido?.prefijo ?? null,
  ];
  const prefijo = candidatos.find((p) => p != null) ?? null;
  return prefijo ? `${prefijo}${base}` : base;
}

/**
 * Aviso para la carga cuando la celda "No. PEDIDO" y el nombre del archivo
 * dan números de PM distintos dentro de la misma OT (se usó `pmFinal`).
 * null si coinciden o si alguno de los dos no trae número de PM.
 */
export function avisoNumeroPM(
  numeroPedido: string,
  pmFinal: string,
  opciones: { nombreArchivo?: string; fechaPedido?: string | null }
): string | null {
  if (!opciones.nombreArchivo) return null;
  const soloCelda = normalizarNumeroPM(numeroPedido, { fechaPedido: opciones.fechaPedido });
  const prefijoDe = (pm: string) => pm.match(/^(\d+)PM/i)?.[1] ?? null;
  const deCelda = prefijoDe(soloCelda);
  if (!deCelda || soloCelda === pmFinal || ordenDeTrabajo(soloCelda) !== ordenDeTrabajo(pmFinal)) {
    return null;
  }
  return `La celda "No. PEDIDO" dice «${numeroPedido}» (PM ${deCelda}), pero el nombre del archivo indica ${pmFinal}; se cargó como ${pmFinal}.`;
}

/**
 * Orden de Trabajo a la que pertenece un PM ya normalizado: "134-26" para
 * "PM134-26", "1PM134-26" o "2PM134-26". null si no tiene el formato.
 * Espejo de la columna generada pedidos.orden_trabajo.
 */
export function ordenDeTrabajo(numeroPedido: string): string | null {
  return numeroPedido.match(/PM\s*(\d+-\d{2})/i)?.[1] ?? null;
}

function normalizarBase(
  numeroPedido: string,
  opciones: { nombreArchivo?: string; fechaPedido?: string | null; hoy?: Date }
): string | null {
  const desdeCelda = extraerNumeroYAnio(numeroPedido);
  if (desdeCelda) return formatear(desdeCelda.numero, desdeCelda.anio);

  const numeroCelda = numeroPedido.match(PATRON_SOLO_NUMERO)?.[1];

  if (opciones.nombreArchivo) {
    const desdeArchivo = extraerNumeroYAnio(opciones.nombreArchivo);
    // Solo se usa el nombre del archivo si coincide con el número de la
    // celda (o si la celda no trae número): evita mezclar dos PM distintos.
    if (desdeArchivo && (!numeroCelda || Number(numeroCelda) === Number(desdeArchivo.numero))) {
      return formatear(desdeArchivo.numero, desdeArchivo.anio);
    }
  }

  if (!numeroCelda) return null;

  const anio =
    opciones.fechaPedido?.slice(0, 4) ?? String((opciones.hoy ?? new Date()).getFullYear());
  return formatear(numeroCelda, anio);
}
