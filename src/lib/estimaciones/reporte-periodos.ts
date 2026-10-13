// Periodos del reporte: semana, mes o año. Todo el dashboard (cifras, gráficas,
// rendimiento por maquilador y comparativa) trabaja sobre un `Periodo`, así que
// las tres vistas comparten la misma estructura. Todo es puro.
//
// Qué recibos entran en cada periodo:
//  - Semana: la semana N del reporte junta lo pagado en la semana ISO N+1 (ver
//    reporte-semanal.ts).
//  - Mes y año: lo pagado dentro del mes o año calendario, por fecha de pago en
//    hora de la Ciudad de México.

import { interpretarSemana } from "./reporte-control";
import {
  fechaLocal,
  rangoSemana,
  semanaDeFecha,
  semanaDePago,
  semanaVecina,
  type Semana,
} from "./reporte-semanal";

export type TipoPeriodo = "semana" | "mes" | "anio";

export const TIPOS_PERIODO: TipoPeriodo[] = ["semana", "mes", "anio"];

export interface Periodo {
  tipo: TipoPeriodo;
  anio: number;
  // Semana ISO (1-53) o mes (1-12). En el año siempre es 1.
  numero: number;
}

export function esTipoPeriodo(v: unknown): v is TipoPeriodo {
  return v === "semana" || v === "mes" || v === "anio";
}

export const periodoDeSemana = (s: Semana): Periodo => ({ tipo: "semana", anio: s.anio, numero: s.semana });
export const semanaDePeriodo = (p: Periodo): Semana => ({ anio: p.anio, semana: p.numero });

export const clavePeriodo = (p: Periodo) => `${p.tipo}-${p.anio}-${p.numero}`;

export const mismoPeriodo = (a: Periodo, b: Periodo) => clavePeriodo(a) === clavePeriodo(b);

// Cuántos periodos se leen hacia atrás para las gráficas y el rendimiento.
export const HISTORIAL: Record<TipoPeriodo, number> = { semana: 8, mes: 12, anio: 4 };

// --- Textos -----------------------------------------------------------------

export interface TextosPeriodo {
  singular: string;
  plural: string;
  este: string;
  anterior: string;
  promedio: string;
  mejor: string;
  // "Total pagado" del periodo anterior, para los pies de las tarjetas.
  vsAnterior: string;
}

export const TEXTOS_PERIODO: Record<TipoPeriodo, TextosPeriodo> = {
  semana: {
    singular: "semana",
    plural: "semanas",
    este: "esta semana",
    anterior: "la semana anterior",
    promedio: "Promedio semanal",
    mejor: "Mejor semana",
    vsAnterior: "vs semana anterior",
  },
  mes: {
    singular: "mes",
    plural: "meses",
    este: "este mes",
    anterior: "el mes anterior",
    promedio: "Promedio mensual",
    mejor: "Mejor mes",
    vsAnterior: "vs mes anterior",
  },
  anio: {
    singular: "año",
    plural: "años",
    este: "este año",
    anterior: "el año anterior",
    promedio: "Promedio anual",
    mejor: "Mejor año",
    vsAnterior: "vs año anterior",
  },
};

export const NOMBRE_TIPO_PERIODO: Record<TipoPeriodo, string> = {
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
};

export const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// "Semana 40 de 2026", "Octubre de 2026", "Año 2026".
export function tituloPeriodo(p: Periodo): string {
  if (p.tipo === "semana") return `Semana ${p.numero} de ${p.anio}`;
  if (p.tipo === "mes") return `${MESES[p.numero - 1]} de ${p.anio}`;
  return `Año ${p.anio}`;
}

// Etiqueta corta para el eje de las barras: "S40", "Oct 26", "2026".
export function etiquetaCortaPeriodo(p: Periodo): string {
  if (p.tipo === "semana") return `S${p.numero}`;
  if (p.tipo === "mes") return `${MESES[p.numero - 1].slice(0, 3)} ${String(p.anio % 100).padStart(2, "0")}`;
  return String(p.anio);
}

// --- Fechas -----------------------------------------------------------------

const dos = (n: number) => String(n).padStart(2, "0");

function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

// Fechas locales "AAAA-MM-DD" (ambas incluidas) en que se pagan los recibos del
// periodo.
export function rangoPago(p: Periodo): { desde: string; hasta: string } {
  if (p.tipo === "semana") return rangoSemana(semanaDePago(semanaDePeriodo(p)));
  if (p.tipo === "mes") {
    return {
      desde: `${p.anio}-${dos(p.numero)}-01`,
      hasta: `${p.anio}-${dos(p.numero)}-${dos(diasDelMes(p.anio, p.numero))}`,
    };
  }
  return { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` };
}

// Semana de reporte a la que pertenece un recibo pagado en `pagadoEn`.
export function semanaDeReporteDe(pagadoEn: string): Semana {
  return semanaVecina(semanaDeFecha(fechaLocal(pagadoEn)), -1);
}

// El periodo de `tipo` al que pertenece una fecha de pago "AAAA-MM-DD".
export function periodoDePago(fecha: string, tipo: TipoPeriodo): Periodo {
  if (tipo === "semana") return periodoDeSemana(semanaVecina(semanaDeFecha(fecha), -1));
  const [anio, mes] = fecha.split("-").map(Number);
  return tipo === "mes" ? { tipo, anio, numero: mes } : { tipo, anio, numero: 1 };
}

// El periodo de `tipo` al que cuenta un recibo pagado en `pagadoEn` (timestamp).
export function periodoDeRecibo(pagadoEn: string, tipo: TipoPeriodo): Periodo {
  return periodoDePago(fechaLocal(pagadoEn), tipo);
}

// Al cambiar de pestaña (semana → mes → año) se conserva la época: se pasa al
// periodo del otro tipo que contiene el primer día de pago del actual.
export function convertirPeriodo(p: Periodo, tipo: TipoPeriodo): Periodo {
  if (p.tipo === tipo) return p;
  return periodoDePago(rangoPago(p).desde, tipo);
}

export function periodoVecino(p: Periodo, delta: 1 | -1): Periodo {
  if (p.tipo === "semana") return periodoDeSemana(semanaVecina(semanaDePeriodo(p), delta));
  if (p.tipo === "anio") return { ...p, anio: p.anio + delta };
  const indice = p.anio * 12 + (p.numero - 1) + delta;
  return { tipo: "mes", anio: Math.floor(indice / 12), numero: (indice % 12) + 1 };
}

// Los `n` periodos que terminan en `hasta`, del más antiguo al más reciente.
export function ultimosPeriodos(hasta: Periodo, n: number = HISTORIAL[hasta.tipo]): Periodo[] {
  const lista: Periodo[] = [hasta];
  while (lista.length < n) lista.unshift(periodoVecino(lista[0], -1));
  return lista;
}

// Fechas de pago que cubre una lista de periodos (para una sola consulta).
export function rangoPagoDe(periodos: Periodo[]): { desde: string; hasta: string } {
  return {
    desde: rangoPago(periodos[0]).desde,
    hasta: rangoPago(periodos[periodos.length - 1]).hasta,
  };
}

// --- Lo que pide la URL -----------------------------------------------------

const sinValor = (v?: string) => v === undefined || v.trim() === "";

// El periodo por defecto de cada tipo: la semana que toca reportar (la que se
// paga ahora), el mes y el año en curso.
export function periodoPorDefecto(tipo: TipoPeriodo, ahora: Date = new Date()): Periodo {
  if (tipo === "semana") {
    return periodoDeSemana(semanaVecina(semanaDeFecha(fechaLocal(ahora)), -1));
  }
  return periodoDePago(fechaLocal(ahora), tipo);
}

export function interpretarPeriodo(
  p: { periodo?: string; anio?: string; semana?: string; mes?: string },
  ahora: Date = new Date()
): { periodo: Periodo; aviso: string | null } {
  const tipo: TipoPeriodo = esTipoPeriodo(p.periodo) ? p.periodo : "semana";
  if (tipo === "semana") {
    const { semana, aviso } = interpretarSemana(p.anio, p.semana, ahora);
    return { periodo: periodoDeSemana(semana), aviso };
  }

  const porDefecto = periodoPorDefecto(tipo, ahora);
  const alternativa = `Se muestra ${tituloPeriodo(porDefecto).toLowerCase()}.`;
  const hayMes = tipo === "mes";
  if (sinValor(p.anio) && (!hayMes || sinValor(p.mes))) return { periodo: porDefecto, aviso: null };

  const anio = Number(p.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
    return { periodo: porDefecto, aviso: `El año "${p.anio ?? ""}" no es válido. ${alternativa}` };
  }
  if (!hayMes) return { periodo: { tipo, anio, numero: 1 }, aviso: null };

  const mes = Number(p.mes);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { periodo: porDefecto, aviso: `El mes "${p.mes ?? ""}" no es válido. ${alternativa}` };
  }
  return { periodo: { tipo, anio, numero: mes }, aviso: null };
}

// Parámetros de URL de un periodo ("periodo=mes&anio=2026&mes=10").
export function consultaPeriodo(p: Periodo): string {
  const qs = new URLSearchParams({ periodo: p.tipo, anio: String(p.anio) });
  if (p.tipo === "semana") qs.set("semana", String(p.numero));
  if (p.tipo === "mes") qs.set("mes", String(p.numero));
  return qs.toString();
}
