// A dónde lleva el escáner de QR según el área que lo usa. Son datos puros (no
// funciones sueltas en las páginas): una página de servidor NO puede pasarle funciones a
// un componente de cliente, así que la página manda solo el nombre del área.

export type AreaEscaner = "produccion" | "calidad";

export interface RutasEscaner {
  /** Pantalla del mueble escaneado. */
  item: (itemId: string) => string;
  /** Búsqueda del folio escrito a mano. */
  folio: (folio: string) => string;
  placeholderFolio: string;
}

export const RUTAS_ESCANER: Record<AreaEscaner, RutasEscaner> = {
  produccion: {
    item: (id) => `/produccion/escanear/${id}`,
    folio: (folio) => `/produccion?q=${encodeURIComponent(folio)}`,
    placeholderFolio: "O escribe el folio (PRD-000123)",
  },
  calidad: {
    item: (id) => `/calidad/escanear/${id}`,
    folio: (folio) => `/calidad/folios?q=${encodeURIComponent(folio)}`,
    placeholderFolio: "O escribe el folio (CAL-000123)",
  },
};
