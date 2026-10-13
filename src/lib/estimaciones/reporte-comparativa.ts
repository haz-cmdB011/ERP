// Comparativa del reporte: el periodo que se ve contra el anterior (semana
// contra semana, mes contra mes, año contra año). Sale de los mismos recibos
// pagados que el tablero; aquí no se lee nada de la base. Todo es puro.

import { money } from "./motor-precio";
import {
  ETIQUETA_AREA,
  nombreContratista,
  porcentajeDeCambio,
} from "./reporte-dashboard";
import { clavePeriodo, periodoDeRecibo, periodoVecino, TEXTOS_PERIODO, type Periodo } from "./reporte-periodos";
import { claveContratista, type ReciboPagado } from "./reporte-semanal";
import type { TipoCualquierRecibo } from "./revision-db";

const redondear = (n: number) => Math.round(n * 100) / 100;

export interface Metrica {
  actual: number;
  anterior: number;
  diferencia: number;
  // En %: null si el periodo anterior fue cero.
  cambio: number | null;
}

export type EstadoCambio = "nuevo" | "sin-pago" | "sube" | "baja" | "igual";

export interface FilaComparativa {
  etiqueta: string;
  actual: number;
  anterior: number;
  diferencia: number;
  cambio: number | null;
  estado: EstadoCambio;
}

export interface Comparativa {
  anterior: Periodo;
  // Hubo pagos en el periodo anterior (si no, no hay contra qué comparar).
  hayBase: boolean;
  total: Metrica;
  recibos: Metrica;
  activos: Metrica;
  ticket: Metrica;
  ots: Metrica;
  porArea: FilaComparativa[];
  // Los de mayor variación primero (en valor absoluto).
  porMaquilador: FilaComparativa[];
  // Frases con lo más importante que cambió.
  hallazgos: string[];
}

function metrica(actual: number, anterior: number): Metrica {
  return {
    actual: redondear(actual),
    anterior: redondear(anterior),
    diferencia: redondear(actual - anterior),
    cambio: porcentajeDeCambio(actual, anterior),
  };
}

function fila(etiqueta: string, actual: number, anterior: number): FilaComparativa {
  const diferencia = redondear(actual - anterior);
  const estado: EstadoCambio =
    actual > 0 && anterior <= 0
      ? "nuevo"
      : actual <= 0 && anterior > 0
        ? "sin-pago"
        : diferencia > 0
          ? "sube"
          : diferencia < 0
            ? "baja"
            : "igual";
  return {
    etiqueta,
    actual: redondear(actual),
    anterior: redondear(anterior),
    diferencia,
    cambio: porcentajeDeCambio(actual, anterior),
    estado,
  };
}

const fmtPct = (n: number) => n.toLocaleString("es-MX", { maximumFractionDigits: 1 });

function lista(nombres: string[], max = 3): string {
  const visibles = nombres.slice(0, max).join(", ");
  return nombres.length > max ? `${visibles} y ${nombres.length - max} más` : visibles;
}

interface Resumen {
  importe: number;
  recibos: number;
  ots: Set<string>;
  maquiladores: Map<string, { nombre: string; importe: number }>;
  areas: Map<TipoCualquierRecibo, number>;
}

function resumir(recibos: ReciboPagado[]): Resumen {
  const r: Resumen = { importe: 0, recibos: 0, ots: new Set(), maquiladores: new Map(), areas: new Map() };
  for (const x of recibos) {
    r.importe += x.importe;
    r.recibos += 1;
    const ot = x.ot.trim();
    if (ot) r.ots.add(ot);
    const nombre = nombreContratista(x);
    const clave = claveContratista(nombre);
    const m = r.maquiladores.get(clave) ?? { nombre, importe: 0 };
    m.importe += x.importe;
    r.maquiladores.set(clave, m);
    r.areas.set(x.tipo, (r.areas.get(x.tipo) ?? 0) + x.importe);
  }
  return r;
}

// `recibos`: todos los pagados del historial (cualquier periodo); solo cuentan
// los de `actual` y los de su periodo anterior.
export function compararPeriodos(recibos: ReciboPagado[], actual: Periodo): Comparativa {
  const anterior = periodoVecino(actual, -1);
  const claveActual = clavePeriodo(actual);
  const claveAnterior = clavePeriodo(anterior);
  const deActual: ReciboPagado[] = [];
  const deAnterior: ReciboPagado[] = [];
  for (const r of recibos) {
    const clave = clavePeriodo(periodoDeRecibo(r.pagadoEn, actual.tipo));
    if (clave === claveActual) deActual.push(r);
    else if (clave === claveAnterior) deAnterior.push(r);
  }
  const a = resumir(deActual);
  const b = resumir(deAnterior);

  const activosA = [...a.maquiladores.values()].filter((m) => m.importe > 0).length;
  const activosB = [...b.maquiladores.values()].filter((m) => m.importe > 0).length;

  const porArea = (Object.keys(ETIQUETA_AREA) as TipoCualquierRecibo[]).map((t) =>
    fila(ETIQUETA_AREA[t], a.areas.get(t) ?? 0, b.areas.get(t) ?? 0)
  );

  const claves = new Set([...a.maquiladores.keys(), ...b.maquiladores.keys()]);
  const porMaquilador = [...claves]
    .map((clave) =>
      fila(
        (a.maquiladores.get(clave) ?? b.maquiladores.get(clave))!.nombre,
        a.maquiladores.get(clave)?.importe ?? 0,
        b.maquiladores.get(clave)?.importe ?? 0
      )
    )
    .sort(
      (x, y) =>
        Math.abs(y.diferencia) - Math.abs(x.diferencia) || x.etiqueta.localeCompare(y.etiqueta, "es")
    );

  const comparativa: Comparativa = {
    anterior,
    hayBase: deAnterior.length > 0,
    total: metrica(a.importe, b.importe),
    recibos: metrica(a.recibos, b.recibos),
    activos: metrica(activosA, activosB),
    ticket: metrica(a.recibos > 0 ? a.importe / a.recibos : 0, b.recibos > 0 ? b.importe / b.recibos : 0),
    ots: metrica(a.ots.size, b.ots.size),
    porArea,
    porMaquilador,
    hallazgos: [],
  };
  comparativa.hallazgos = hallazgosDe(comparativa, actual);
  return comparativa;
}

function hallazgosDe(c: Comparativa, actual: Periodo): string[] {
  const antes = TEXTOS_PERIODO[actual.tipo].anterior;
  const esteTexto = TEXTOS_PERIODO[actual.tipo].este;
  if (!c.hayBase && c.total.actual === 0) return [`No hubo pagos ni ${esteTexto} ni ${antes}.`];
  if (!c.hayBase) {
    return [`Se pagó ${money(c.total.actual)} ${esteTexto}; no hubo pagos ${antes}, así que no hay contra qué comparar.`];
  }

  const frases: string[] = [];
  const { diferencia, cambio } = c.total;
  if (diferencia === 0) {
    frases.push(`Se pagó lo mismo que ${antes}: ${money(c.total.actual)}.`);
  } else {
    frases.push(
      `Se pagó ${money(c.total.actual)} ${esteTexto}: ${money(Math.abs(diferencia))} ${
        diferencia > 0 ? "más" : "menos"
      }${cambio == null ? "" : ` (${fmtPct(Math.abs(cambio))}%)`} que ${antes} (${money(c.total.anterior)}).`
    );
  }

  const mayor = (filas: FilaComparativa[], signo: 1 | -1) =>
    filas
      .filter((f) => f.estado !== "nuevo" && f.estado !== "sin-pago" && f.diferencia * signo > 0)
      .sort((x, y) => y.diferencia * signo - x.diferencia * signo)[0];

  const areaSube = mayor(c.porArea, 1);
  const areaBaja = mayor(c.porArea, -1);
  if (areaSube) frases.push(`Área que más creció: ${areaSube.etiqueta} (+${money(areaSube.diferencia)}).`);
  if (areaBaja) frases.push(`Área que más bajó: ${areaBaja.etiqueta} (−${money(Math.abs(areaBaja.diferencia))}).`);

  const sube = mayor(c.porMaquilador, 1);
  const baja = mayor(c.porMaquilador, -1);
  if (sube) frases.push(`Maquilador con mayor aumento: ${sube.etiqueta} (+${money(sube.diferencia)}).`);
  if (baja) frases.push(`Maquilador con mayor baja: ${baja.etiqueta} (−${money(Math.abs(baja.diferencia))}).`);

  const nuevos = c.porMaquilador.filter((f) => f.estado === "nuevo");
  if (nuevos.length > 0) {
    const uno = nuevos.length === 1;
    frases.push(
      `${nuevos.length} maquilador${uno ? "" : "es"} sin pago ${antes} ${uno ? "cobró" : "cobraron"} ${esteTexto}: ${lista(
        nuevos.map((f) => f.etiqueta)
      )}.`
    );
  }
  const sinPago = c.porMaquilador.filter((f) => f.estado === "sin-pago");
  if (sinPago.length > 0) {
    const uno = sinPago.length === 1;
    frases.push(
      `${sinPago.length} maquilador${uno ? "" : "es"} que ${uno ? "cobró" : "cobraron"} ${antes} ${
        uno ? "no tuvo" : "no tuvieron"
      } pago ${esteTexto}: ${lista(sinPago.map((f) => f.etiqueta))}.`
    );
  }
  return frases;
}
