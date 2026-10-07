// La API de Supabase corta cada respuesta en 1000 filas SIN avisar (ni con
// `.limit(3000)`): una lista que supere ese tope se vería completa pero le
// faltarían los registros más recientes. `paginarTodo` pide página tras página
// hasta traer todo y, si algo falla, lanza el error en vez de devolver una
// lista parcial o vacía que se confunda con "no hay datos".

export const TAMANO_PAGINA = 1000;

export class ErrorLectura extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorLectura";
  }
}

type RespuestaPagina<T> = { data: T[] | null; error: { message: string } | null };

// `pedir(desde, hasta)` debe ejecutar la consulta con `.range(desde, hasta)` y
// un orden ESTABLE (termina con un desempate por `id`); si no, filas con el
// mismo valor pueden repetirse u omitirse entre páginas.
export async function paginarTodo<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<RespuestaPagina<T>>,
  opciones: { maxFilas?: number; contexto?: string } = {}
): Promise<T[]> {
  const { maxFilas = Infinity, contexto = "los datos" } = opciones;
  const filas: T[] = [];
  for (let desde = 0; filas.length < maxFilas; desde += TAMANO_PAGINA) {
    const { data, error } = await pedir(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new ErrorLectura(`No se pudo leer ${contexto}: ${error.message}`);
    const pagina = data ?? [];
    filas.push(...pagina);
    if (pagina.length < TAMANO_PAGINA) break;
  }
  return filas.length > maxFilas ? filas.slice(0, maxFilas) : filas;
}
