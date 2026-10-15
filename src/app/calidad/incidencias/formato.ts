// Textos de fechas y periodos para la pantalla de Incidencias (todo en UTC: las
// fechas son días "AAAA-MM-DD" sin hora, no instantes).
import { semanaDe, type Periodo, type Vista } from "@/lib/calidad/incidencias";

function formatear(ymd: string, opciones: Intl.DateTimeFormatOptions): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("es-MX", { ...opciones, timeZone: "UTC" });
}

export function diaCorto(ymd: string): string {
  return formatear(ymd, { day: "numeric", month: "short" }).replace(".", "");
}

export function diaConSemana(ymd: string): string {
  return formatear(ymd, { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
}

export function nombreMes(ymd: string): string {
  return formatear(ymd, { month: "long" });
}

export function rangoCorto(inicio: string, fin: string): string {
  return `${diaCorto(inicio)} – ${diaCorto(fin)}`;
}

// Título del periodo que se está viendo.
export function etiquetaPeriodo(p: Periodo): string {
  switch (p.vista) {
    case "dia":
      return formatear(p.inicio, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    case "semana":
      return `Semana ${semanaDe(p.inicio)?.numero} · ${rangoCorto(p.inicio, p.fin)} de ${p.fin.slice(0, 4)}`;
    case "mes":
      return `${nombreMes(p.inicio)} de ${p.inicio.slice(0, 4)}`;
    case "anio":
      return p.inicio.slice(0, 4);
  }
}

export const NOMBRE_VISTA: Record<Vista, string> = { dia: "Día", semana: "Semana", mes: "Mes", anio: "Año" };

// "frente a la semana anterior", para el recuadro de reportes.
export const FRENTE_A: Record<Vista, string> = {
  dia: "el día anterior",
  semana: "la semana anterior",
  mes: "el mes anterior",
  anio: "el año anterior",
};
