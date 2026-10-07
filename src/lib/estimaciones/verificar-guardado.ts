// Guardar un recibo NUEVO no es idempotente: si el folio ya existe, la base
// agrega los renglones a ese mismo recibo (así se "continúa un folio"). Si se
// cae la red justo después de que la base guardó, el reintento duplicaría los
// renglones. Por eso, ante un error de red se vuelve a contar los renglones del
// folio: si subieron lo enviado, el guardado sí ocurrió y no se reintenta.

import type { SupabaseClient } from "@supabase/supabase-js";

// Errores que indican que no se supo qué pasó con la petición (a diferencia de
// un rechazo de la base, que sí dice por qué).
export function esErrorDeRed(mensaje: string | null | undefined): boolean {
  if (!mensaje) return false;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|timed out|the network connection was lost/i.test(
    mensaje
  );
}

// El guardado ocurrió si el folio ganó exactamente los renglones que se enviaron.
export function seGuardo(antes: number, despues: number, enviados: number): boolean {
  return enviados > 0 && despues - antes === enviados;
}

export const MENSAJE_SIN_CONFIRMAR =
  "Se perdió la conexión y no pudimos confirmar si el recibo quedó guardado. No lo captures de nuevo: " +
  "revisa el folio en el Registro (o en Mis recibos); tu captura se conserva como borrador.";

type TablaRecibo = "recibos" | "recibos_electrificacion";

// Renglones que tiene hoy el folio (0 si aún no existe). Los recibos cancelados
// no cuentan: ya no ocupan su folio. null si no se pudo leer.
export async function contarRenglonesDelFolio(
  supabase: SupabaseClient,
  tabla: TablaRecibo,
  tipo: string,
  folio: string
): Promise<number | null> {
  const relacion = tabla === "recibos" ? "renglones" : "renglones_electrificacion";
  let consulta = supabase
    .from(tabla)
    .select(`id, ${relacion}(count)`)
    .eq("folio", folio)
    .neq("estado", "cancelado");
  if (tabla === "recibos") consulta = consulta.eq("tipo", tipo);
  const { data, error } = await consulta.returns<Record<string, unknown>[]>();
  if (error || !data) return null;
  return data.reduce((suma, fila) => {
    const cuenta = (fila[relacion] as { count: number }[] | undefined)?.[0]?.count ?? 0;
    return suma + cuenta;
  }, 0);
}

// Guarda con la verificación de arriba. `guardar` hace el guardado real;
// `enviados` es cuántos renglones manda. Devuelve el error final (null = guardado).
export async function guardarVerificando(
  supabase: SupabaseClient,
  destino: { tabla: TablaRecibo; tipo: string; folio: string },
  enviados: number,
  guardar: () => Promise<{ error: string | null }>
): Promise<{ error: string | null }> {
  const antes = await contarRenglonesDelFolio(supabase, destino.tabla, destino.tipo, destino.folio);
  const { error } = await guardar();
  if (!error || !esErrorDeRed(error)) return { error };
  const despues = await contarRenglonesDelFolio(supabase, destino.tabla, destino.tipo, destino.folio);
  if (antes !== null && despues !== null && seGuardo(antes, despues, enviados)) return { error: null };
  return { error: MENSAJE_SIN_CONFIRMAR };
}
