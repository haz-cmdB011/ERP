// Consultas con una lista larga de valores (`.in("columna", ids)`).
//
// Supabase manda esa lista en la dirección de la petición, y la dirección tiene
// un tope de tamaño: con unos cientos de ids (un PM grande) la consulta falla.
// Aquí se parte la lista en lotes cortos, se piden pocos a la vez y se juntan
// las filas; si algún lote falla, se lanza el error en vez de devolver una
// lista incompleta que parezca completa.

import { ErrorLectura } from "./paginar";

type Respuesta<R> = { data: R[] | null; error: { message: string } | null };

// Valores por consulta: 100 ids de 36 caracteres son unos 4 KB de dirección.
export const LOTE_POR_DEFECTO = 100;
const SIMULTANEAS_POR_DEFECTO = 5;

export function partir<T>(lista: readonly T[], tamano: number): T[][] {
  if (tamano < 1) throw new Error("El tamaño del lote debe ser al menos 1.");
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

// Ejecuta `pedir` por cada lote de `valores` (a lo más `simultaneas` a la vez) y
// devuelve todas las filas, en el orden de los lotes. `pedir` no debe traer más
// de 1000 filas por lote (el tope de Supabase por respuesta).
export async function leerPorLotes<T, R>(
  valores: readonly T[],
  pedir: (lote: T[]) => PromiseLike<Respuesta<R>>,
  opciones: { lote?: number; simultaneas?: number; contexto?: string } = {}
): Promise<R[]> {
  const { lote = LOTE_POR_DEFECTO, simultaneas = SIMULTANEAS_POR_DEFECTO, contexto = "los datos" } = opciones;
  const lotes = partir(valores, lote);
  const resultados: R[][] = new Array(lotes.length);
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(Math.max(1, simultaneas), lotes.length) }, async () => {
    while (siguiente < lotes.length) {
      const i = siguiente++;
      const { data, error } = await pedir(lotes[i]);
      if (error) throw new ErrorLectura(`No se pudo leer ${contexto}: ${error.message}`);
      resultados[i] = data ?? [];
    }
  });
  await Promise.all(trabajadores);
  return resultados.flat();
}
