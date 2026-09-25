// Formato canónico del número de PM: "PM<NUMERO>-<AÑO>", ej. "PM107-26".
// Los archivos reales lo traen escrito de muchas formas ("PM 107-26",
// "009-26-2", "pm-107/2026"...), así que se normaliza al ingerir para que
// el título del pedido sea siempre el mismo sin importar cómo venga.

const DIGITOS_NUMERO = 3;

// Busca "<numero>-<año>" (separador -, /, _ o espacio). El año puede venir
// con 2 o 4 dígitos; cualquier sufijo extra (ej. el "-2" de "009-26-2") se
// ignora.
const PATRON_NUMERO_ANIO = /(?:PM)?\s*[-_ ]?\s*(\d{1,5})\s*[-/_ ]\s*(\d{4}|\d{2})(?!\d)/i;
const PATRON_SOLO_NUMERO = /(?:PM)?\s*[-_ ]?\s*(\d{1,5})/i;

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

  if (!numeroCelda) return numeroPedido;

  const anio =
    opciones.fechaPedido?.slice(0, 4) ?? String((opciones.hoy ?? new Date()).getFullYear());
  return formatear(numeroCelda, anio);
}
