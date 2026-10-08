// Formato canónico del número de PM: "PM<NUMERO>-<AÑO>", ej. "PM107-26".
// Los archivos reales lo traen escrito de muchas formas ("PM 107-26",
// "009-26-2", "pm-107/2026"...), así que se normaliza al ingerir para que
// el título del pedido sea siempre el mismo sin importar cómo venga.
//
// Varios PM pueden pertenecer a una misma Orden de Trabajo: se distinguen
// con un número al inicio, "<N>PM<ORDEN DE TRABAJO>-<AÑO>" (ej. "1PM134-26",
// "2PM134-26"). Cada uno es un pedido distinto y la OT ("134-26") los agrupa
// (columna generada pedidos.orden_trabajo).
//
// El "-2" después del año ("115-26-2", "OT 126-26-2") NO es número de PM: es
// parte del código de la OT (todas las carpetas lo llevan, ej. "115-26-2
// CORNER JBE LIV CHIHUAHUA") y unos archivos lo traen y otros no, así que se
// ignora. Lo que distingue a los PM de una OT sin número explícito es la
// etapa ("E3 OT 115-26 ...", "_ETAPA 2_") o el resto del nombre del archivo.

const DIGITOS_NUMERO = 3;

// Busca "<numero>-<año>" (separador -, /, _ o espacio). El año puede venir
// con 2 o 4 dígitos; cualquier sufijo extra (ej. el "-2" de "009-26-2") se
// ignora.
const PATRON_NUMERO_ANIO = /(?:PM)?\s*[-_ ]?\s*(\d{1,5})\s*[-/_ ]\s*(\d{4}|\d{2})(?!\d)/i;
const PATRON_SOLO_NUMERO = /(?:PM)?\s*[-_ ]?\s*(\d{1,5})/i;
// Número de PM dentro de la OT: dígitos seguidos de "PM", al inicio o
// después de otra palabra ("ERICK 11 PM 193-24 ..." en archivos de trabajo).
const PATRON_PREFIJO = /(?:^|\s)(\d{1,3})\s*[-_ ]?\s*(?=PM)/i;

// Sufijo de la OT justo después del año ("115-26-2"): no distingue al PM.
const PATRON_SUFIJO_TRAS_OT = /^\s*-\s*\d{1,2}(?![\d.])/;

// Etapa en el nombre del archivo: "E3" al inicio ("E3 OT 115-26 CORNER JBE
// ... .xlsx", la columna ETAPA de esos archivos dice "ETAPA 3") o "ETAPA 2"
// en cualquier parte ("PM 126-26-2_ETAPA 2_ANN TAYLOR ... .xlsx").
const PATRON_ETAPA_INICIO = /^\s*E\s*-?\s*(\d{1,2})(?=[\s_-])/i;
const PATRON_ETAPA = /(?<![A-Z])ETAPA\s*[-_]?\s*(\d{1,2})(?!\d)/i;

// Etiqueta de una hoja extra antes del número de la OT, ej. la solicitud de
// cambio "SDC-1_OT 009-26-2": letras + número, y luego el número de la OT
// (con o sin "OT"/"PM" de por medio). Se conserva en el título del PM.
const PATRON_ETIQUETA =
  /^\s*((?!PM|OT)[A-Z]{2,5})\s*-?\s*(\d{1,3})\s*[_\s]+(?:O\.?\s*T\.?\s*)?(?=\d|PM)/i;

// Número de PM escrito antes de "PM" ("17 PM 193-24"): el único que cuenta
// como número de PM dentro de la OT.
function extraerPrefijo(texto: string): { prefijo: string | null; resto: string } {
  const m = texto.match(PATRON_PREFIJO);
  if (m?.index != null) {
    return { prefijo: String(Number(m[1])), resto: texto.slice(m.index + m[0].length) };
  }
  return { prefijo: null, resto: texto };
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
 * del archivo, lo distingue el nombre del archivo: primero la etapa ("E3 OT
 * 115-26 ...xlsx" queda "PM115-26 ETAPA 3") y si no, el resto del nombre:
 * "PM 193-24 - PH MONTERREY SOTANO 1 10.1.25.xlsx" queda "PM193-24 SOTANO 1"
 * (ver etiquetaDelArchivo; requiere `proyecto`).
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
  // "SDC-1_OT 009-26-2" -> "SDC-1 PM009-26": un PM aparte (no una versión
  // de PM009-26) que sigue perteneciendo a la OT 009-26.
  const etiqueta = numeroPedido.match(PATRON_ETIQUETA);
  if (etiqueta) {
    const pm = normalizarNumeroPM(numeroPedido.slice(etiqueta[0].length), opciones);
    return `${etiqueta[1].toUpperCase()}-${Number(etiqueta[2])} ${pm}`;
  }

  const celda = extraerPrefijo(numeroPedido);
  const archivo = opciones.nombreArchivo ? extraerPrefijo(opciones.nombreArchivo) : null;
  const base = normalizarBase(celda.resto, { ...opciones, nombreArchivo: archivo?.resto });
  if (!base) return numeroPedido; // sin número reconocible

  // Número de PM dentro de la OT: el de la celda y, si no, el del nombre
  // del archivo (solo si el archivo es de la misma OT).
  const otArchivo = archivo?.prefijo ? extraerNumeroYAnio(archivo.resto) : null;
  const prefijoArchivo =
    otArchivo && formatear(otArchivo.numero, otArchivo.anio) === base ? archivo?.prefijo : null;
  const prefijo = celda.prefijo ?? prefijoArchivo ?? null;
  if (prefijo) return `${prefijo}${base}`;

  if (opciones.nombreArchivo) {
    const etapa = etapaDelArchivo(opciones.nombreArchivo, base);
    if (etapa) return `${base} ETAPA ${etapa}`;
  }
  if (opciones.nombreArchivo && opciones.proyecto != null) {
    const nombre = etiquetaDelArchivo(opciones.nombreArchivo, base, opciones.proyecto);
    if (nombre) return `${base} ${nombre}`;
  }
  return base;
}

/**
 * Etapa del PM según el nombre del archivo: "E3 OT 115-26 CORNER JBE LIV
 * CHIHUAHUA 04.09.26.xlsx" da "3", "PM 126-26-2_ETAPA 2_ANN TAYLOR.xlsx" da
 * "2". null si no la trae o si el archivo es de otra OT.
 */
export function etapaDelArchivo(nombreArchivo: string, base: string): string | null {
  const ot = extraerNumeroYAnio(nombreArchivo);
  if (!ot || formatear(ot.numero, ot.anio) !== base) return null;
  const m = nombreArchivo.match(PATRON_ETAPA_INICIO) ?? nombreArchivo.match(PATRON_ETAPA);
  return m ? String(Number(m[1])) : null;
}

// Palabras que solo marcan otra versión del mismo archivo.
const PALABRAS_REVISION = new Set(["MODIF", "MODIFICADO", "REV", "VREV", "REVISION", "COPIA", "FINAL", "CORREGIDO"]);
// Fecha en el nombre del archivo ("10.1.25", "20-12-2024", "V22.07.26" con
// la "V" de versión): todo lo que sigue (revisiones, "(002)") no distingue
// al PM.
const PATRON_FECHA = /(?<!\d)(?:(?<![A-Z])V\.?\s*)?\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?!\d)/i;

const palabras = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    // "SALON 02" y "SALON 2" son el mismo PM.
    .map((t) => (/^\d+$/.test(t) ? String(Number(t)) : t));

// Misma palabra aunque una venga cortada o con una letra de menos
// ("PREFIRS" en la celda, "PREFIRST" en el archivo).
const mismaPalabra = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));

const esNumero = (t: string) => /^\d+$/.test(t);

/**
 * Lo que distingue a un PM sin número dentro de su OT, tomado del nombre del
 * archivo: el texto después de la OT y antes de la fecha, sin el nombre del
 * proyecto. "PM 193-24 - PH MONTERREY SOTANO 1 10.1.25_.xlsx" con proyecto
 * "SOTANO-PH MONTERREY" da "SOTANO 1". null si no queda nada (el caso de
 * una OT con un solo PM: "PM 107-26 SMART FIT.xlsx" con proyecto
 * "SMART FIT") o si el archivo es de otra OT.
 *
 * Si la celda PROYECTO ya trae lo que distingue al PM ("HERRERIAS ... EMA
 * SALON 03" en el archivo "... EMA SALON 03 17.08.26.xlsx"), ese final
 * "<PALABRA> <NÚMERO>" se conserva: si no, todos los salones de la OT
 * quedarían con el mismo título y se pisarían como versiones.
 */
export function etiquetaDelArchivo(
  nombreArchivo: string,
  base: string,
  proyecto: string
): string | null {
  const sinExtension = nombreArchivo.replace(/\.[a-z0-9]{3,4}$/i, "");
  const m = sinExtension.match(PATRON_NUMERO_ANIO);
  if (!m || m.index == null || formatear(m[1], m[2]) !== base) return null;

  let resto = sinExtension.slice(m.index + m[0].length).replace(PATRON_SUFIJO_TRAS_OT, "");
  const fecha = resto.match(PATRON_FECHA);
  if (fecha?.index != null) resto = resto.slice(0, fecha.index);

  let tokens = palabras(resto).filter((t) => !PALABRAS_REVISION.has(t));
  // Quita el nombre del proyecto al inicio: el final de la celda PROYECTO
  // ("SOTANO - PH MONTERREY" -> "PH MONTERREY"), la parte más larga que
  // coincida.
  const tokensProyecto = palabras(proyecto);
  for (let k = Math.min(tokensProyecto.length, tokens.length); k > 0; k--) {
    const cola = tokensProyecto.slice(-k);
    if (cola.every((t, i) => mismaPalabra(tokens[i], t))) {
      // Todo el nombre era el proyecto, pero termina en "<PALABRA>
      // <NÚMERO>" después de otras palabras: eso distingue al PM.
      const distingue =
        k === tokens.length && k >= 3 && esNumero(tokens[k - 1]) && !esNumero(tokens[k - 2]);
      tokens = tokens.slice(distingue ? k - 2 : k);
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
  const prefijoDe = (pm: string) => pm.match(/^(\d+)PM/i)?.[1] ?? null;
  const deCelda = prefijoDe(normalizarNumeroPM(numeroPedido, { fechaPedido: opciones.fechaPedido }));
  const deArchivo = normalizarNumeroPM(opciones.nombreArchivo, { fechaPedido: opciones.fechaPedido });
  if (
    !deCelda ||
    !prefijoDe(deArchivo) ||
    prefijoDe(deArchivo) === deCelda ||
    ordenDeTrabajo(deArchivo) !== ordenDeTrabajo(pmFinal)
  ) {
    return null;
  }
  return `La celda "No. PEDIDO" dice «${numeroPedido}» (${pmFinal}), pero el nombre del archivo indica ${deArchivo.split(" ")[0]}; se cargó como ${pmFinal}.`;
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

// Nombre de hoja que no dice nada del PM ("PEDIDO", "Hoja1").
const HOJA_GENERICA = /^\s*(PEDIDO|HOJA\s*\d*|SHEET\s*\d*)\s*$/i;

/**
 * Título de cada hoja con formato de PM de un mismo archivo, en orden. Una
 * hoja que repite el No. PEDIDO de otra anterior (a veces oculta, ej.
 * "PEDIDO (2)", "incidencias") es un PM aparte de la misma OT con el nombre
 * de la hoja, no una versión que pisaría a otra: toma el título de la
 * primera ("PM013-26 SALON 2" + "incidencias" da "PM013-26 SALON 2
 * INCIDENCIAS"). Se compara la celda sola porque solo la primera hoja usa el
 * nombre del archivo: sin esto, la hoja oculta quedaba con el título de
 * otro salón de la OT.
 *
 * Si la primera hoja también tiene un nombre propio ("ETAPA 1" y "ETAPA 2"
 * en el PM 114-26), lo lleva igual: "PM114-26 ETAPA 1" y "PM114-26 ETAPA 2".
 */
export function pmsDeLasHojas(
  hojas: {
    nombreHoja: string;
    numeroPedido: string;
    opciones: { nombreArchivo?: string; fechaPedido?: string | null; proyecto?: string };
  }[]
): { pm: string; aviso: string | null }[] {
  const resultado: { pm: string; aviso: string | null }[] = [];
  const usados = new Set<string>();
  // Celda sola -> índice de la primera hoja que la trae.
  const primeraPorCelda = new Map<string, number>();
  const repetidas = new Set<number>();
  hojas.forEach(({ nombreHoja, numeroPedido, opciones }, i) => {
    const soloCelda = normalizarNumeroPM(numeroPedido, { fechaPedido: opciones.fechaPedido });
    let pm = normalizarNumeroPM(numeroPedido, opciones);
    let aviso = avisoNumeroPM(numeroPedido, pm, opciones);
    const primera = primeraPorCelda.get(soloCelda);
    const anterior = primera != null ? resultado[primera].pm : usados.has(pm) ? pm : null;
    if (anterior) {
      if (primera != null) repetidas.add(primera);
      pm = pmDeHojaRepetida(anterior, nombreHoja);
      aviso = `Tiene el mismo No. PEDIDO que otra hoja (${anterior}); se cargó como el PM ${pm}.`;
    }
    usados.add(pm);
    if (primera == null) primeraPorCelda.set(soloCelda, i);
    resultado.push({ pm, aviso });
  });
  for (const i of repetidas) {
    const { nombreHoja } = hojas[i];
    const conHoja = pmDeHojaRepetida(resultado[i].pm, nombreHoja);
    if (HOJA_GENERICA.test(nombreHoja) || usados.has(conHoja)) continue;
    const anterior = `(${resultado[i].pm})`;
    resultado[i].pm = conHoja;
    for (const r of resultado) r.aviso = r.aviso?.replace(anterior, `(${conHoja})`) ?? null;
  }
  return resultado;
}

/**
 * Clave con la que se reconoce al PM de un archivo (pedidos.archivo_origen):
 * un archivo con la misma clave es una versión nueva de ese PM; con otra, un
 * PM nuevo. Es el nombre del archivo sin extensión, en mayúsculas y con los
 * espacios juntados: "E3 OT 115-26 CORNER JBE  04.09.26.xlsx" y "e3 ot 115-26
 * corner jbe 04.09.26.xlsm" son el mismo archivo; si cambia la fecha del
 * nombre, es otro. Las hojas después de la primera llevan además su nombre
 * ("<ARCHIVO> :: X FECHAS"). Espejo del respaldo de la migración
 * 20261008160311_pm_por_archivo.sql.
 */
export function claveArchivoOrigen(nombreArchivo: string, nombreHoja?: string): string {
  const limpio = (texto: string) => texto.replace(/\s+/g, " ").trim().toUpperCase();
  const archivo = limpio(nombreArchivo.trim().replace(/\.(xlsx|xlsm|xls)$/i, ""));
  return nombreHoja == null ? archivo : `${archivo} :: ${limpio(nombreHoja)}`;
}
