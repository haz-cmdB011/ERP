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
