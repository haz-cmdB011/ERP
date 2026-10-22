// Dónde va el mueble, de un vistazo, para la tarjeta de estado de la ficha del QR
// (/q/<ítem>): una frase ("En Armado · 5 de 7 entregadas") y un tramo por paso del
// recorrido (los pasos de su ruta de Producción, la revisión final de Calidad y el pago al
// maquilador). El detalle de cada paso se abre al tocar la tarjeta. Sin base de datos,
// para poder probarlo.

import type { EstadoProceso } from "@/lib/produccion/flujo-mueble";

export type EstadoTramo = "hecho" | "en_curso" | "pendiente";

export interface TramoRuta {
  etiqueta: string;
  estado: EstadoTramo;
  // Texto del estado en la lista de la ruta ("En proceso", "2 por revisar", "Pagado").
  texto: string;
  // "5/7": entregadas, aprobadas o pagadas; null si todavía no hay nada que contar.
  cifra: string | null;
}

export interface ResumenRuta {
  titulo: string;
  detalle: string | null;
  // Índice del tramo donde va el mueble (el primero sin terminar); null si ya terminó todo.
  actual: number | null;
  tramos: TramoRuta[];
}

export interface EntradaRuta {
  liberado: boolean;
  cantidad: number;
  unidad: string;
  pasos: { etiqueta: string; estado: EstadoProceso; entregado: number }[];
  // null: la revisión final está apagada y no es un paso del recorrido.
  revisionFinal: { aprobadas: number; pendientes: number; liberado: boolean } | null;
  pago: { estado: "sin_recibo" | "por_pagar" | "pagado"; cobrado: number; pagado: number };
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

const TEXTO_PASO: Record<EstadoProceso, string> = {
  terminado: "Terminado",
  en_proceso: "En proceso",
  sin_asignar: "Sin asignar",
};

export function resumenRuta(e: EntradaRuta): ResumenRuta {
  const u = e.unidad;
  const tramos: TramoRuta[] = e.pasos.map((p) => ({
    etiqueta: p.etiqueta,
    estado: p.estado === "terminado" ? "hecho" : p.estado === "en_proceso" ? "en_curso" : "pendiente",
    texto: TEXTO_PASO[p.estado],
    cifra: p.estado === "sin_asignar" ? null : `${fmt(p.entregado)}/${fmt(e.cantidad)}`,
  }));
  const rf = e.revisionFinal;
  if (rf) {
    tramos.push({
      etiqueta: "Revisión final",
      estado: rf.liberado ? "hecho" : rf.pendientes > 0 || rf.aprobadas > 0 ? "en_curso" : "pendiente",
      texto: rf.liberado ? "Liberado a obra" : rf.pendientes > 0 ? `${fmt(rf.pendientes)} por revisar` : "Esperando piezas",
      cifra: `${fmt(rf.aprobadas)}/${fmt(e.cantidad)}`,
    });
  }
  tramos.push({
    etiqueta: "Pago al maquilador",
    estado: e.pago.estado === "pagado" ? "hecho" : e.pago.estado === "por_pagar" ? "en_curso" : "pendiente",
    texto: e.pago.estado === "pagado" ? "Pagado" : e.pago.estado === "por_pagar" ? "Por pagar" : "Sin recibo",
    cifra: e.pago.estado === "sin_recibo" ? null : `${fmt(e.pago.pagado)}/${fmt(e.pago.cobrado)}`,
  });

  if (!e.liberado) {
    return { titulo: "Sin liberar a Producción", detalle: "Planeación todavía no lo libera.", actual: null, tramos };
  }

  const i = tramos.findIndex((t) => t.estado !== "hecho");
  if (i < 0) return { titulo: "Recorrido completo", detalle: null, actual: null, tramos };

  if (i < e.pasos.length) {
    const p = e.pasos[i];
    return p.estado === "sin_asignar"
      ? { titulo: `Por asignar: ${p.etiqueta}`, detalle: null, actual: i, tramos }
      : {
          titulo: `En ${p.etiqueta}`,
          detalle: `${fmt(p.entregado)} de ${fmt(e.cantidad)} ${u} entregadas`,
          actual: i,
          tramos,
        };
  }
  if (rf && i === e.pasos.length) {
    return {
      titulo: "En revisión final",
      detalle:
        rf.pendientes > 0
          ? `${fmt(rf.pendientes)} ${u} listas para revisar`
          : `Calidad aprobó ${fmt(rf.aprobadas)} de ${fmt(e.cantidad)} ${u}`,
      actual: i,
      tramos,
    };
  }
  return e.pago.estado === "por_pagar"
    ? {
        titulo: "Por pagar al maquilador",
        detalle: `Pagado ${fmt(e.pago.pagado)} de ${fmt(e.pago.cobrado)} ${u} cobradas`,
        actual: i,
        tramos,
      }
    : { titulo: "Por cobrar", detalle: "Ningún maquilador lo ha cobrado.", actual: i, tramos };
}
