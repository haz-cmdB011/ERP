import { ErrorLectura } from "./paginar";

// Lee una consulta de Supabase y, si falla, lanza ErrorLectura en vez de entregar `null`.
//
// Por qué: `const { data } = await supabase...` ignora el error. Si la base falla, la pantalla se ve
// como si no hubiera datos ("sin pedidos", "sin ítems") o, en una consulta de un solo registro,
// como "página no encontrada". Con esto la pantalla cae en su error.tsx ("No se pudieron cargar los
// datos… Reintentar") y el fallo llega a los avisos del servidor (src/instrumentation.ts).
//
//   const pedidos = await leer(supabase.from("pedidos").select("…").returns<Fila[]>(), "pedidos");
//
// `data: null` SIN error es un resultado válido (un maybeSingle que no encontró nada) y se devuelve
// tal cual.
type Respuesta<T> = { data: T; error: { message: string } | null };

export async function leer<T>(consulta: PromiseLike<Respuesta<T>>, contexto: string): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw new ErrorLectura(`No se pudo leer ${contexto}: ${error.message}`);
  return data;
}
