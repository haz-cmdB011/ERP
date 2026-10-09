// Asignaciones de Producción: qué cantidad de un mueble se le dio a qué equipo
// (maquilador o planta), para qué proceso, y sus entregas con los folios de
// Calidad. Las reglas reales viven en las funciones SQL de la migración
// asignaciones_produccion; aquí solo hay lo que comparte la interfaz.

export const PROCESOS = ["armado", "barniz"] as const;
export type Proceso = (typeof PROCESOS)[number];

export const PROCESO_LABELS: Record<Proceso, string> = {
  armado: "Armado",
  barniz: "Barniz",
};

export const ESTADOS_ASIGNACION = ["en_proceso", "parcial", "entregada", "cancelada"] as const;
export type EstadoAsignacion = (typeof ESTADOS_ASIGNACION)[number];

export const ESTADO_ASIGNACION_LABELS: Record<EstadoAsignacion, string> = {
  en_proceso: "En proceso",
  parcial: "Entrega parcial",
  entregada: "Entregada",
  cancelada: "Cancelada",
};

export const ESTADO_ASIGNACION_ESTILOS: Record<EstadoAsignacion, string> = {
  en_proceso: "border-sky-200 bg-sky-50 text-sky-700",
  parcial: "border-amber-200 bg-amber-50 text-amber-700",
  entregada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelada: "border-slate-300 bg-slate-100 text-slate-600",
};

export function esProceso(valor: unknown): valor is Proceso {
  return typeof valor === "string" && (PROCESOS as readonly string[]).includes(valor);
}

export function esEstadoAsignacion(valor: unknown): valor is EstadoAsignacion {
  return typeof valor === "string" && (ESTADOS_ASIGNACION as readonly string[]).includes(valor);
}

// Lo mismo que calcula la vista asignaciones_produccion_resumen.
export function estadoAsignacion(
  cantidad: number,
  entregado: number,
  cancelada: boolean
): EstadoAsignacion {
  if (cancelada) return "cancelada";
  if (entregado >= cantidad) return "entregada";
  if (entregado > 0) return "parcial";
  return "en_proceso";
}

// Fila de la vista asignaciones_produccion_resumen.
export interface AsignacionResumen {
  id: string;
  planeacion_item_id: string | null;
  pedido_id: string | null;
  numero_pedido: string;
  item_code: number | null;
  modelo: string | null;
  descripcion: string | null;
  unidad: string | null;
  equipo_id: string;
  equipo: string;
  equipo_encargado: string | null;
  es_planta: boolean;
  proceso: Proceso;
  cantidad: number;
  fecha_asignacion: string;
  notas: string | null;
  creado_en: string;
  cancelada_en: string | null;
  motivo_cancelacion: string | null;
  entregado: number;
  ultima_entrega: string | null;
  folios_calidad: string | null;
  num_entregas: number;
  estado: EstadoAsignacion;
  // Piezas que el trabajador ya revisó y mandó a Calidad, y las que faltan
  // por revisar (entregado = verificado + por_verificar).
  verificado: number;
  por_verificar: number;
  ultima_verificacion: string | null;
  // Retrabajo: el informe de Calidad que rechazó las piezas que se rehacen.
  informe_rechazo_id: string | null;
  folio_rechazo: string | null;
  // Folios CAL- que Calidad generó al evaluar las entregas de la asignación.
  // (folios_calidad, en cambio, es el folio de la hoja de entrega en papel.)
  folios_cal: string | null;
}

export interface EntregaProduccion {
  id: string;
  asignacion_id: string;
  fecha_entrega: string;
  cantidad: number;
  folios_calidad: string;
  foto_path: string;
  registrado_en: string;
  anulada_en: string | null;
  motivo_anulacion: string | null;
  verificada_en: string | null;
  rechazada_en: string | null;
  motivo_rechazo: string | null;
}

// Revisión del trabajador de Producción sobre una entrega del equipo.
export type RevisionEntrega = "anulada" | "rechazada" | "verificada" | "por_verificar";

export function revisionEntrega(
  e: Pick<EntregaProduccion, "anulada_en" | "rechazada_en" | "verificada_en">
): RevisionEntrega {
  if (e.anulada_en) return "anulada";
  if (e.rechazada_en) return "rechazada";
  if (e.verificada_en) return "verificada";
  return "por_verificar";
}

// Lo que decide quien registra la entrega al tomar la foto de la hoja: si las
// piezas cumplen, la entrega nace verificada y pasa a Calidad; si no, nace
// rechazada (con motivo) y el equipo vuelve a entregarlas.
export const RESULTADOS_REVISION = ["cumple", "no_cumple"] as const;
export type ResultadoRevision = (typeof RESULTADOS_REVISION)[number];

export function esResultadoRevision(valor: unknown): valor is ResultadoRevision {
  return typeof valor === "string" && (RESULTADOS_REVISION as readonly string[]).includes(valor);
}

export interface EquipoProduccion {
  id: string;
  nombre: string;
  encargado: string | null;
  es_planta: boolean;
  procesos: Proceso[];
  activo: boolean;
}

export const BUCKET_FOTOS_ENTREGA = "produccion-entregas";

// Días naturales entre dos fechas "AAAA-MM-DD" (sin zona horaria).
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

// Hoy en México como "AAAA-MM-DD" (la planta trabaja en ese horario, no en UTC).
export function hoyMexico(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

// "2026-10-05" -> "05/10/2026".
export function formatoFecha(fecha: string | null): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

// Días que lleva (o llevó) una asignación: hasta la última entrega si ya se
// entregó completa, si no hasta hoy.
export function diasEnProceso(
  a: Pick<AsignacionResumen, "fecha_asignacion" | "estado" | "ultima_entrega">,
  hoy: string
): number | null {
  if (a.estado === "cancelada") return null;
  const fin = a.estado === "entregada" && a.ultima_entrega ? a.ultima_entrega : hoy;
  return Math.max(0, diasEntre(a.fecha_asignacion, fin));
}

// Cantidad escrita en un formulario: número positivo con hasta 2 decimales.
export function leerCantidad(valor: unknown): number | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const n = typeof valor === "number" ? valor : Number(valor.trim().replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

// Fecha "AAAA-MM-DD" válida (rechaza 2026-02-31).
export function leerFecha(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
    ? valor
    : null;
}

// Los errores de las funciones SQL ya vienen en español para el usuario.
export function mensajeErrorRpc(mensaje: string): string {
  return mensaje.replace(/^.*?ERROR:\s*/, "").trim();
}
