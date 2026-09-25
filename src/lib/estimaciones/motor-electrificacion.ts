// Motor de precio sugerido para la maquila de Electrificación.
//
// Un renglón es: modelo + cantidad de piezas + metros de LED por pieza (con
// complejidad de colocación) + kit de charolas por pieza (cada charola con
// su número de drivers). El sugerido es POR PIEZA y paramétrico:
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
import { factorVolumen, money } from "./motor-precio";

export type ComplejidadLed = "facil" | "medio" | "dificil";
export type CategoriaCharola = "sencilla" | "intermedia" | "compleja";
export type FuenteElectrificacion = "parametrico" | "manual";

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

export function resolverElectrificacion(
  r: EntradaRenglonElectrificacion,
  prioridad: string,
  tarifas: TarifasElectrificacion
): ResolucionElectrificacion {
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
