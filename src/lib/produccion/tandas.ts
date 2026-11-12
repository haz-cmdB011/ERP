// .in() con muchos ids rompe el largo de la dirección de la consulta: se pide por tandas.
export function tandas<T>(lista: T[], tamano = 50): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

// Cuántas tandas se piden a la vez. Con miles de muebles hay cientos de tandas: pedirlas todas al mismo tiempo
// (Promise.all) manda cientos de peticiones juntas a la base y, con RLS, tarda más y puede rechazarlas.
export const TANDAS_SIMULTANEAS = 6;

// Ejecuta `tarea` por cada elemento (a lo más `simultaneas` a la vez) y devuelve los resultados en el mismo
// orden que la lista, como Promise.all(lista.map(tarea)) pero sin saturar la base. Si una tarea falla, falla
// todo (igual que Promise.all) y no se lanzan más.
export async function enParalelo<T, R>(
  lista: readonly T[],
  tarea: (elemento: T, posicion: number) => Promise<R>,
  simultaneas = TANDAS_SIMULTANEAS
): Promise<R[]> {
  const resultados: R[] = new Array(lista.length);
  let siguiente = 0;
  let fallo = false;
  const trabajadores = Array.from({ length: Math.min(Math.max(1, simultaneas), lista.length) }, async () => {
    while (!fallo && siguiente < lista.length) {
      const i = siguiente++;
      try {
        resultados[i] = await tarea(lista[i], i);
      } catch (e) {
        fallo = true;
        throw e;
      }
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}
