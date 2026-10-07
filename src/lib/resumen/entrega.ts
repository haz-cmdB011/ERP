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

// "2026-10-12" -> "12/10/2026" (día/mes/año, como en el resto de la app). Sin
// fecha o con una inválida: "—".
export function formatoFechaDMA(fecha: string | null | undefined): string {
  const limpia = fecha?.slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return "—";
  const [a, m, d] = limpia.split("-");
  return `${d}/${m}/${a}`;
}

// Fecha y hora de un instante (ISO) en la zona de la empresa: "07/10/2026 08:23".
// `toLocaleString()` sin zona en el servidor daría UTC y formato de Estados Unidos.
export function formatoFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "—";
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("es-MX", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value])
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

export const ETIQUETA_ENTREGA: Record<EstadoEntrega, string> = {
  semana: "Esta semana",
  mes: "Próximos 30 días",
  futura: "A tiempo",
  pasada: "Fecha pasada",
  "sin-fecha": "Sin fecha",
};
