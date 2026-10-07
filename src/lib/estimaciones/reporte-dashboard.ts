// Cifras del dashboard del reporte semanal: reparto de lo pagado por
// maquilador y por área, e historial de varias semanas para medir el
// rendimiento de cada maquilador. Todo sobre los mismos recibos PAGADOS que usa
// el reporte (ver reporte-semanal.ts); aquí no se lee nada de la base.
//
// "Semana de reporte": la semana N se paga en la N+1, así que un recibo pagado
// en la semana ISO N+1 cuenta en la semana N del reporte.

import {
  claveContratista,
  fechaLocal,
  semanaDeFecha,
  semanaDePago,
  semanaVecina,
  type ReciboPagado,
  type Semana,
} from "./reporte-semanal";
import type { TipoCualquierRecibo } from "./revision-db";

export const SEMANAS_HISTORIAL = 8;

const redondear = (n: number) => Math.round(n * 100) / 100;

const claveSemana = (s: Semana) => `${s.anio}-${String(s.semana).padStart(2, "0")}`;

// Semana de reporte a la que pertenece un recibo pagado.
export function semanaDeReporteDe(pagadoEn: string): Semana {
  return semanaVecina(semanaDeFecha(fechaLocal(pagadoEn)), -1);
}

// Las `n` semanas que terminan en `hasta`, de la más antigua a la más reciente.
export function ultimasSemanas(hasta: Semana, n: number = SEMANAS_HISTORIAL): Semana[] {
  const semanas: Semana[] = [hasta];
  while (semanas.length < n) semanas.unshift(semanaVecina(semanas[0], -1));
  return semanas;
}

// Rango de semanas de PAGO (para la consulta) que cubre el historial.
export function semanasDePagoDelHistorial(semanas: Semana[]): { primera: Semana; ultima: Semana } {
  return { primera: semanaDePago(semanas[0]), ultima: semanaDePago(semanas[semanas.length - 1]) };
}

// --- Reparto ----------------------------------------------------------------

export interface Porcion {
  etiqueta: string;
  importe: number;
  // 0-100, con un decimal.
  porcentaje: number;
}

// Porcentajes de un reparto con un decimal. El total cuadra con 100 salvo
// redondeo; un total en cero reparte 0 a todos.
function conPorcentaje(items: { etiqueta: string; importe: number }[]): Porcion[] {
  const total = items.reduce((s, i) => s + i.importe, 0);
  return items.map((i) => ({
    etiqueta: i.etiqueta,
    importe: redondear(i.importe),
    porcentaje: total > 0 ? Math.round((i.importe / total) * 1000) / 10 : 0,
  }));
}

function nombreContratista(r: ReciboPagado): string {
  return r.contratista.trim() || "Sin contratista";
}

// Lo pagado a cada maquilador, de mayor a menor. Maquiladores con el nombre
// escrito distinto (mayúsculas, acentos) se juntan, como en el reporte.
export function repartoPorMaquilador(recibos: ReciboPagado[]): Porcion[] {
  const grupos = new Map<string, { etiqueta: string; importe: number }>();
  for (const r of recibos) {
    const nombre = nombreContratista(r);
    const clave = claveContratista(nombre);
    const g = grupos.get(clave) ?? { etiqueta: nombre, importe: 0 };
    g.importe += r.importe;
    grupos.set(clave, g);
  }
  return conPorcentaje(
    [...grupos.values()].sort(
      (a, b) => b.importe - a.importe || a.etiqueta.localeCompare(b.etiqueta, "es")
    )
  );
}

export const ETIQUETA_AREA: Record<TipoCualquierRecibo, string> = {
  acabados: "Acabados",
  armado: "Armado",
  electrificacion: "Electrificación",
};

export function repartoPorArea(recibos: ReciboPagado[]): Porcion[] {
  const porArea = new Map<TipoCualquierRecibo, number>();
  for (const r of recibos) porArea.set(r.tipo, (porArea.get(r.tipo) ?? 0) + r.importe);
  return conPorcentaje(
    (Object.keys(ETIQUETA_AREA) as TipoCualquierRecibo[])
      .filter((t) => porArea.has(t))
      .map((t) => ({ etiqueta: ETIQUETA_AREA[t], importe: porArea.get(t) ?? 0 }))
  );
}

// Deja las `max` porciones más grandes y junta el resto en "Otros" (una
// gráfica de pastel con decenas de rebanadas no se lee).
export function agruparEnOtros(porciones: Porcion[], max: number): Porcion[] {
  if (porciones.length <= max) return porciones;
  const cola = porciones.slice(max - 1);
  const importe = redondear(cola.reduce((s, p) => s + p.importe, 0));
  const porcentaje = Math.round(cola.reduce((s, p) => s + p.porcentaje, 0) * 10) / 10;
  return [...porciones.slice(0, max - 1), { etiqueta: "Otros", importe, porcentaje }];
}

// --- Rendimiento por maquilador ---------------------------------------------

export interface SemanaMaquilador {
  semana: Semana;
  importe: number;
  recibos: number;
}

export interface KpiMaquilador {
  contratista: string;
  // Semana que se está viendo.
  importeSemana: number;
  recibosSemana: number;
  otsSemana: number;
  // Parte del total pagado esa semana (0-100, un decimal).
  porcentajeSemana: number;
  // Promedio de las semanas del historial en que cobró (no cuenta semanas en cero).
  promedioSemanal: number;
  // Cambio contra la semana anterior, en %: null si la anterior fue cero.
  cambioVsAnterior: number | null;
  // Contra su propio promedio de las demás semanas del historial, en %.
  cambioVsPromedio: number | null;
  semanasConPago: number;
  mejorSemana: SemanaMaquilador | null;
  historial: SemanaMaquilador[];
  // Posición por lo pagado en la semana (1 = quien más cobró); 0 si no cobró.
  lugar: number;
}

export interface TableroSemanal {
  semanas: Semana[];
  // Total pagado cada semana del historial (todos los maquiladores).
  totalesPorSemana: { semana: Semana; importe: number; recibos: number }[];
  maquiladores: KpiMaquilador[];
  importeSemana: number;
  recibosSemana: number;
  otsSemana: number;
  // Maquiladores con pago en la semana vista.
  activosSemana: number;
  cambioTotalVsAnterior: number | null;
  // Contra el promedio de las demás semanas del historial en que se pagó algo.
  cambioTotalVsPromedio: number | null;
  ticketPromedio: number | null;
}

// Cambio a partir del cual un maquilador se marca como notable.
export const UMBRAL_CAMBIO_NOTABLE = 30;

export interface CambioNotable {
  contratista: string;
  importeSemana: number;
  // Contra su promedio de las demás semanas, en %.
  cambio: number;
}

// Maquiladores que cobraron mucho más o mucho menos que su promedio, de mayor a
// menor variación absoluta. Quien no cobró esta semana pero suele cobrar cuenta
// como una baja del 100%.
export function cambiosNotables(
  maquiladores: KpiMaquilador[],
  umbral: number = UMBRAL_CAMBIO_NOTABLE
): CambioNotable[] {
  return maquiladores
    .flatMap((m) => {
      const cambio =
        m.importeSemana > 0
          ? m.cambioVsPromedio
          : m.semanasConPago > 0 && m.promedioSemanal > 0
            ? -100
            : null;
      return cambio != null && Math.abs(cambio) >= umbral
        ? [{ contratista: m.contratista, importeSemana: m.importeSemana, cambio }]
        : [];
    })
    .sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio) || a.contratista.localeCompare(b.contratista, "es"));
}

const porcentajeDeCambio = (actual: number, base: number): number | null =>
  base > 0 ? Math.round(((actual - base) / base) * 1000) / 10 : null;

// `recibos`: todos los pagados dentro del historial (cualquier semana). Solo
// cuentan los que caen en una de las `semanas`.
export function armarTablero(
  recibos: ReciboPagado[],
  semanaVista: Semana,
  n: number = SEMANAS_HISTORIAL
): TableroSemanal {
  const semanas = ultimasSemanas(semanaVista, n);
  const indice = new Map(semanas.map((s, i) => [claveSemana(s), i]));
  const ultimo = semanas.length - 1;

  interface Acum {
    contratista: string;
    importes: number[];
    recibos: number[];
    ots: Set<string>[];
  }
  const porMaquilador = new Map<string, Acum>();
  const totales = semanas.map((semana) => ({ semana, importe: 0, recibos: 0 }));
  const otsTotales = new Set<string>();

  for (const r of recibos) {
    const i = indice.get(claveSemana(semanaDeReporteDe(r.pagadoEn)));
    if (i === undefined) continue;
    const nombre = nombreContratista(r);
    const clave = claveContratista(nombre);
    let a = porMaquilador.get(clave);
    if (!a) {
      a = {
        contratista: nombre,
        importes: semanas.map(() => 0),
        recibos: semanas.map(() => 0),
        ots: semanas.map(() => new Set<string>()),
      };
      porMaquilador.set(clave, a);
    }
    a.importes[i] += r.importe;
    a.recibos[i] += 1;
    totales[i].importe += r.importe;
    totales[i].recibos += 1;
    const ot = r.ot.trim();
    if (ot) {
      a.ots[i].add(ot);
      if (i === ultimo) otsTotales.add(ot);
    }
  }

  const importeSemana = redondear(totales[ultimo].importe);

  const maquiladores: KpiMaquilador[] = [...porMaquilador.values()].map((a) => {
    const historial: SemanaMaquilador[] = semanas.map((semana, i) => ({
      semana,
      importe: redondear(a.importes[i]),
      recibos: a.recibos[i],
    }));
    const conPago = historial.filter((h) => h.importe > 0);
    const actual = historial[ultimo].importe;
    const anterior = ultimo > 0 ? historial[ultimo - 1].importe : 0;
    const otrasConPago = historial.slice(0, ultimo).filter((h) => h.importe > 0);
    const promedioOtras =
      otrasConPago.length > 0
        ? otrasConPago.reduce((s, h) => s + h.importe, 0) / otrasConPago.length
        : 0;
    const mejor = conPago.reduce<SemanaMaquilador | null>(
      (m, h) => (m === null || h.importe > m.importe ? h : m),
      null
    );
    return {
      contratista: a.contratista,
      importeSemana: actual,
      recibosSemana: a.recibos[ultimo],
      otsSemana: a.ots[ultimo].size,
      porcentajeSemana: importeSemana > 0 ? Math.round((actual / importeSemana) * 1000) / 10 : 0,
      promedioSemanal: redondear(
        conPago.length > 0 ? conPago.reduce((s, h) => s + h.importe, 0) / conPago.length : 0
      ),
      cambioVsAnterior: porcentajeDeCambio(actual, anterior),
      cambioVsPromedio: actual > 0 ? porcentajeDeCambio(actual, promedioOtras) : null,
      semanasConPago: conPago.length,
      mejorSemana: mejor,
      historial,
      lugar: 0,
    };
  });

  // Primero quienes cobraron en la semana vista (de más a menos); luego el
  // resto por su promedio, para que se vea quién estuvo antes y hoy no.
  maquiladores.sort(
    (a, b) =>
      b.importeSemana - a.importeSemana ||
      b.promedioSemanal - a.promedioSemanal ||
      a.contratista.localeCompare(b.contratista, "es")
  );
  let lugar = 0;
  for (const m of maquiladores) m.lugar = m.importeSemana > 0 ? ++lugar : 0;

  const recibosSemana = totales[ultimo].recibos;
  const otrasSemanas = totales.slice(0, ultimo).filter((t) => t.importe > 0);
  const promedioOtras =
    otrasSemanas.length > 0 ? otrasSemanas.reduce((s, t) => s + t.importe, 0) / otrasSemanas.length : 0;
  return {
    semanas,
    totalesPorSemana: totales.map((t) => ({ ...t, importe: redondear(t.importe) })),
    maquiladores,
    importeSemana,
    recibosSemana,
    otsSemana: otsTotales.size,
    activosSemana: maquiladores.filter((m) => m.importeSemana > 0).length,
    cambioTotalVsAnterior:
      ultimo > 0 ? porcentajeDeCambio(totales[ultimo].importe, totales[ultimo - 1].importe) : null,
    cambioTotalVsPromedio: importeSemana > 0 ? porcentajeDeCambio(importeSemana, promedioOtras) : null,
    ticketPromedio: recibosSemana > 0 ? redondear(importeSemana / recibosSemana) : null,
  };
}
