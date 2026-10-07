// Controles del reporte semanal: interpretar la semana pedida en la URL, ver en
// qué fechas se pagó, el "compromiso" (recibos revisados que aún no se pagan) y
// la comparación contra una semana cerrada. Todo es puro; la lectura de la base
// vive en reporte-compromiso-db.ts y reporte-cierres-db.ts.

import {
  fechaLocal,
  semanaPorReportar,
  semanasDelAnio,
  type ReciboPagado,
  type Semana,
} from "./reporte-semanal";
import type { TipoCualquierRecibo } from "./revision-db";

const redondear = (n: number) => Math.round(n * 100) / 100;

const sinValor = (v?: string) => v === undefined || v.trim() === "";

// La semana que pide la URL. Sin parámetros, la que toca reportar. Si vienen y
// no son válidos NO se cambia en silencio: se muestra la semana por reportar y
// se devuelve un aviso para decirlo.
export function interpretarSemana(
  anio?: string,
  semana?: string,
  ahora: Date = new Date()
): { semana: Semana; aviso: string | null } {
  const porReportar = semanaPorReportar(ahora);
  if (sinValor(anio) && sinValor(semana)) return { semana: porReportar, aviso: null };

  const a = Number(anio);
  const s = Number(semana);
  const alternativa = `Se muestra la semana por reportar (${porReportar.semana} de ${porReportar.anio}).`;
  if (!Number.isInteger(a) || a < 2000 || a > 2100) {
    return { semana: porReportar, aviso: `El año "${anio ?? ""}" no es válido. ${alternativa}` };
  }
  if (!Number.isInteger(s) || s < 1 || s > semanasDelAnio(a)) {
    return {
      semana: porReportar,
      aviso: `La semana "${semana ?? ""}" no existe en ${a} (tiene ${semanasDelAnio(a)}). ${alternativa}`,
    };
  }
  return { semana: { anio: a, semana: s }, aviso: null };
}

// --- Fechas de pago ---------------------------------------------------------

export interface FechaDePago {
  // "AAAA-MM-DD", hora de la Ciudad de México.
  fecha: string;
  recibos: number;
  importe: number;
}

// En qué días se pagaron los recibos de la semana, del más antiguo al más reciente.
export function resumenFechasPago(recibos: ReciboPagado[]): FechaDePago[] {
  const porDia = new Map<string, FechaDePago>();
  for (const r of recibos) {
    const fecha = fechaLocal(r.pagadoEn);
    const d = porDia.get(fecha) ?? { fecha, recibos: 0, importe: 0 };
    d.recibos += 1;
    d.importe += r.importe;
    porDia.set(fecha, d);
  }
  return [...porDia.values()]
    .map((d) => ({ ...d, importe: redondear(d.importe) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// --- Compromiso: revisado y sin pagar ---------------------------------------

export interface ReciboPorPagar {
  tipo: TipoCualquierRecibo;
  folio: string;
  contratista: string;
  // null si el recibo quedó revisado sin fecha registrada.
  revisadoEn: string | null;
  importe: number;
}

export interface Compromiso {
  numRecibos: number;
  importe: number;
  porArea: { tipo: TipoCualquierRecibo; recibos: number; importe: number }[];
  // El revisado que lleva más tiempo esperando pago.
  masAntiguo: (ReciboPorPagar & { dias: number }) | null;
  // Los que llevan `diasAtraso` días o más sin pagarse.
  atrasados: number;
}

export const DIAS_ATRASO_PAGO = 7;

function diasEntre(desdeLocal: string, hastaLocal: string): number {
  const ms = Date.parse(`${hastaLocal}T00:00:00Z`) - Date.parse(`${desdeLocal}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

const ORDEN_AREAS: TipoCualquierRecibo[] = ["acabados", "armado", "electrificacion"];

export function resumirCompromiso(
  recibos: ReciboPorPagar[],
  ahora: Date = new Date(),
  diasAtraso: number = DIAS_ATRASO_PAGO
): Compromiso {
  const hoy = fechaLocal(ahora);
  const porArea = new Map<TipoCualquierRecibo, { recibos: number; importe: number }>();
  let masAntiguo: Compromiso["masAntiguo"] = null;
  let atrasados = 0;

  for (const r of recibos) {
    const a = porArea.get(r.tipo) ?? { recibos: 0, importe: 0 };
    a.recibos += 1;
    a.importe += r.importe;
    porArea.set(r.tipo, a);

    if (!r.revisadoEn) continue;
    const dias = diasEntre(fechaLocal(r.revisadoEn), hoy);
    if (dias >= diasAtraso) atrasados += 1;
    if (!masAntiguo || dias > masAntiguo.dias) masAntiguo = { ...r, dias };
  }

  return {
    numRecibos: recibos.length,
    importe: redondear(recibos.reduce((s, r) => s + r.importe, 0)),
    porArea: ORDEN_AREAS.filter((t) => porArea.has(t)).map((t) => ({
      tipo: t,
      recibos: porArea.get(t)!.recibos,
      importe: redondear(porArea.get(t)!.importe),
    })),
    masAntiguo,
    atrasados,
  };
}

// --- Cierre de semana -------------------------------------------------------

export interface ReciboCerrado {
  tipo: TipoCualquierRecibo;
  folio: string;
  contratista: string;
  importe: number;
}

export interface InstantaneaSemana {
  numRecibos: number;
  importe: number;
  recibos: ReciboCerrado[];
}

const claveRecibo = (r: { tipo: string; folio: string }) => `${r.tipo}:${r.folio}`;

// Copia de lo que se reporta: un renglón por recibo, en orden estable.
export function instantaneaDeSemana(recibos: ReciboPagado[]): InstantaneaSemana {
  const lista: ReciboCerrado[] = recibos
    .map((r) => ({
      tipo: r.tipo,
      folio: r.folio,
      contratista: r.contratista.trim() || "Sin contratista",
      importe: redondear(r.importe),
    }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.folio.localeCompare(b.folio, "es", { numeric: true }));
  return {
    numRecibos: lista.length,
    importe: redondear(lista.reduce((s, r) => s + r.importe, 0)),
    recibos: lista,
  };
}

export interface DiferenciaCierre {
  sinCambios: boolean;
  // Actual menos lo cerrado.
  difImporte: number;
  difRecibos: number;
  // Hoy se reportarían y al cerrar no estaban.
  agregados: ReciboCerrado[];
  // Estaban al cerrar y hoy ya no se reportan (eliminados, cancelados o cambiados de semana).
  faltantes: ReciboCerrado[];
  // Siguen, pero con otro importe.
  cambiados: { recibo: ReciboCerrado; importeCerrado: number }[];
}

export function compararConCierre(
  cierre: InstantaneaSemana,
  actual: InstantaneaSemana
): DiferenciaCierre {
  const cerrados = new Map(cierre.recibos.map((r) => [claveRecibo(r), r]));
  const vivos = new Map(actual.recibos.map((r) => [claveRecibo(r), r]));

  const agregados = actual.recibos.filter((r) => !cerrados.has(claveRecibo(r)));
  const faltantes = cierre.recibos.filter((r) => !vivos.has(claveRecibo(r)));
  const cambiados = actual.recibos.flatMap((r) => {
    const antes = cerrados.get(claveRecibo(r));
    return antes && antes.importe !== r.importe ? [{ recibo: r, importeCerrado: antes.importe }] : [];
  });

  const difImporte = redondear(actual.importe - cierre.importe);
  return {
    sinCambios: agregados.length === 0 && faltantes.length === 0 && cambiados.length === 0,
    difImporte,
    difRecibos: actual.numRecibos - cierre.numRecibos,
    agregados,
    faltantes,
    cambiados,
  };
}
