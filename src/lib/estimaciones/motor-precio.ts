// Motor de precio sugerido para la maquila de Acabados.
//
// Resuelve por niveles y se queda con el primero que aplique:
//   0 proyecto     — tarifa negociada para esta OT
//   1 tarifa fija  — familias que no se negocian (sin escalón de volumen)
//   2 precedente   — lo que se aceptó la última vez para ese mismo modelo
//   3 familia      — tarifa base de la familia × escalón de volumen
//   4 manual       — no hay de dónde sacarlo; el estimador fija y justifica
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

// El precedente es el más reciente por fecha de recibo: es el precio que el
// maquilador va a repetir, no el promedio histórico. `historico` incluye el
// histórico real más los recibos que se hayan guardado en esta sesión, para
// que un recibo recién guardado ya sirva de precedente al siguiente.
// En el histórico de Armado, la colocación de herrajes viaja como "Sí" / "No"
// en el campo `acabado2` (y el tipo de armado en `acabado`).
export const HERRAJES_SI = "Sí";
export const HERRAJES_NO = "No";

export function precedenteDe(
  modelo: string,
  historico: RenglonHistorico[],
  tipoArmado?: string,
  herrajes?: boolean
): RenglonHistorico | null {
  const m = normalizar(modelo);
  const t = tipoArmado ? normalizar(tipoArmado) : null;
  const hz = herrajes === undefined ? null : normalizar(herrajes ? HERRAJES_SI : HERRAJES_NO);
  const prev = historico.filter(
    (h) =>
      normalizar(h.modelo) === m &&
      h.aceptado > 0 &&
      (t === null || normalizar(h.acabado) === t) &&
      (hz === null || normalizar(h.acabado2) === hz)
  );
  if (!prev.length) return null;
  prev.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return prev[0];
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

  if (tp) {
    out.pu = tp.tarifa;
    out.fuente = "proyecto";
    out.detalle = `Tarifa de proyecto para la OT ${recibo.ot}`;
  } else if (tarifasFijas[r.familia] != null) {
    out.pu = tarifasFijas[r.familia];
    out.fuente = "tarifa_fija";
    out.detalle = `${r.familia} · sin negociación`;
  } else {
    const p = modeloN ? precedenteDe(modeloN, historico, r.tipoArmado, r.herrajes) : null;
    if (p) {
      out.pu = r2((p.aceptado * factorVolumen(r.cantidad)) / factorVolumen(p.cantidad));
      out.fuente = "precedente";
      out.detalle = `Última vez: ${money(p.aceptado)} · ${p.cantidad} pz · ${fechaCorta(p.fecha)}`;
    } else if (tarifasBase[r.familia] != null) {
      out.pu = r2(tarifasBase[r.familia] * factorVolumen(r.cantidad));
      out.fuente = "familia";
      out.sinTamano = !r.tamano;
      out.detalle =
        `Base ${money(tarifasBase[r.familia])} × ${factorVolumen(r.cantidad).toFixed(2)}` +
        (out.sinTamano ? " · sin tamaño" : "");
    }
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
