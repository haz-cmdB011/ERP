// Motor de precio sugerido para la maquila de Electrificación.
//
// Un renglón es: modelo + cantidad de piezas + metros de LED por pieza (con
// complejidad de colocación) + kit de charolas por pieza (cada charola con
// su número de drivers). El sugerido es POR PIEZA.
//
// Si el modelo ya se PAGÓ antes en Electrificación (en cualquier OT), el
// sugerido es ese precio, tal cual (fuente "precedente"). Solo sin antecedente
// pagado se calcula el paramétrico:
//
//   metros LED × tarifa por metro de su complejidad
//   + Σ tarifa de cada charola según su categoría
//   × factor de prioridad del recibo
//   × escalón de volumen (solo si aplicarVolumen está prendido)
//
// El importe del renglón es cantidad × precio aceptado por pieza.
//
// El escalón de volumen de Acabados arranca APAGADO para Electrificación:
// sus factores se calibraron con piezas de acabados, y la regla está sujeta
// a cambios, así que se deja como interruptor en "Parámetros del motor".
//
// Las tarifas de arranque están SIN CALIBRAR (mismo valor que el seed de
// tarifas_electrificacion en la migración); se ajustan desde "Parámetros
// del motor" hasta que haya recibos aceptados con los que calibrarlas.

import { PRIORIDAD } from "./datos-acabados";
import { claveModelo } from "./conciliacion-pm";
import { deLaVariante, factorVolumen, fechaCorta, masReciente, money } from "./motor-precio";

export type ComplejidadLed = "facil" | "medio" | "dificil";
export type CategoriaCharola = "sencilla" | "intermedia" | "compleja";
export type FuenteElectrificacion = "parametrico" | "precedente" | "manual";

export const COMPLEJIDAD_NOMBRE: Record<ComplejidadLed, string> = {
  facil: "Fácil",
  medio: "Medio",
  dificil: "Difícil",
};

export const CATEGORIA_NOMBRE: Record<CategoriaCharola, string> = {
  sencilla: "Sencilla",
  intermedia: "Intermedia",
  compleja: "Compleja",
};

export const CATEGORIA_RANGO: Record<CategoriaCharola, string> = {
  sencilla: "1 a 3 drivers",
  intermedia: "4 a 6 drivers",
  compleja: "más de 6 drivers",
};

export const FUENTE_ELECTRIFICACION_NOMBRE: Record<FuenteElectrificacion, string> = {
  parametrico: "Tarifa paramétrica",
  precedente: "Precedente",
  manual: "Manual",
};

export interface TarifasElectrificacion {
  metroLed: Record<ComplejidadLed, number>;
  charola: Record<CategoriaCharola, number>;
  aplicarVolumen: boolean;
}

export const TARIFAS_ELECTRIFICACION_INICIALES: TarifasElectrificacion = {
  metroLed: { facil: 25, medio: 40, dificil: 60 },
  charola: { sencilla: 150, intermedia: 250, compleja: 400 },
  aplicarVolumen: false,
};

// Espejo de est_categoria_charola_de() en la base.
export function categoriaCharola(drivers: number): CategoriaCharola {
  if (drivers <= 3) return "sencilla";
  if (drivers <= 6) return "intermedia";
  return "compleja";
}

export interface EntradaRenglonElectrificacion {
  // Para buscar el precedente; sin modelo no hay precedente.
  modelo?: string;
  // Variante del modelo (descripción del padre del PM).
  descripcionPm?: string | null;
  cantidad: number | "";
  metrosLed: number | "";
  complejidadLed: ComplejidadLed | "";
  charolas: { drivers: number | "" }[];
}

export interface ResolucionElectrificacion {
  pu: number | null;
  fuente: FuenteElectrificacion;
  detalle: string;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Un renglón ya pagado de Electrificación (ver
// cargarPreciosPagadosElectrificacion en recibos-electrificacion-db.ts).
export interface PrecedenteElectrificacion {
  modelo: string;
  descripcionPm?: string | null;
  cantidad: number;
  aceptado: number;
  fecha: string;
  folio: string;
  ot: string;
}

// El último precio pagado del mismo modelo (y de la misma variante, si el
// renglón la trae; mismas reglas que precedenteDe en motor-precio.ts).
// `pagados` ya viene filtrado: solo recibos pagados con precio aceptado.
export function precedenteElectrificacion(
  modelo: string | undefined,
  descripcionPm: string | null | undefined,
  pagados: PrecedenteElectrificacion[]
): PrecedenteElectrificacion | null {
  const m = claveModelo(modelo);
  if (!m) return null;
  const prev = pagados.filter((h) => claveModelo(h.modelo) === m && h.aceptado > 0);
  return masReciente(deLaVariante(prev, descripcionPm));
}

export function resolverElectrificacion(
  r: EntradaRenglonElectrificacion,
  prioridad: string,
  tarifas: TarifasElectrificacion,
  pagados: PrecedenteElectrificacion[] = []
): ResolucionElectrificacion {
  const p = precedenteElectrificacion(r.modelo, r.descripcionPm, pagados);
  if (p) {
    return {
      pu: p.aceptado,
      fuente: "precedente",
      detalle:
        `Pagado antes: ${money(p.aceptado)} por pieza · ${p.cantidad} pz · ${fechaCorta(p.fecha)}` +
        (p.folio ? ` · folio ${p.folio}` : "") +
        (p.ot ? ` · OT ${p.ot}` : ""),
    };
  }

  const metros = Number(r.metrosLed) || 0;
  const charolas = r.charolas.map((c) => Number(c.drivers) || 0).filter((d) => d > 0);
  const partes: string[] = [];
  let total = 0;

  if (metros > 0) {
    if (!r.complejidadLed) {
      return { pu: null, fuente: "manual", detalle: "Falta la complejidad de colocación del LED." };
    }
    const t = tarifas.metroLed[r.complejidadLed];
    total += metros * t;
    partes.push(`${metros} m LED ${COMPLEJIDAD_NOMBRE[r.complejidadLed].toLowerCase()} × ${money(t)}`);
  }

  if (charolas.length) {
    const conteo: Record<CategoriaCharola, number> = { sencilla: 0, intermedia: 0, compleja: 0 };
    for (const d of charolas) conteo[categoriaCharola(d)] += 1;
    for (const cat of Object.keys(conteo) as CategoriaCharola[]) {
      if (!conteo[cat]) continue;
      total += conteo[cat] * tarifas.charola[cat];
      partes.push(`${conteo[cat]} charola${conteo[cat] > 1 ? "s" : ""} ${CATEGORIA_NOMBRE[cat].toLowerCase()} × ${money(tarifas.charola[cat])}`);
    }
  }

  if (!partes.length) {
    return { pu: null, fuente: "manual", detalle: "Sin metros de LED ni charolas." };
  }

  const fp = PRIORIDAD[prioridad] ?? 1;
  if (fp !== 1) {
    total *= fp;
    partes.push(`prioridad ×${fp.toFixed(2)}`);
  }

  if (tarifas.aplicarVolumen) {
    const fv = factorVolumen(r.cantidad);
    if (fv !== 1) {
      total *= fv;
      partes.push(`volumen ×${fv.toFixed(2)}`);
    }
  }

  return { pu: r2(total), fuente: "parametrico", detalle: `Por pieza: ${partes.join(" · ")}` };
}
