// Cifras del dashboard del reporte: reparto de lo pagado por maquilador y por
// área, e historial de varios periodos (semanas, meses o años) para medir el
// rendimiento de cada maquilador. Todo sobre los mismos recibos PAGADOS que usa
// el reporte (ver reporte-semanal.ts); aquí no se lee nada de la base.
//
// El periodo que se ve (`Periodo`, ver reporte-periodos.ts) puede ser una
// semana, un mes o un año: el tablero tiene la misma forma en los tres.

import { claveContratista, type ReciboPagado } from "./reporte-semanal";
import {
  clavePeriodo,
  HISTORIAL,
  periodoDeRecibo,
  ultimosPeriodos,
  type Periodo,
} from "./reporte-periodos";
import type { TipoCualquierRecibo } from "./revision-db";

// La semana de reporte de un recibo vive en reporte-periodos.ts.
export { semanaDeReporteDe } from "./reporte-periodos";

const redondear = (n: number) => Math.round(n * 100) / 100;

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

export function nombreContratista(r: ReciboPagado): string {
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

export interface PuntoMaquilador {
  periodo: Periodo;
  importe: number;
  recibos: number;
}

export interface KpiMaquilador {
  contratista: string;
  // Periodo que se está viendo.
  importe: number;
  recibos: number;
  ots: number;
  // Parte del total pagado en el periodo (0-100, un decimal).
  porcentaje: number;
  // Promedio de los periodos del historial en que cobró (no cuenta los de cero).
  promedio: number;
  // Cambio contra el periodo anterior, en %: null si el anterior fue cero.
  cambioVsAnterior: number | null;
  // Contra su propio promedio de los demás periodos del historial, en %.
  cambioVsPromedio: number | null;
  periodosConPago: number;
  mejor: PuntoMaquilador | null;
  historial: PuntoMaquilador[];
  // Posición por lo pagado en el periodo (1 = quien más cobró); 0 si no cobró.
  lugar: number;
}

export interface Tablero {
  periodos: Periodo[];
  // Total pagado cada periodo del historial (todos los maquiladores).
  totales: { periodo: Periodo; importe: number; recibos: number }[];
  maquiladores: KpiMaquilador[];
  importe: number;
  recibos: number;
  ots: number;
  // Maquiladores con pago en el periodo visto.
  activos: number;
  cambioTotalVsAnterior: number | null;
  // Contra el promedio de los demás periodos del historial en que se pagó algo.
  cambioTotalVsPromedio: number | null;
  ticketPromedio: number | null;
}

// Cambio a partir del cual un maquilador se marca como notable.
export const UMBRAL_CAMBIO_NOTABLE = 30;

export interface CambioNotable {
  contratista: string;
  importe: number;
  // Contra su promedio de los demás periodos, en %.
  cambio: number;
}

// Maquiladores que cobraron mucho más o mucho menos que su promedio, de mayor a
// menor variación absoluta. Quien no cobró en el periodo pero suele cobrar cuenta
// como una baja del 100%.
export function cambiosNotables(
  maquiladores: KpiMaquilador[],
  umbral: number = UMBRAL_CAMBIO_NOTABLE
): CambioNotable[] {
  return maquiladores
    .flatMap((m) => {
      const cambio =
        m.importe > 0
          ? m.cambioVsPromedio
          : m.periodosConPago > 0 && m.promedio > 0
            ? -100
            : null;
      return cambio != null && Math.abs(cambio) >= umbral
        ? [{ contratista: m.contratista, importe: m.importe, cambio }]
        : [];
    })
    .sort((a, b) => Math.abs(b.cambio) - Math.abs(a.cambio) || a.contratista.localeCompare(b.contratista, "es"));
}

export const porcentajeDeCambio = (actual: number, base: number): number | null =>
  base > 0 ? Math.round(((actual - base) / base) * 1000) / 10 : null;

// `recibos`: todos los pagados dentro del historial (de cualquier periodo).
// Solo cuentan los que caen en uno de los `n` periodos que terminan en `vista`.
export function armarTablero(
  recibos: ReciboPagado[],
  vista: Periodo,
  n: number = HISTORIAL[vista.tipo]
): Tablero {
  const periodos = ultimosPeriodos(vista, n);
  const indice = new Map(periodos.map((p, i) => [clavePeriodo(p), i]));
  const ultimo = periodos.length - 1;

  interface Acum {
    contratista: string;
    importes: number[];
    recibos: number[];
    ots: Set<string>[];
  }
  const porMaquilador = new Map<string, Acum>();
  const totales = periodos.map((periodo) => ({ periodo, importe: 0, recibos: 0 }));
  const otsTotales = new Set<string>();

  for (const r of recibos) {
    const i = indice.get(clavePeriodo(periodoDeRecibo(r.pagadoEn, vista.tipo)));
    if (i === undefined) continue;
    const nombre = nombreContratista(r);
    const clave = claveContratista(nombre);
    let a = porMaquilador.get(clave);
    if (!a) {
      a = {
        contratista: nombre,
        importes: periodos.map(() => 0),
        recibos: periodos.map(() => 0),
        ots: periodos.map(() => new Set<string>()),
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

  const importe = redondear(totales[ultimo].importe);

  const maquiladores: KpiMaquilador[] = [...porMaquilador.values()].map((a) => {
    const historial: PuntoMaquilador[] = periodos.map((periodo, i) => ({
      periodo,
      importe: redondear(a.importes[i]),
      recibos: a.recibos[i],
    }));
    const conPago = historial.filter((h) => h.importe > 0);
    const actual = historial[ultimo].importe;
    const anterior = ultimo > 0 ? historial[ultimo - 1].importe : 0;
    const otrosConPago = historial.slice(0, ultimo).filter((h) => h.importe > 0);
    const promedioOtros =
      otrosConPago.length > 0
        ? otrosConPago.reduce((s, h) => s + h.importe, 0) / otrosConPago.length
        : 0;
    const mejor = conPago.reduce<PuntoMaquilador | null>(
      (m, h) => (m === null || h.importe > m.importe ? h : m),
      null
    );
    return {
      contratista: a.contratista,
      importe: actual,
      recibos: a.recibos[ultimo],
      ots: a.ots[ultimo].size,
      porcentaje: importe > 0 ? Math.round((actual / importe) * 1000) / 10 : 0,
      promedio: redondear(
        conPago.length > 0 ? conPago.reduce((s, h) => s + h.importe, 0) / conPago.length : 0
      ),
      cambioVsAnterior: porcentajeDeCambio(actual, anterior),
      cambioVsPromedio: actual > 0 ? porcentajeDeCambio(actual, promedioOtros) : null,
      periodosConPago: conPago.length,
      mejor,
      historial,
      lugar: 0,
    };
  });

  // Primero quienes cobraron en el periodo visto (de más a menos); luego el
  // resto por su promedio, para que se vea quién estuvo antes y hoy no.
  maquiladores.sort(
    (a, b) =>
      b.importe - a.importe ||
      b.promedio - a.promedio ||
      a.contratista.localeCompare(b.contratista, "es")
  );
  let lugar = 0;
  for (const m of maquiladores) m.lugar = m.importe > 0 ? ++lugar : 0;

  const recibosVista = totales[ultimo].recibos;
  const otrosPeriodos = totales.slice(0, ultimo).filter((t) => t.importe > 0);
  const promedioOtros =
    otrosPeriodos.length > 0 ? otrosPeriodos.reduce((s, t) => s + t.importe, 0) / otrosPeriodos.length : 0;
  return {
    periodos,
    totales: totales.map((t) => ({ ...t, importe: redondear(t.importe) })),
    maquiladores,
    importe,
    recibos: recibosVista,
    ots: otsTotales.size,
    activos: maquiladores.filter((m) => m.importe > 0).length,
    cambioTotalVsAnterior:
      ultimo > 0 ? porcentajeDeCambio(totales[ultimo].importe, totales[ultimo - 1].importe) : null,
    cambioTotalVsPromedio: importe > 0 ? porcentajeDeCambio(importe, promedioOtros) : null,
    ticketPromedio: recibosVista > 0 ? redondear(importe / recibosVista) : null,
  };
}
