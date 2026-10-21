// Pago al maquilador en la ficha del QR (/q/<ítem>): los recibos que cobraron este mueble
// y si ya se pagaron. Es el final del recorrido del mueble. Solo consulta: los recibos se
// capturan, revisan y pagan en Estimaciones como siempre. Todo lo del pago vive en este
// archivo (y su lectura en pago-maquilador-db.ts) porque el pago del maquilador va a
// cambiar. Sin base de datos, para poder probarlo.
//
// Un renglón es de este mueble con la misma regla que "PM contra cobrado" y el control al
// guardar (est_conciliar_renglon_pm): misma O.T., mismo código y misma descripción del
// padre (descripcion_pm). Si el renglón no trae descripción, cuenta por código. En
// Electrificación el renglón trae el mueble (planeacion_item_id) y manda ese.

import { claveDescripcion, claveModelo, claveOt } from "@/lib/estimaciones/conciliacion-pm";

export type AreaPago = "acabados" | "armado" | "electrificacion";

export const AREA_PAGO_LABELS: Record<AreaPago, string> = {
  acabados: "Acabados",
  armado: "Armado",
  electrificacion: "Electrificación",
};

export type EstadoRecibo = "pendiente" | "revisado" | "pagado" | "cancelado";

export interface ReciboConRenglones {
  id: string;
  area: AreaPago;
  folio: string;
  ot: string | null;
  contratista: string | null;
  estado: string;
  creado_en: string;
  capturado_por: string | null;
  pagado_en: string | null;
  pagado_por: string | null;
  renglones: {
    modelo: string | null;
    descripcion_pm: string | null;
    cantidad: number | string | null;
    // Solo Acabados y Armado: los reprocesos se pagan aparte.
    tipo_trabajo?: string | null;
    // Solo Electrificación.
    planeacion_item_id?: string | null;
  }[];
}

export interface MuebleParaPago {
  id: string;
  modelo: string | null;
  descripcion: string | null;
  // O.T. del pedido ("193-24") o el número de pedido, de donde sale.
  ot: string | null;
}

export interface CobroMueble {
  reciboId: string;
  area: AreaPago;
  folio: string;
  contratista: string | null;
  estado: EstadoRecibo;
  // Piezas de este mueble en el recibo (sin reprocesos).
  cantidad: number;
  reproceso: number;
  creado_en: string;
  capturado_por: string | null;
  pagado_en: string | null;
  pagado_por: string | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function estadoRecibo(estado: string): EstadoRecibo {
  return estado === "revisado" || estado === "pagado" || estado === "cancelado" ? estado : "pendiente";
}

// Los recibos vigentes (no cancelados) que cobraron este mueble, del más antiguo al más reciente.
export function cobrosDelMueble(m: MuebleParaPago, recibos: ReciboConRenglones[]): CobroMueble[] {
  const ot = claveOt(m.ot);
  const modelo = claveModelo(m.modelo);
  const descripcion = claveDescripcion(m.descripcion);
  const salida: CobroMueble[] = [];
  for (const r of recibos) {
    if (r.estado === "cancelado" || !ot || claveOt(r.ot) !== ot) continue;
    let cantidad = 0;
    let reproceso = 0;
    for (const g of r.renglones) {
      const esDelMueble =
        r.area === "electrificacion" && g.planeacion_item_id
          ? g.planeacion_item_id === m.id
          : claveModelo(g.modelo) === modelo &&
            (!g.descripcion_pm || claveDescripcion(g.descripcion_pm) === descripcion);
      if (!esDelMueble) continue;
      if (g.tipo_trabajo === "reproceso") reproceso += Number(g.cantidad) || 0;
      else cantidad += Number(g.cantidad) || 0;
    }
    if (cantidad <= 0 && reproceso <= 0) continue;
    salida.push({
      reciboId: r.id,
      area: r.area,
      folio: r.folio,
      contratista: r.contratista,
      estado: estadoRecibo(r.estado),
      cantidad: redondear(cantidad),
      reproceso: redondear(reproceso),
      creado_en: r.creado_en,
      capturado_por: r.capturado_por,
      pagado_en: r.pagado_en,
      pagado_por: r.pagado_por,
    });
  }
  return salida.sort((a, b) => a.creado_en.localeCompare(b.creado_en));
}

export interface ResumenPago {
  cobrado: number;
  pagado: number;
  // "sin_recibo": nadie lo ha cobrado; "por_pagar": hay piezas cobradas sin pagar.
  estado: "sin_recibo" | "por_pagar" | "pagado";
}

// Piezas cobradas y pagadas (sin reprocesos), por área y en total.
export function resumenPago(cobros: CobroMueble[]): ResumenPago & { porArea: Partial<Record<AreaPago, ResumenPago>> } {
  const resumir = (lista: CobroMueble[]): ResumenPago => {
    const cobrado = redondear(lista.reduce((t, c) => t + c.cantidad, 0));
    const pagado = redondear(lista.filter((c) => c.estado === "pagado").reduce((t, c) => t + c.cantidad, 0));
    const hayPendiente = lista.some((c) => c.estado !== "pagado");
    return {
      cobrado,
      pagado,
      estado: lista.length === 0 ? "sin_recibo" : hayPendiente ? "por_pagar" : "pagado",
    };
  };
  const porArea: Partial<Record<AreaPago, ResumenPago>> = {};
  for (const area of ["armado", "acabados", "electrificacion"] as const) {
    const delArea = cobros.filter((c) => c.area === area);
    if (delArea.length > 0) porArea[area] = resumir(delArea);
  }
  return { ...resumir(cobros), porArea };
}

export function hrefRecibo(c: Pick<CobroMueble, "area" | "folio">): string {
  return `/estimaciones/recibos/${c.area}/recibo/${encodeURIComponent(c.folio)}`;
}
