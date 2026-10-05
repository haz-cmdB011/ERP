// Estado de entrega de un pedido a partir de su fecha (YYYY-MM-DD). No existe
// un estado "entregado" en la base, así que lo vencido no se marca como atraso:
// solo se distingue lo que viene pronto de lo que ya pasó.

export type EstadoEntrega = "semana" | "mes" | "futura" | "pasada" | "sin-fecha";

const DIA_MS = 86_400_000;

// `hoy` en YYYY-MM-DD (zona de la empresa); se compara por día calendario.
export function estadoEntrega(fecha: string | null | undefined, hoy: string): EstadoEntrega {
  if (!fecha) return "sin-fecha";
  const dias = Math.round((Date.parse(fecha.slice(0, 10)) - Date.parse(hoy)) / DIA_MS);
  if (Number.isNaN(dias)) return "sin-fecha";
  if (dias < 0) return "pasada";
  if (dias <= 7) return "semana";
  if (dias <= 30) return "mes";
  return "futura";
}

// Fecha de hoy en la zona horaria de la empresa (el servidor corre en UTC).
export function hoyEnEmpresa(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export const ETIQUETA_ENTREGA: Record<EstadoEntrega, string> = {
  semana: "Esta semana",
  mes: "Próximos 30 días",
  futura: "A tiempo",
  pasada: "Fecha pasada",
  "sin-fecha": "Sin fecha",
};
