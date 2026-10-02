// Motor de precio sugerido para la maquila de Acabados.
//
// Resuelve por niveles y se queda con el primero que aplique:
//   0 proyecto     — tarifa negociada para esta OT
//   1 precedente   — lo que ya se PAGÓ la última vez por ese mismo modelo (en
//                    cualquier OT), tal cual
//   2 tarifa fija  — familias que no se negocian (sin escalón de volumen)
//   3 familia      — tarifa base de la familia × escalón de volumen
//   4 manual       — no hay de dónde sacarlo; el estimador fija y justifica
//
// Los niveles 2 y 3 son el precio paramétrico: solo se proponen si el modelo
// no tiene antecedente pagado en esa área de maquila.
//
// Las fases (limpieza, lijado, sellado...) son auditoría y no entran al
// cálculo. El tipo de acabado tampoco, salvo cuando la pieza lleva dos
// acabados distintos: ahí se suma un recargo.

import {
  PRIORIDAD,
  TARIFAS_BASE,
  TARIFAS_FIJAS,
  VOLUMEN,
  type RenglonHistorico,
} from "./datos-acabados";
import { claveDescripcion, claveModelo } from "./conciliacion-pm";

export type Fuente = "proyecto" | "tarifa_fija" | "precedente" | "familia" | "manual";
export type Banda = "auto" | "estimador" | "justificar";

export const FUENTE_NOMBRE: Record<Fuente, string> = {
  proyecto: "Tarifa de proyecto",
  tarifa_fija: "Tarifa fija",
  precedente: "Precedente",
  familia: "Estimado por familia",
  manual: "Manual",
};

export interface TarifaProyecto {
  ot: string;
  modelo: string;
  tarifa: number;
}

export interface ConfiguracionMotor {
  // El nivel 3 se calcula y se guarda siempre, pero no se le muestra al
  // estimador hasta que las tarifas base estén calibradas con precios
  // aceptados (los propuestos vienen ~30% inflados).
  nivel3Visible: boolean;
  recargoAcabado2: number;
  tarifasProyecto: TarifaProyecto[];
  // Tarifas de los niveles 1 y 3. Si no se indican, se usan las de Acabados.
  // Armado las manda vacías: las tarifas de acabado no aplican al armado.
  tarifasFijas?: Record<string, number>;
  tarifasBase?: Record<string, number>;
}

export interface EntradaRenglon {
  modelo: string;
  // Descripción del padre del PM elegido (la variante del modelo); null si se
  // escribió el modelo a mano.
  descripcionPm?: string | null;
  familia: string;
  tamano: string;
  cantidad: number | "";
  acabado: string;
  acabado2: string;
  // Solo en recibos de Armado: el precedente se busca por modelo Y tipo de
  // armado (el mismo modelo cuesta distinto en Natural que en Laminado) y
  // colocación de herrajes.
  tipoArmado?: string;
  herrajes?: boolean;
}

export interface EntradaRecibo {
  ot: string;
  prioridad: string;
}

export interface Resolucion {
  pu: number | null;
  fuente: Fuente;
  detalle: string;
  sinTamano: boolean;
  sombra: boolean;
}

export function normalizar(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function factorVolumen(cantidad: number | ""): number {
  const n = Number(cantidad) || 0;
  for (const r of VOLUMEN) {
    if (n >= r.min && (r.max === null || n <= r.max)) return r.valor;
  }
  return 1;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
export function money(n: number | null | undefined): string {
  return n == null ? "—" : fmt.format(n);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fechaCorta(iso: string): string {
  const p = String(iso).split("-");
  return `${Number(p[2])} ${MESES[Number(p[1]) - 1]} ${p[0]}`;
}

// El precedente es el más reciente por fecha de recibo entre los renglones ya
// PAGADOS (recibo en estado "pagado"; el histórico base de Excel ya está
// pagado) con precio aceptado: es el precio que el maquilador va a repetir, no
// el promedio histórico. Se busca en cualquier OT. El modelo se compara con
// claveModelo ("MS-01" = "ms 01"). Si el renglón trae variante (descripción del
// PM), solo sirven los antecedentes de esa misma variante o, si no hay, los que
// no guardaron variante (recibos anteriores): nunca el de otra variante del
// mismo código ("MUEBLE · cama king" no es precedente de "MUEBLE · maceta").
// En el histórico de Armado, la colocación de herrajes viaja como "Sí" / "No"
// en el campo `acabado2` (y el tipo de armado en `acabado`).
export const HERRAJES_SI = "Sí";
export const HERRAJES_NO = "No";

export function esPagado(h: { aceptado: number; estado?: string }): boolean {
  return h.aceptado > 0 && (h.estado === undefined || h.estado === "pagado");
}

export function masReciente<T extends { fecha: string }>(filas: T[]): T | null {
  if (!filas.length) return null;
  return [...filas].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))[0];
}

// Entre antecedentes del mismo código: los de la misma variante y, si no hay,
// los que no guardaron variante.
export function deLaVariante<T extends { descripcionPm?: string | null }>(
  filas: T[],
  descripcionPm: string | null | undefined
): T[] {
  if (descripcionPm == null) return filas;
  const d = claveDescripcion(descripcionPm);
  const misma = filas.filter((h) => h.descripcionPm != null && claveDescripcion(h.descripcionPm) === d);
  return misma.length ? misma : filas.filter((h) => h.descripcionPm == null);
}

export function precedenteDe(
  modelo: string,
  historico: RenglonHistorico[],
  tipoArmado?: string,
  herrajes?: boolean,
  descripcionPm?: string | null
): RenglonHistorico | null {
  const m = claveModelo(modelo);
  if (!m) return null;
  const t = tipoArmado ? normalizar(tipoArmado) : null;
  const hz = herrajes === undefined ? null : normalizar(herrajes ? HERRAJES_SI : HERRAJES_NO);
  const prev = historico.filter(
    (h) =>
      claveModelo(h.modelo) === m &&
      esPagado(h) &&
      (t === null || normalizar(h.acabado) === t) &&
      (hz === null || normalizar(h.acabado2) === hz)
  );
  return masReciente(deLaVariante(prev, descripcionPm));
}

export function resolver(
  r: EntradaRenglon,
  recibo: EntradaRecibo,
  cfg: ConfiguracionMotor,
  historico: RenglonHistorico[]
): Resolucion {
  const out: Resolucion = { pu: null, fuente: "manual", detalle: "", sinTamano: false, sombra: false };
  const modeloN = normalizar(r.modelo);
  const tarifasFijas = cfg.tarifasFijas ?? TARIFAS_FIJAS;
  const tarifasBase = cfg.tarifasBase ?? TARIFAS_BASE;

  const tp = cfg.tarifasProyecto.find(
    (t) => t.ot === normalizar(recibo.ot) && t.modelo === modeloN
  );

  const p = tp ? null : precedenteDe(r.modelo, historico, r.tipoArmado, r.herrajes, r.descripcionPm);

  if (tp) {
    out.pu = tp.tarifa;
    out.fuente = "proyecto";
    out.detalle = `Tarifa de proyecto para la OT ${recibo.ot}`;
  } else if (p) {
    // El precio ya pagado, sin ajustes: es lo que el maquilador va a repetir.
    out.pu = p.aceptado;
    out.fuente = "precedente";
    out.detalle =
      `Pagado antes: ${money(p.aceptado)} · ${p.cantidad} pz · ${fechaCorta(p.fecha)}` +
      (p.folio ? ` · folio ${p.folio}` : "") +
      (p.ot ? ` · OT ${p.ot}` : "");
    return out;
  } else if (tarifasFijas[r.familia] != null) {
    out.pu = tarifasFijas[r.familia];
    out.fuente = "tarifa_fija";
    out.detalle = `${r.familia} · sin negociación`;
  } else if (tarifasBase[r.familia] != null) {
    out.pu = r2(tarifasBase[r.familia] * factorVolumen(r.cantidad));
    out.fuente = "familia";
    out.sinTamano = !r.tamano;
    out.detalle =
      `Base ${money(tarifasBase[r.familia])} × ${factorVolumen(r.cantidad).toFixed(2)}` +
      (out.sinTamano ? " · sin tamaño" : "");
  }

  if (out.pu != null) {
    const fp = PRIORIDAD[recibo.prioridad] ?? 1;
    if (fp !== 1) {
      out.pu = r2(out.pu * fp);
      out.detalle += ` · prioridad ×${fp.toFixed(2)}`;
    }
    if (r.acabado2 && r.acabado2 !== r.acabado && cfg.recargoAcabado2 > 0) {
      out.pu = r2(out.pu + cfg.recargoAcabado2);
      out.detalle += ` · +${money(cfg.recargoAcabado2)} 2º acabado`;
    }
  }

  if (out.fuente === "familia" && !cfg.nivel3Visible) {
    out.sombra = true;
  }
  return out;
}

export interface Veredicto {
  banda: Banda;
  dif: number | null;
}

// Bandas de autorización: hasta 10% el precio se acepta solo, hasta 25% lo
// decide el estimador, más allá exige justificación escrita.
export function bandaDe(
  sugerido: number | null,
  propuesto: number,
  esManual: boolean
): Veredicto {
  if (esManual || sugerido == null || !(sugerido > 0)) return { banda: "justificar", dif: null };
  const dif = (propuesto - sugerido) / sugerido;
  const a = Math.abs(dif);
  return { banda: a <= 0.1 ? "auto" : a <= 0.25 ? "estimador" : "justificar", dif };
}

export const BANDA_NOMBRE: Record<Banda, string> = {
  auto: "Automático",
  estimador: "Tú decides",
  justificar: "Justificar",
};
