// Qué ve cada quien al escanear el QR de un mueble (/q/<ítem>): la ficha común y una
// pestaña por área con lo que esa área hace con el mueble. Para que se entienda de un
// vistazo, cada pestaña tiene UNA acción principal (lo que sigue, según cómo va el mueble),
// una línea que dice por qué, y las demás acciones como opciones chicas. Sin base de
// datos, para poder probarlo. Lo que cada quien puede hacer lo siguen decidiendo la base
// (RLS y sus funciones) y los permisos de cada pantalla.

import type { EstadoRevisionFinalQr } from "./calidad-qr";

export const AREAS_QR = ["produccion", "calidad", "planeacion", "estimaciones"] as const;
export type AreaQr = (typeof AREAS_QR)[number];

export const AREA_QR_LABELS: Record<AreaQr, string> = {
  produccion: "Producción",
  calidad: "Calidad",
  planeacion: "Planeación",
  estimaciones: "Estimaciones",
};

export function esAreaQr(valor: unknown): valor is AreaQr {
  return typeof valor === "string" && (AREAS_QR as readonly string[]).includes(valor);
}

// Pestañas de cada quien: el desarrollador ve todas; el administrador y el trabajador,
// la de su área. El maquilador y el usuario sin asignar no ven la ficha (la base no
// les deja leer el mueble), y Finanzas todavía no tiene nada que hacer aquí.
export function areasQrDePerfil(perfil: { rol: string; area: string | null } | null): AreaQr[] {
  if (!perfil) return [];
  if (perfil.rol === "desarrollador") return [...AREAS_QR];
  if ((perfil.rol === "administrador" || perfil.rol === "trabajador") && esAreaQr(perfil.area)) {
    return [perfil.area];
  }
  return [];
}

// La pestaña abierta: la pedida en ?area= si la persona la tiene, si no la primera suya.
export function areaQrElegida(areas: AreaQr[], pedida: unknown): AreaQr | null {
  if (esAreaQr(pedida) && areas.includes(pedida)) return pedida;
  return areas[0] ?? null;
}

export interface MuebleQr {
  itemId: string;
  pedidoId: string;
  numeroPedido: string;
  proyecto: string | null;
  modelo: string | null;
  // Liberado a Producción y sin cancelar: hay trabajo que hacer con él.
  activo: boolean;
}

export interface EstadoQr {
  mueble: MuebleQr;
  unidad: string;
  produccion: {
    // Quien escanea puede asignar (y el mueble está activo).
    puedeAsignar: boolean;
    // Piezas asignadas que siguen en taller sin entregar.
    porEntregar: number;
    // El paso que sigue con piezas por asignar; null si ya está todo asignado.
    porAsignar: { paso: string; cantidad: number } | null;
  };
  calidad: {
    // null: la revisión final está apagada (se revisa por entregas).
    revisionFinal: EstadoRevisionFinalQr | null;
    pendientes: number;
    cantidad: number;
    entregasPorRevisar: number;
  };
  pago: { estado: "sin_recibo" | "por_pagar" | "pagado"; cobrado: number; pagado: number; recibos: number };
}

// Lo que se puede hacer: ir a una pantalla, o abrir ahí mismo el formulario de asignar o el
// de la revisión final (la página los pinta, porque necesitan sus datos).
export type AccionQr =
  | { tipo: "enlace"; etiqueta: string; detalle: string; href: string }
  | { tipo: "asignar"; etiqueta: string }
  | { tipo: "revision_final"; etiqueta: string };

export interface PanelQr {
  principal: AccionQr | null;
  // Una línea, bajo el botón principal (o sola si no hay): qué falta.
  ayuda: string | null;
  otras: AccionQr[];
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Reporte de no conformidad prellenado (mismos parámetros que la pantalla del pedido
// en Calidad; `proyecto` a secas es un filtro del tablero, por eso va con prefijo).
function hrefReportarFalla(m: MuebleQr): string {
  const q = new URLSearchParams({ reportar: "1" });
  if (m.proyecto) q.set("reportar_proyecto", m.proyecto);
  if (m.modelo) q.set("reportar_mueble", m.modelo);
  return `/calidad/incidencias?${q.toString()}`;
}

function panelProduccion(e: EstadoQr): PanelQr {
  const m = e.mueble;
  const u = e.unidad;
  const p = e.produccion;
  const pedido = `/produccion/pedidos/${m.pedidoId}`;
  const entrega: AccionQr = {
    tipo: "enlace",
    etiqueta: "Registrar entrega",
    detalle: "Lo asignado de este mueble y la entrega con su foto.",
    href: `/produccion/escanear/${m.itemId}`,
  };
  const asignar: AccionQr | null =
    p.puedeAsignar && p.porAsignar ? { tipo: "asignar", etiqueta: "Asignar a un equipo" } : null;
  // Lo que sigue: entregar lo que está en taller; si no hay nada, asignar.
  const principal = p.porEntregar > 0 ? entrega : asignar;

  let ayuda: string | null = null;
  if (p.porEntregar > 0) {
    ayuda =
      asignar && p.porAsignar
        ? `Faltan ${fmt(p.porEntregar)} ${u} por entregar y ${fmt(p.porAsignar.cantidad)} por asignar en ${p.porAsignar.paso}.`
        : `Faltan ${fmt(p.porEntregar)} ${u} por entregar.`;
  } else if (asignar && p.porAsignar) {
    ayuda = `${p.porAsignar.paso}: faltan ${fmt(p.porAsignar.cantidad)} ${u} por asignar.`;
  } else if (m.activo) {
    ayuda = "Todo está asignado y entregado.";
  }

  const otras: AccionQr[] = [
    ...(asignar && principal !== asignar ? [asignar] : []),
    ...(principal !== entrega ? [entrega] : []),
    ...(m.activo
      ? [
          {
            tipo: "enlace" as const,
            etiqueta: "Ruta en el PM",
            detalle: "Cambiar la ruta o asignar varios muebles a la vez.",
            href: `${pedido}/asignaciones`,
          },
        ]
      : []),
    {
      tipo: "enlace",
      etiqueta: "Hoja de viajero",
      detalle: "La hoja para imprimir, con sus componentes.",
      href: `${pedido}/viajero/${m.itemId}`,
    },
    {
      tipo: "enlace",
      etiqueta: "Despiece",
      detalle: "Las piezas del mueble.",
      href: `${pedido}/despiece/${m.itemId}`,
    },
  ];
  return { principal, ayuda, otras };
}

function panelCalidad(e: EstadoQr): PanelQr {
  const m = e.mueble;
  const u = e.unidad;
  const c = e.calidad;
  // Los componentes y los informes se evalúan en la pantalla del pedido en Calidad.
  const otras: AccionQr[] = [
    {
      tipo: "enlace",
      etiqueta: "Componentes e informes",
      detalle: "El mueble en la pantalla de Calidad, con sus componentes.",
      href: `/calidad/escanear/${m.itemId}`,
    },
    {
      tipo: "enlace",
      etiqueta: "Reportar falla",
      detalle: "Una no conformidad ya con el proyecto y el mueble.",
      href: hrefReportarFalla(m),
    },
  ];
  if (!m.activo) return { principal: null, ayuda: null, otras };

  switch (c.revisionFinal) {
    case "revisar":
      return {
        principal: { tipo: "revision_final", etiqueta: "Hacer la revisión final" },
        ayuda: `${fmt(c.pendientes)} ${u} listas: ya pasaron por toda la ruta.`,
        otras,
      };
    case "listas":
      return {
        principal: null,
        ayuda: `${fmt(c.pendientes)} ${u} listas para la revisión final. Tu usuario no puede evaluar.`,
        otras,
      };
    case "esperando":
      return {
        principal: null,
        ayuda: "Todavía no hay piezas listas: falta que Producción termine la ruta.",
        otras,
      };
    case "liberado":
      return { principal: null, ayuda: `Liberado a obra: Calidad aprobó las ${fmt(c.cantidad)} ${u}.`, otras };
    case null:
      // Revisión final apagada: se revisa cada entrega (la lista la pinta la página).
      return {
        principal: null,
        ayuda: c.entregasPorRevisar > 0 ? `${c.entregasPorRevisar} entrega(s) por revisar.` : "No hay entregas por revisar.",
        otras,
      };
  }
}

export function panelQr(area: AreaQr, e: EstadoQr): PanelQr {
  const m = e.mueble;
  switch (area) {
    case "produccion":
      return panelProduccion(e);
    case "calidad":
      return panelCalidad(e);
    case "planeacion":
      return {
        principal: null,
        ayuda: null,
        otras: [
          {
            tipo: "enlace",
            etiqueta: "Ver el PM",
            detalle: "El pedido de manufactura con todos sus ítems.",
            href: `/planeacion/pedidos/${m.pedidoId}`,
          },
        ],
      };
    case "estimaciones":
      // Los recibos se revisan y pagan en Estimaciones: aquí solo se consultan.
      return {
        principal: null,
        ayuda:
          e.pago.estado === "sin_recibo"
            ? "Ningún maquilador lo ha cobrado todavía."
            : `Pagado ${fmt(e.pago.pagado)} de ${fmt(e.pago.cobrado)} ${e.unidad} cobradas en ${e.pago.recibos} recibo(s).`,
        otras: [
          {
            tipo: "enlace",
            etiqueta: "PM contra cobrado",
            detalle: "Lo liberado y lo cobrado en recibos de esta O.T.",
            href: `/estimaciones/pm-cobrado/${encodeURIComponent(m.numeroPedido)}`,
          },
        ],
      };
  }
}
