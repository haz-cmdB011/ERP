// Reglas para relacionar el modelo de un ítem del PM con la carpeta de ese
// modelo en el servidor de Ingeniería (I:\O. T´s. <AÑO>\<PM>\INGENIERIA\
// <MODELO>\PLANOS). Las usan tanto el script de sincronización de planos
// como la app, para que ambos lados coincidan exactamente.

// Los modelos se escriben distinto según quién los capture: "P-19-01" en la
// carpeta, "P-19/01" en la cédula, "p 19 01" en el Excel... Se comparan en
// una forma canónica: mayúsculas, sin acentos, separadores unificados a "-".
export function normalizarModelo(modelo: string): string {
  return modelo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[\s/_.\\]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Ingeniería a veces agrega texto al nombre de la carpeta del modelo:
// "PSTA05 (100) SANITARIOS MUJERES", "PSTA08 (110) CANCELADA". La carpeta
// corresponde al modelo si su nombre normalizado es el modelo, o —solo
// cuando se permite texto extra— si empieza con él seguido de PALABRAS, no
// de un número: "FXSV-22-1" es otra variante, no una carpeta más de
// "FXSV-22".
export function carpetaEsDelModelo(
  carpetaNormalizada: string,
  modeloNormalizado: string,
  permitirTextoExtra: boolean
): boolean {
  if (!modeloNormalizado) return false;
  if (carpetaNormalizada === modeloNormalizado) return true;
  if (!permitirTextoExtra) return false;
  const prefijo = `${modeloNormalizado}-`;
  return (
    carpetaNormalizada.startsWith(prefijo) &&
    /^[A-Z]/.test(carpetaNormalizada.slice(prefijo.length))
  );
}

export function carpetaCancelada(nombreCarpeta: string): boolean {
  return /CANCELAD/i.test(nombreCarpeta);
}

export interface PlanoCandidato {
  pm: string | null;
  anio: number;
  modelo_normalizado: string;
}

/**
 * Elige los planos de un modelo: primero los de la carpeta de su mismo PM
 * (aceptando texto extra en el nombre de la carpeta); si no hay, los de
 * coincidencia exacta en otro PM, del año más reciente (modelo reutilizado).
 * En otros PM no se acepta texto extra: nombres genéricos como "MUESTRA"
 * darían falsos positivos ("MUESTRA SECCION" de otro proyecto).
 */
export function elegirPlanos<T extends PlanoCandidato>(
  modelo: string,
  pm: string,
  planos: T[]
): { planos: T[]; deOtroPm: boolean } {
  const clave = normalizarModelo(modelo);
  const delMismoPm = planos.filter(
    (p) => p.pm === pm && carpetaEsDelModelo(p.modelo_normalizado, clave, true)
  );
  if (delMismoPm.length > 0) return { planos: delMismoPm, deOtroPm: false };

  const exactos = planos.filter((p) => p.pm !== pm && p.modelo_normalizado === clave);
  if (exactos.length === 0) return { planos: [], deOtroPm: false };
  const anioReciente = Math.max(...exactos.map((p) => p.anio));
  return { planos: exactos.filter((p) => p.anio === anioReciente), deOtroPm: true };
}

// Un modelo de algún PM de la app, para buscar su PDF en cualquier carpeta
// del servidor (no solo dentro de O. T´s./PM/INGENIERIA/MODELO/PLANOS).
export interface ModeloDePm {
  pm: string;
  // Año del PM ("PM107-26" → 2026): desempata cuando un nombre coincide con
  // modelos de varios PM.
  anio: number;
  modelo: string;
}

// Índice por nombre normalizado del modelo. Un mismo PM no aparece dos veces
// para la misma clave (padre e hijos suelen traer el mismo modelo).
export function indexarModelosDePm(modelos: ModeloDePm[]): Map<string, ModeloDePm[]> {
  const indice = new Map<string, ModeloDePm[]>();
  for (const m of modelos) {
    const clave = normalizarModelo(m.modelo);
    if (!clave) continue;
    const lista = indice.get(clave) ?? [];
    if (!lista.some((x) => x.pm === m.pm)) lista.push(m);
    indice.set(clave, lista);
  }
  return indice;
}

export interface PlanoAsignado {
  // "en_su_pm": el archivo está en la carpeta de un PM que tiene ese modelo.
  // "unico": ningún PM lo reclama por carpeta y solo un PM tiene ese modelo.
  tipo: "en_su_pm" | "unico";
  pm: string;
  anio: number;
  modelo: string;
}

export type AsignacionPorNombre = PlanoAsignado | { tipo: "ambiguo"; pms: string[] };

/**
 * PM al que va un PDF fuera de la carpeta de OT, por su nombre sin .pdf
 * ("FX-35.pdf" → modelo FX-35), con la forma normalizada, sin texto extra:
 * - Si está dentro de la carpeta de un PM de la app que tiene ese modelo, es
 *   de ese PM.
 * - Si no, y solo un PM de la app tiene ese modelo, es de ese PM.
 * - Si varios PM tienen ese modelo y el archivo no está en uno de ellos, es
 *   ambiguo: no se asigna a nadie.
 * `pmDeCarpeta` es el PM de la carpeta de proyecto donde está el archivo
 * (null si no hay). Devuelve null si ningún modelo se llama así.
 */
export function asignarPlanoPorNombre(
  nombreArchivo: string,
  pmDeCarpeta: string | null,
  indice: Map<string, ModeloDePm[]>
): AsignacionPorNombre | null {
  const base = nombreArchivo.replace(/\.pdf$/i, "");
  const candidatos = indice.get(normalizarModelo(base));
  if (!candidatos || candidatos.length === 0) return null;

  const delPmDeCarpeta = pmDeCarpeta ? candidatos.find((c) => c.pm === pmDeCarpeta) : undefined;
  if (delPmDeCarpeta) return { tipo: "en_su_pm", ...delPmDeCarpeta };
  if (candidatos.length === 1) return { tipo: "unico", ...candidatos[0] };
  return { tipo: "ambiguo", pms: candidatos.map((c) => c.pm) };
}
