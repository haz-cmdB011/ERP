// Qué ve cada quien al escanear el QR de un mueble (/q/<ítem>): la ficha común y una
// pestaña por área con lo que esa área hace con el mueble. Sin base de datos, para
// poder probarlo. Los botones solo llevan a pantallas; lo que cada quien puede hacer
// ahí lo siguen decidiendo la base (RLS) y los permisos de cada pantalla.

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
  // Liberado a Producción y sin cancelar: se puede asignar.
  asignable: boolean;
  // Tiene asignaciones en taller (algo que entregar).
  enTaller: boolean;
}

export interface AccionQr {
  etiqueta: string;
  detalle: string;
  href: string;
  principal?: boolean;
}

// Reporte de no conformidad prellenado (mismos parámetros que la pantalla del pedido
// en Calidad; `proyecto` a secas es un filtro del tablero, por eso va con prefijo).
function hrefReportarFalla(m: MuebleQr): string {
  const q = new URLSearchParams({ reportar: "1" });
  if (m.proyecto) q.set("reportar_proyecto", m.proyecto);
  if (m.modelo) q.set("reportar_mueble", m.modelo);
  return `/calidad/incidencias?${q.toString()}`;
}

export function accionesQr(area: AreaQr, m: MuebleQr): AccionQr[] {
  const pedido = `/pedidos/${m.pedidoId}`;
  switch (area) {
    // Asignar y reasignar rechazos se hace en la misma ficha (los pinta la página, porque
    // dependen del permiso de editar); aquí van las pantallas a las que se sale.
    case "produccion":
      return [
        {
          etiqueta: "Registrar entrega",
          detalle: "Lo asignado de este mueble y la entrega con su foto.",
          href: `/produccion/escanear/${m.itemId}`,
          principal: m.enTaller,
        },
        ...(m.asignable
          ? [
              {
                etiqueta: "Ruta en el PM",
                detalle: "Cambiar la ruta o asignar varios muebles a la vez.",
                href: `/produccion${pedido}/asignaciones`,
              },
            ]
          : []),
        {
          etiqueta: "Hoja de viajero",
          detalle: "La hoja para imprimir, con sus componentes.",
          href: `/produccion${pedido}/viajero/${m.itemId}`,
        },
        {
          etiqueta: "Despiece",
          detalle: "Las piezas del mueble.",
          href: `/produccion${pedido}/despiece/${m.itemId}`,
        },
      ];
    case "calidad":
      return [
        // La revisión final y las entregas se hacen en la ficha; los componentes y los
        // informes, en la pantalla del pedido en Calidad.
        {
          etiqueta: "Componentes e informes",
          detalle: "El mueble en la pantalla de Calidad, con sus componentes.",
          href: `/calidad/escanear/${m.itemId}`,
        },
        {
          etiqueta: "Reportar falla",
          detalle: "Una no conformidad ya con el proyecto y el mueble.",
          href: hrefReportarFalla(m),
        },
      ];
    case "planeacion":
      return [
        {
          etiqueta: "Ver el PM",
          detalle: "El pedido de manufactura con todos sus ítems.",
          href: `/planeacion${pedido}`,
          principal: true,
        },
      ];
    case "estimaciones":
      return [
        {
          etiqueta: "PM contra cobrado",
          detalle: "Lo liberado y lo cobrado en recibos de esta O.T.",
          href: `/estimaciones/pm-cobrado/${encodeURIComponent(m.numeroPedido)}`,
          principal: true,
        },
      ];
  }
}
