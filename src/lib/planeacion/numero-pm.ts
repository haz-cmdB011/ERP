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
// Número de PM dentro de la OT: dígitos seguidos de "PM", al inicio o
// después de otra palabra ("ERICK 11 PM 193-24 ..." en archivos de trabajo).
const PATRON_PREFIJO = /(?:^|\s)(\d{1,3})\s*[-_ ]?\s*(?=PM)/i;

// Número de PM como sufijo: "<OT>-<AÑO>-<N>", justo después de la primera
// OT del texto (puede ir precedida de "PM", "OT" u otras palabras, como en
// "REVISION PM 033-25-2 ..."). Solo ahí: una fecha más adelante no cuenta.
const PATRON_SUFIJO_TRAS_OT = /^\s*-\s*(\d{1,2})(?![\d.])/;

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
  if (m?.index != null) {
    return { prefijo: String(Number(m[1])), explicito: true, resto: texto.slice(m.index + m[0].length) };
  }
  const ot = texto.match(PATRON_NUMERO_ANIO);
  const sufijo =
    ot?.index != null ? texto.slice(ot.index + ot[0].length).match(PATRON_SUFIJO_TRAS_OT) : null;
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
 *
 * Si el PM no trae su número dentro de la OT ni en la celda ni en el nombre
 * del archivo, lo distingue el nombre del archivo: "PM 193-24 - PH MONTERREY
 * SOTANO 1 10.1.25.xlsx" queda "PM193-24 SOTANO 1" (ver etiquetaDelArchivo;
 * requiere `proyecto`).
 */
export function normalizarNumeroPM(
  numeroPedido: string,
  opciones: {
    nombreArchivo?: string;
    fechaPedido?: string | null;
    // Proyecto de la celda "PROYECTO:", para quitarlo de la etiqueta.
    proyecto?: string;
    hoy?: Date;
  } = {}
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
  // del archivo, sufijo del archivo; luego la etiqueta del nombre del
  // archivo y, al último, el sufijo de la celda (en la OT 193-24 la celda
  // dice "193-24-2 ..." en todos los PM: ese "-2" es de la OT).
  const otArchivo = archivo?.prefijo ? extraerNumeroYAnio(archivo.resto) : null;
  const archivoValido =
    archivo?.prefijo && otArchivo && formatear(otArchivo.numero, otArchivo.anio) === base
      ? archivo
      : null;
  const prefijo =
    (celda.explicito ? celda.prefijo : null) ?? archivoValido?.prefijo ?? null;
  if (prefijo) return `${prefijo}${base}`;

  if (opciones.nombreArchivo && opciones.proyecto != null) {
    const nombre = etiquetaDelArchivo(opciones.nombreArchivo, base, opciones.proyecto);
    if (nombre) return `${base} ${nombre}`;
  }
  return celda.prefijo ? `${celda.prefijo}${base}` : base;
}

// Palabras que solo marcan otra versión del mismo archivo.
const PALABRAS_REVISION = new Set(["MODIF", "MODIFICADO", "REV", "VREV", "REVISION", "COPIA", "FINAL", "CORREGIDO"]);
// Fecha en el nombre del archivo ("10.1.25", "20-12-2024"): todo lo que
// sigue (revisiones, "(002)") no distingue al PM.
const PATRON_FECHA = /(?<!\d)\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?!\d)/;

const palabras = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);

/**
 * Lo que distingue a un PM sin número dentro de su OT, tomado del nombre del
 * archivo: el texto después de la OT y antes de la fecha, sin el nombre del
 * proyecto. "PM 193-24 - PH MONTERREY SOTANO 1 10.1.25_.xlsx" con proyecto
 * "SOTANO-PH MONTERREY" da "SOTANO 1". null si no queda nada (el caso de
 * una OT con un solo PM: "PM 107-26 SMART FIT.xlsx" con proyecto
 * "SMART FIT") o si el archivo es de otra OT.
 */
export function etiquetaDelArchivo(
  nombreArchivo: string,
  base: string,
  proyecto: string
): string | null {
  const sinExtension = nombreArchivo.replace(/\.[a-z0-9]{3,4}$/i, "");
  const m = sinExtension.match(PATRON_NUMERO_ANIO);
  if (!m || m.index == null || formatear(m[1], m[2]) !== base) return null;

  let resto = sinExtension.slice(m.index + m[0].length);
  const fecha = resto.match(PATRON_FECHA);
  if (fecha?.index != null) resto = resto.slice(0, fecha.index);

  let tokens = palabras(resto).filter((t) => !PALABRAS_REVISION.has(t));
  // Quita el nombre del proyecto al inicio: el final de la celda PROYECTO
  // ("SOTANO - PH MONTERREY" -> "PH MONTERREY"), la parte más larga que
  // coincida.
  const tokensProyecto = palabras(proyecto);
  for (let k = Math.min(tokensProyecto.length, tokens.length); k > 0; k--) {
    const cola = tokensProyecto.slice(-k);
    if (cola.every((t, i) => tokens[i] === t)) {
      tokens = tokens.slice(k);
      break;
    }
  }
  return tokens.length > 0 ? tokens.join(" ") : null;
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

/**
 * PM de una hoja que repite el No. PEDIDO de otra hoja del mismo archivo
 * (ej. la hoja oculta "PEDIDO (2)" del PM 102-24-2): un PM aparte de la
 * misma OT, con el nombre de la hoja. "2PM102-24" + "PEDIDO (2)" da
 * "2PM102-24 PEDIDO (2)".
 */
export function pmDeHojaRepetida(pm: string, nombreHoja: string): string {
  return `${pm} ${nombreHoja.replace(/\s+/g, " ").trim().toUpperCase()}`;
}
