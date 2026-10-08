import { claveArchivoOrigen } from "./numero-pm";

// Qué hojas con formato de PM de un archivo se cargan y con qué clave se
// reconoce el PM de cada una (pedidos.archivo_origen).

interface HojaDelLibro {
  nombreHoja: string;
  oculta: boolean;
}

/**
 * Hojas a cargar: las visibles (en su orden) y, solo si la persona lo eligió,
 * después las ocultas. La primera es la que usa el nombre del archivo para el
 * título. `omitidas`: las ocultas que no se suben.
 */
export function hojasParaCargar<H extends HojaDelLibro>(
  hojas: H[],
  incluirOcultas: boolean
): { cargar: H[]; omitidas: string[] } {
  const ocultas = hojas.filter((h) => h.oculta);
  return {
    cargar: [...hojas.filter((h) => !h.oculta), ...(incluirOcultas ? ocultas : [])],
    omitidas: incluirOcultas ? [] : ocultas.map((h) => h.nombreHoja),
  };
}

/**
 * Clave del PM de cada hoja. Con una sola hoja visible de PM basta el nombre
 * del archivo; con varias, cada una lleva además su nombre, así que agregar,
 * quitar o mover hojas no hace que una tome el PM de otra. Las ocultas
 * siempre llevan su nombre: subirlas o no, no cambia la clave de las
 * visibles.
 */
export function claveDeHoja(nombreArchivo: string, hojas: HojaDelLibro[], hoja: HojaDelLibro): string {
  const variasVisibles = hojas.filter((h) => !h.oculta).length > 1;
  return claveArchivoOrigen(nombreArchivo, hoja.oculta || variasVisibles ? hoja.nombreHoja : undefined);
}
