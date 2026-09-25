// Lectura del cuadro de datos (title block) de los planos PDF de Ingeniería.
//
// Hay varias plantillas del cuadro y en cada una el valor de un campo está a
// la DERECHA de su etiqueta ("ESPECIFICACIÓN: ZOCLO 6 MM") o DEBAJO de ella
// (la etiqueta arriba a la izquierda de la celda y el valor abajo). Se
// ubica cada etiqueta por posición y se toma el texto más cercano en
// cualquiera de esas dos direcciones que no sea otra etiqueta.

export interface TextoPdf {
  texto: string;
  x: number; // PDF: origen abajo a la izquierda
  y: number;
}

export interface EspecificacionesPlano {
  especificacion: string | null;
  descripcion: string | null;
  proyecto: string | null;
  pm_plano: string | null;
  dibujo: string | null;
  verifico: string | null;
  fecha_plano: string | null;
  escala: string | null;
  acabados: string[];
  notas: string[];
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Etiquetas y textos fijos del cuadro: nunca son el VALOR de un campo.
const ETIQUETAS = new Set(
  [
    "ESPECIFICACION",
    "DESCRIPCION",
    "PROYECTO",
    "PM",
    "OT",
    "OP",
    "DIBUJO",
    "DIBUJO POR",
    "VERIFICO",
    "NOMBRE",
    "FECHA",
    "ARMADOR",
    "SUPERVISOR DE",
    "SUPERVISOR DE ARMADO",
    "ARMADO",
    "NOMENCLATURA",
    "NOMENCLATURA DE ACABADOS",
    "DE ACABADOS",
    "UNIDADES",
    "MM",
    "VIDRIO",
    "ACRILICO",
    "INGENIERIA Y DISENO",
  ].map(normalizar)
);

function esEtiqueta(texto: string): boolean {
  const t = normalizar(texto).replace(/:\s*$/, "");
  return (
    ETIQUETAS.has(t) ||
    /^(MADERA|METAL|META|VIDRIO|ACRILICO)\b/.test(t) || // leyendas de nomenclatura
    /^(CR|ACR|LP|MT)-XX$/.test(t) ||
    /^ESCALA\b/.test(t) ||
    /^HOJA\b/.test(t) ||
    /^DE \d+$/.test(t) ||
    /^\d\.$/.test(t) ||
    /^-+$/.test(t) ||
    /PROPIEDAD DE IDEAS|NO DEBERA SER USADO|^RUTA:|^TOLERANCIAS|^ING-FOR/.test(t)
  );
}

const FECHA = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
// Puntos. A la derecha, un VALOR debe estar en la misma línea exacta (con
// más holgura se cuela el valor de la celda vecina: "ISOMETRICO" de
// ESPECIFICACIÓN como si fuera el PROYECTO, 2 pt más abajo); pero una
// ETIQUETA ligeramente desfasada sí marca el fin de la celda (DIBUJO, 2 pt
// más abajo que DESCRIPCIÓN, no debe dejar pasar el nombre del dibujante).
const TOLERANCIA_LINEA = 1.5;
const TOLERANCIA_LINEA_ETIQUETA = 3;
const SEPARACION_ABAJO = 3;
const MAX_DERECHA = 160;
const MAX_ABAJO = 14;
const TOLERANCIA_COLUMNA = 14;

function buscarEtiqueta(items: TextoPdf[], ...nombres: string[]): TextoPdf | undefined {
  const buscados = nombres.map(normalizar);
  return items.find((i) => {
    const t = normalizar(i.texto);
    // "ESPECIFICACIÓN:" sola, o "ESPECIFICACIÓN: ZOCLO 6 MM" en una cadena.
    return buscados.some((b) => t.replace(/:\s*$/, "") === b || t.startsWith(`${b}:`));
  });
}

// Texto a la derecha de la etiqueta, en la misma línea: el más cercano.
function aLaDerecha(items: TextoPdf[], etiqueta: TextoPdf): TextoPdf[] {
  return items
    .filter(
      (i) =>
        i !== etiqueta &&
        Math.abs(i.y - etiqueta.y) <= TOLERANCIA_LINEA_ETIQUETA &&
        i.x > etiqueta.x &&
        i.x - etiqueta.x <= MAX_DERECHA
    )
    .sort((a, b) => a.x - b.x);
}

// Texto debajo de la etiqueta, en la misma columna de la celda.
function debajo(items: TextoPdf[], etiqueta: TextoPdf): TextoPdf | undefined {
  return items
    .filter(
      (i) =>
        i.y < etiqueta.y - SEPARACION_ABAJO &&
        etiqueta.y - i.y <= MAX_ABAJO &&
        Math.abs(i.x - etiqueta.x) <= TOLERANCIA_COLUMNA
    )
    .sort((a, b) => b.y - a.y)[0];
}

function valorDe(items: TextoPdf[], ...nombres: string[]): string | null {
  const etiqueta = buscarEtiqueta(items, ...nombres);
  if (!etiqueta) return null;
  // "ESPECIFICACIÓN: ZOCLO 6 MM" en un solo texto.
  const enLinea = etiqueta.texto.replace(/^[^:]*:\s*/, "");
  if (etiqueta.texto.includes(":") && enLinea && !esEtiqueta(enLinea)) return enLinea.trim();

  // Hacia la derecha, el valor termina en la siguiente etiqueta de la línea.
  const derecha: TextoPdf[] = [];
  for (const i of aLaDerecha(items, etiqueta)) {
    if (esEtiqueta(i.texto)) break;
    if (Math.abs(i.y - etiqueta.y) <= TOLERANCIA_LINEA) derecha.push(i);
  }
  const textoDerecha = derecha
    .map((i) => i.texto)
    .filter((t) => !FECHA.test(t))
    .join(" ")
    .trim();
  if (textoDerecha) return textoDerecha;

  const abajo = debajo(items, etiqueta);
  if (abajo && !esEtiqueta(abajo.texto) && !FECHA.test(abajo.texto)) return abajo.texto.trim();
  return null;
}

// Fecha en la misma línea que DIBUJO (plantillas con NOMBRE | FECHA en
// columnas); si no, la primera fecha del cuadro.
function fechaDelPlano(items: TextoPdf[]): string | null {
  const dibujo = buscarEtiqueta(items, "DIBUJO");
  const enLinea = dibujo
    ? aLaDerecha(items, dibujo).find(
        (i) => FECHA.test(i.texto) && Math.abs(i.y - dibujo.y) <= TOLERANCIA_LINEA
      )
    : undefined;
  if (enLinea) return enLinea.texto;
  return items.find((i) => FECHA.test(i.texto))?.texto ?? null;
}

function limpiar(valor: string | null): string | null {
  if (!valor) return null;
  const v = valor
    .replace(/\s+/g, " ")
    .replace(/[\s_-]+$/, "") // "ANTONIO S. _"
    .trim();
  // "Sheet1": nombre de la hoja de dibujo de SolidWorks, no un dato.
  return v && !/^[-_]+$/.test(v) && !/^SHEET\s*\d+$/i.test(v) ? v : null;
}

// Códigos de acabado de la nomenclatura (LP madera, MT metal, CR vidrio,
// ACR acrílico, PT pintura), sin los "XX" de la leyenda.
const ACABADO = /\b(?:LP|MT|CR|ACR|PT)-[A-Z0-9]{1,6}\b/g;

export function extraerAcabados(texto: string): string[] {
  const codigos = normalizar(texto).match(ACABADO) ?? [];
  return Array.from(new Set(codigos.filter((c) => !c.endsWith("-XX")))).sort();
}

/**
 * @param pagina1 textos de la primera hoja con su posición
 * @param textoCompleto texto de todas las hojas (para los acabados)
 */
export function extraerEspecificaciones(
  pagina1: TextoPdf[],
  textoCompleto: string
): EspecificacionesPlano {
  const items = pagina1.filter((i) => i.texto.trim());

  // Límites del cuadro: arriba, la etiqueta más alta; a la izquierda, el
  // texto fijo de la empresa. Lo que queda fuera son notas del dibujo
  // ("ACABADO PT-191" arriba; "FABRICAR 23 PZ" a la izquierda, a la
  // altura del cuadro).
  const etiquetasCuadro = items.filter((i) =>
    /^(ESPECIFICACION|DESCRIPCION|NOMENCLATURA|ARMADOR|UNIDADES)\b/.test(normalizar(i.texto))
  );
  const topeCuadro = etiquetasCuadro.length
    ? Math.max(...etiquetasCuadro.map((i) => i.y)) + 6
    : -Infinity;
  const textoFijo = items.filter((i) =>
    /INGENIERIA Y DISENO|PROPIEDAD DE IDEAS|NO DEBERA SER USADO/.test(normalizar(i.texto))
  );
  const izquierdaCuadro = textoFijo.length
    ? Math.min(...textoFijo.map((i) => i.x)) - 10
    : -Infinity;
  const enCuadro = (i: TextoPdf) => i.y <= topeCuadro && i.x >= izquierdaCuadro;
  const cuadro = items.filter(enCuadro);

  const escala = cuadro.find((i) => /^ESCALA\b/.test(normalizar(i.texto)));
  const notas = items
    .filter(
      (i) =>
        !enCuadro(i) &&
        !esEtiqueta(i.texto) &&
        /[A-Za-zÁÉÍÓÚÑ]{3,}/.test(i.texto) &&
        i.texto.trim().length >= 4
    )
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((i) => i.texto.replace(/\s+/g, " ").trim());

  return {
    especificacion: limpiar(valorDe(cuadro, "ESPECIFICACION")),
    descripcion: limpiar(valorDe(cuadro, "DESCRIPCION")),
    proyecto: limpiar(valorDe(cuadro, "PROYECTO")),
    pm_plano: limpiar(valorDe(cuadro, "PM", "OT", "OP")),
    dibujo: limpiar(valorDe(cuadro, "DIBUJO", "DIBUJO POR")),
    verifico: limpiar(valorDe(cuadro, "VERIFICO")),
    fecha_plano: fechaDelPlano(cuadro),
    escala: limpiar(escala ? escala.texto.replace(/^[^:]*:\s*/, "") : null),
    acabados: extraerAcabados(textoCompleto),
    notas: Array.from(new Set(notas)).slice(0, 30),
  };
}
