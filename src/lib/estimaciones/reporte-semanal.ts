// Reporte semanal de pagos a maquiladores: sustituye a los Excel
// "Estimaciones SEM nn" y "FORMATO MAQUILA SEMANA nn". Solo entran recibos
// PAGADOS de Acabados, Armado y Electrificación, un renglón por folio,
// agrupados por maquilador (contratista).
//
// Semanas: ISO 8601 (lunes a domingo; la 1 contiene el primer jueves del
// año), la misma numeración que el archivo de Descuentos IMSS. La "Semana N"
// se paga en la semana N+1: el reporte de la semana 38 (14-20 sep) junta los
// recibos con `pagado_en` entre el 21 y el 27 de septiembre, en hora de la
// Ciudad de México.
//
// Seguro social (IMSS): es por contratista y semana, no por OT. El total de
// su cuadrilla se carga al folio de mayor importe (si no alcanza, el resto
// pasa al siguiente). Si el contratista no tiene estimación en la semana, su
// descuento se acumula para la siguiente. Todavía no hay datos de IMSS en el
// ERP: sin ellos el seguro queda en null y el total a pagar es el importe.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { compararFolios } from "./recibos-db";
import type { TipoCualquierRecibo } from "./revision-db";

export const ZONA_HORARIA = "America/Mexico_City";

export interface Semana {
  anio: number;
  semana: number;
}

// --- Semanas ISO ------------------------------------------------------------

function fechaUTC(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Semana ISO de una fecha "AAAA-MM-DD".
export function semanaDeFecha(iso: string): Semana {
  const d = fechaUTC(iso);
  const diaSemana = d.getUTCDay() || 7; // lunes=1 ... domingo=7
  // El jueves de esa semana decide el año ISO.
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const anio = d.getUTCFullYear();
  const inicio = Date.UTC(anio, 0, 1);
  const semana = Math.ceil(((d.getTime() - inicio) / 86400000 + 1) / 7);
  return { anio, semana };
}

// Lunes y domingo ("AAAA-MM-DD") de una semana ISO.
export function rangoSemana({ anio, semana }: Semana): { desde: string; hasta: string } {
  // El 4 de enero siempre cae en la semana 1.
  const cuatroEnero = new Date(Date.UTC(anio, 0, 4));
  const lunes1 = new Date(cuatroEnero);
  lunes1.setUTCDate(4 - ((cuatroEnero.getUTCDay() || 7) - 1));
  const desde = new Date(lunes1);
  desde.setUTCDate(lunes1.getUTCDate() + (semana - 1) * 7);
  const hasta = new Date(desde);
  hasta.setUTCDate(desde.getUTCDate() + 6);
  return { desde: aIso(desde), hasta: aIso(hasta) };
}

// 52 o 53: el año ISO tiene 53 semanas si el 28 de diciembre cae en la 53.
export function semanasDelAnio(anio: number): number {
  return semanaDeFecha(`${anio}-12-28`).semana;
}

export function semanaVecina(s: Semana, delta: 1 | -1): Semana {
  const d = fechaUTC(rangoSemana(s).desde);
  d.setUTCDate(d.getUTCDate() + 7 * delta);
  return semanaDeFecha(aIso(d));
}

// Semana en la que se pagan los recibos de la semana N: la N+1.
export function semanaDePago(s: Semana): Semana {
  return semanaVecina(s, 1);
}

// Fecha local (Ciudad de México) "AAAA-MM-DD" de un timestamptz.
export function fechaLocal(timestamp: string | Date): string {
  // en-CA da el formato AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

export function semanaActual(ahora: Date = new Date()): Semana {
  return semanaDeFecha(fechaLocal(ahora));
}

// La semana que toca reportar hoy: la anterior, que es la que se paga ahora.
export function semanaPorReportar(ahora: Date = new Date()): Semana {
  return semanaVecina(semanaActual(ahora), -1);
}

// "SEMANA 038", como en el FORMATO MAQUILA.
export function etiquetaSemana(s: Semana): string {
  return `SEMANA ${String(s.semana).padStart(3, "0")}`;
}

// --- Armado del reporte -----------------------------------------------------

// Subcuenta contable del FORMATO MAQUILA: Acabados y Armado son madera.
export type Subcuenta = "MQ MADERA" | "MQ ELECTRICO";

export function subcuentaDe(tipo: TipoCualquierRecibo): Subcuenta {
  return tipo === "electrificacion" ? "MQ ELECTRICO" : "MQ MADERA";
}

export interface ReciboPagado {
  tipo: TipoCualquierRecibo;
  folio: string;
  contratista: string;
  ot: string;
  obra: string;
  pagadoEn: string;
  importe: number;
  // Piezas trabajadas: suma de la cantidad de los renglones del recibo.
  piezas: number;
}

export interface FilaReporte {
  tipo: TipoCualquierRecibo;
  subcuenta: Subcuenta;
  folio: string;
  ot: string;
  obra: string;
  importe: number;
  piezas: number;
  // null mientras no haya datos de IMSS para el contratista.
  seguroSocial: number | null;
  totalPagar: number;
}

export interface GrupoMaquilador {
  contratista: string;
  filas: FilaReporte[];
  importe: number;
  piezas: number;
  seguroSocial: number | null;
  totalPagar: number;
}

export interface ReporteSemanal {
  grupos: GrupoMaquilador[];
  numRecibos: number;
  importe: number;
  seguroSocial: number;
  totalPagar: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

// Clave para comparar nombres de contratista sin importar mayúsculas,
// acentos ni espacios de más.
export function claveContratista(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const ORDEN_SUBCUENTA: Record<Subcuenta, number> = { "MQ MADERA": 0, "MQ ELECTRICO": 1 };

// `seguroPorContratista`: descuento de la semana por clave de contratista
// (ver claveContratista), ya con lo acumulado de semanas sin estimación.
export function armarReporte(
  recibos: ReciboPagado[],
  seguroPorContratista: Map<string, number> = new Map()
): ReporteSemanal {
  const grupos = new Map<string, GrupoMaquilador>();
  for (const r of recibos) {
    const contratista = r.contratista.trim() || "Sin contratista";
    const clave = claveContratista(contratista);
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { contratista, filas: [], importe: 0, piezas: 0, seguroSocial: null, totalPagar: 0 };
      grupos.set(clave, grupo);
    }
    grupo.filas.push({
      tipo: r.tipo,
      subcuenta: subcuentaDe(r.tipo),
      folio: r.folio,
      ot: r.ot.trim(),
      obra: r.obra.trim(),
      importe: redondear(r.importe),
      piezas: redondear(r.piezas),
      seguroSocial: null,
      totalPagar: 0,
    });
  }

  for (const [clave, g] of grupos) {
    g.filas.sort(
      (a, b) =>
        ORDEN_SUBCUENTA[a.subcuenta] - ORDEN_SUBCUENTA[b.subcuenta] || compararFolios(a.folio, b.folio)
    );

    const seguro = seguroPorContratista.get(clave);
    if (seguro != null && seguro > 0) {
      // Del folio de mayor importe hacia abajo, sin dejar ninguno en negativo.
      let resto = redondear(seguro);
      const porImporte = [...g.filas].sort((a, b) => b.importe - a.importe);
      for (const f of porImporte) {
        if (resto <= 0) break;
        const cargo = Math.min(resto, f.importe);
        f.seguroSocial = redondear(cargo);
        resto = redondear(resto - cargo);
      }
      g.seguroSocial = redondear(seguro - resto);
    }

    for (const f of g.filas) f.totalPagar = redondear(f.importe - (f.seguroSocial ?? 0));
    g.importe = redondear(g.filas.reduce((s, f) => s + f.importe, 0));
    g.piezas = redondear(g.filas.reduce((s, f) => s + f.piezas, 0));
    g.totalPagar = redondear(g.filas.reduce((s, f) => s + f.totalPagar, 0));
  }

  const lista = [...grupos.values()].sort((a, b) =>
    a.contratista.localeCompare(b.contratista, "es")
  );

  return {
    grupos: lista,
    numRecibos: recibos.length,
    importe: redondear(lista.reduce((s, g) => s + g.importe, 0)),
    seguroSocial: redondear(lista.reduce((s, g) => s + (g.seguroSocial ?? 0), 0)),
    totalPagar: redondear(lista.reduce((s, g) => s + g.totalPagar, 0)),
  };
}

// --- Lectura ----------------------------------------------------------------

interface FilaDb {
  folio: string;
  contratista: string | null;
  ot: string | null;
  obra: string | null;
  pagado_en: string;
}

type RenglonDb = { cantidad: number; pu_aceptado: number };

const importeDe = (rs: RenglonDb[]) =>
  rs.reduce((s, x) => s + Number(x.cantidad) * Number(x.pu_aceptado), 0);

const piezasDe = (rs: RenglonDb[]) => rs.reduce((s, x) => s + Number(x.cantidad), 0);

const aRecibo = (r: FilaDb, tipo: TipoCualquierRecibo, rs: RenglonDb[]): ReciboPagado => ({
  tipo,
  folio: r.folio,
  contratista: r.contratista ?? "",
  ot: r.ot ?? "",
  obra: r.obra ?? "",
  pagadoEn: r.pagado_en,
  importe: importeDe(rs),
  piezas: piezasDe(rs),
});

// Recibos pagados entre dos fechas locales "AAAA-MM-DD" (ambas incluidas), de
// todas las áreas. RLS decide qué se ve. Se pide un día de margen por lado en
// UTC y se recorta con la fecha local. Si una lectura falla LANZA ErrorLectura:
// un reporte con totales parciales parecería real y se reparte fuera de la app.
export async function cargarRecibosPagadosEntre(
  supabase: SupabaseClient,
  desde: string,
  hasta: string
): Promise<ReciboPagado[]> {
  const margenDesde = fechaUTC(desde);
  margenDesde.setUTCDate(margenDesde.getUTCDate() - 1);
  const margenHasta = fechaUTC(hasta);
  margenHasta.setUTCDate(margenHasta.getUTCDate() + 2);
  const inicio = margenDesde.toISOString();
  const fin = margenHasta.toISOString();

  const [aa, el] = await Promise.all([
    paginarTodo<FilaDb & { tipo: TipoCualquierRecibo; renglones: RenglonDb[] }>(
      (d, h) =>
        supabase
          .from("recibos")
          .select("tipo, folio, contratista, ot, obra, pagado_en, renglones(cantidad, pu_aceptado)")
          .eq("estado", "pagado")
          .gte("pagado_en", inicio)
          .lt("pagado_en", fin)
          .order("pagado_en")
          .order("folio")
          .order("id")
          .range(d, h)
          .returns<(FilaDb & { tipo: TipoCualquierRecibo; renglones: RenglonDb[] })[]>(),
      { contexto: "los recibos pagados de Acabados y Armado" }
    ),
    paginarTodo<FilaDb & { renglones_electrificacion: RenglonDb[] }>(
      (d, h) =>
        supabase
          .from("recibos_electrificacion")
          .select(
            "folio, contratista, ot, obra, pagado_en, renglones_electrificacion(cantidad, pu_aceptado)"
          )
          .eq("estado", "pagado")
          .gte("pagado_en", inicio)
          .lt("pagado_en", fin)
          .order("pagado_en")
          .order("folio")
          .order("id")
          .range(d, h)
          .returns<(FilaDb & { renglones_electrificacion: RenglonDb[] })[]>(),
      { contexto: "los recibos pagados de Electrificación" }
    ),
  ]);

  return [
    ...aa.map((r) => aRecibo(r, r.tipo, r.renglones)),
    ...el.map((r) => aRecibo(r, "electrificacion", r.renglones_electrificacion)),
  ].filter((r) => {
    const dia = fechaLocal(r.pagadoEn);
    return dia >= desde && dia <= hasta;
  });
}

// Recibos pagados que corresponden a la semana (todas las áreas): los que se
// pagaron en la semana siguiente.
export async function cargarRecibosPagados(
  supabase: SupabaseClient,
  semana: Semana
): Promise<ReciboPagado[]> {
  const { desde, hasta } = rangoSemana(semanaDePago(semana));
  return cargarRecibosPagadosEntre(supabase, desde, hasta);
}
