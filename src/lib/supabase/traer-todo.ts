// PostgREST corta cada respuesta en 1000 filas (max-rows de Supabase). Para
// conteos que deben ser exactos (p. ej. todos los ítems de una O.T.) se pide
// por páginas hasta que una venga incompleta.
const TAMANO_PAGINA = 1000;

export async function traerTodo<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: string | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAMANO_PAGINA - 1);
    if (error) return { data: filas, error: error.message };
    filas.push(...(data ?? []));
    if (!data || data.length < TAMANO_PAGINA) return { data: filas, error: null };
  }
}
