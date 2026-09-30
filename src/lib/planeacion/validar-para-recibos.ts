// Avisos sobre datos del Excel de Planeación que luego causan descuadres en el
// generador de recibos de maquila (Estimaciones compara lo que captura el
// maquilador contra la suma de CANTIDAD TOTAL de los muebles padre de cada
// modelo). Se detectan al subir el archivo, no al capturar recibos.
//
// Son AVISOS, no errores: la carga sigue y se guardan igual (mismo criterio que
// los demás avisos del parser), pero quien sube el Excel los ve al momento.

import type { PlaneacionItemParsed } from "./types";

export interface AvisoFila {
  fila: number;
  mensaje: string;
}

type ItemMinimo = Pick<
  PlaneacionItemParsed,
  "item_code" | "tipo_registro" | "modelo" | "cantidad_total" | "fila_excel_origen"
>;

// Máximo de avisos que se listan por tipo de problema; el resto se resume en
// una línea para no inundar la pantalla con un Excel muy sucio.
const MAX_POR_TIPO = 15;

function limitar(avisos: AvisoFila[], tipo: string): AvisoFila[] {
  if (avisos.length <= MAX_POR_TIPO) return avisos;
  const resto = avisos.length - MAX_POR_TIPO;
  return [
    ...avisos.slice(0, MAX_POR_TIPO),
    { fila: 0, mensaje: `…y ${resto} fila${resto === 1 ? "" : "s"} más con el mismo problema (${tipo}).` },
  ];
}

function etiqueta(i: ItemMinimo): string {
  return `Ítem ${i.item_code}${i.modelo ? ` (${i.modelo})` : ""}`;
}

export function validarItemsParaRecibos(items: ItemMinimo[]): AvisoFila[] {
  const padres = items.filter((i) => i.tipo_registro === "MO");
  const codigosPadre = new Set(padres.map((p) => p.item_code));

  const negativas: AvisoFila[] = [];
  const enCero: AvisoFila[] = [];
  const decimales: AvisoFila[] = [];
  const sinModelo: AvisoFila[] = [];
  const huerfanos: AvisoFila[] = [];

  for (const i of items) {
    const fila = i.fila_excel_origen;
    const esPadre = i.tipo_registro === "MO";

    if (i.cantidad_total < 0) {
      negativas.push({
        fila,
        mensaje: `${etiqueta(i)}: CANTIDAD TOTAL negativa (${i.cantidad_total}); al sumar el modelo en los recibos restará piezas.`,
      });
    }

    // Solo los muebles padre cuentan en los recibos; en los componentes (FU)
    // los ceros y decimales son normales (metros, kilos, etc.).
    if (esPadre && i.cantidad_total === 0) {
      enCero.push({
        fila,
        mensaje: `${etiqueta(i)}: CANTIDAD TOTAL en 0; el modelo quedará con cantidad cero en el generador de recibos.`,
      });
    }
    if (esPadre && i.cantidad_total > 0 && !Number.isInteger(i.cantidad_total)) {
      decimales.push({
        fila,
        mensaje: `${etiqueta(i)}: CANTIDAD TOTAL con decimales (${i.cantidad_total}); los recibos se capturan en piezas y será difícil que cuadre.`,
      });
    }

    if (esPadre && !i.modelo) {
      sinModelo.push({
        fila,
        mensaje: `${etiqueta(i)}: mueble sin MODELO; no aparecerá en el generador de recibos.`,
      });
    }

    // Mismo criterio con el que el RPC de ingestión liga hijo con padre: el
    // padre tiene item_code = floor(item_code del hijo).
    if (!esPadre && !codigosPadre.has(Math.floor(i.item_code))) {
      huerfanos.push({
        fila,
        mensaje: `${etiqueta(i)}: componente sin mueble padre (no hay un ítem ${Math.floor(i.item_code)} en el archivo); no quedará ligado a ningún mueble.`,
      });
    }
  }

  return [
    ...limitar(negativas, "cantidad negativa"),
    ...limitar(enCero, "cantidad en 0"),
    ...limitar(decimales, "cantidad con decimales"),
    ...limitar(sinModelo, "mueble sin modelo"),
    ...limitar(huerfanos, "componente sin padre"),
  ];
}
