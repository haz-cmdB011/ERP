// Historial de la palomita o el tache de la bitácora de taller: tipos y textos compartidos por la
// ventana de cada marca, la pestaña Bitácora y el Excel. Sin base de datos ni navegador, para poder
// probarlo; la lectura vive en control-taller-db.ts.

// Largo máximo de la nota (lo exige también la base).
export const NOTA_MAX = 300;

// Interruptor de los motivos (la nota de cada marca): apagado por ahora. Apagado no se ven ni se piden
// en pantalla ni en el Excel, pero la base y las rutas siguen listas y lo ya guardado se conserva;
// para volver a mostrarlos basta ponerlo en true.
export const MOTIVOS_ACTIVOS = false;

// Marca vigente de una asignación o de un mueble.
export interface MarcaActual {
  esta: boolean;
  nota: string | null;
}

// Un cambio del historial (fila de historial_marcas_taller_produccion).
export interface EventoMarca {
  id: string;
  asignacion_id: string | null;
  item_id: string | null;
  // Marca antes y después: true = palomita, false = tache, null = sin marca.
  esta_anterior: boolean | null;
  esta: boolean | null;
  nota: string | null;
  modelo: string | null;
  numero_pedido: string | null;
  orden_trabajo: string | null;
  equipo: string | null;
  hecho_por_nombre: string | null;
  hecho_en: string;
}

export function textoMarca(marca: boolean | null): string {
  return marca === true ? "Sí está" : marca === false ? "No está" : "Sin marca";
}

// "Sin marca → No está", o solo "Nota" si la marca no cambió y lo que cambió fue la nota.
export function describirCambio(e: Pick<EventoMarca, "esta_anterior" | "esta">): string {
  if (e.esta_anterior === e.esta) return `${textoMarca(e.esta)} (cambió la nota)`;
  return `${textoMarca(e.esta_anterior)} → ${textoMarca(e.esta)}`;
}

// "05/11/2026 10:30" en la hora de México (la planta no trabaja en UTC).
export function formatoFechaHora(iso: string): string {
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

// "AAAA-MM-DD" (hora de México) de un instante: para filtrar el historial por día.
export function diaMexico(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// Nota lista para guardar: sin espacios de más; vacía = sin nota. null si se pasa del largo.
export function limpiarNota(valor: unknown): { ok: true; nota: string | null } | { ok: false } {
  if (valor === undefined || valor === null) return { ok: true, nota: null };
  if (typeof valor !== "string") return { ok: false };
  const nota = valor.trim();
  if (nota.length > NOTA_MAX) return { ok: false };
  return { ok: true, nota: nota === "" ? null : nota };
}
