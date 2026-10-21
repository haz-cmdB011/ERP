// Lectura de las partes vigentes del despiece de varios muebles (migración
// despiece_por_partes; ver flujo-mueble.ts). Lanza ErrorLectura si la consulta falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorLectura } from "@/lib/supabase/paginar";
import type { ParteMueble } from "./flujo-mueble";

// La tabla todavía no existe (la migración no se ha aplicado): Postgres responde 42P01
// y PostgREST, PGRST205. Entonces ningún mueble tiene partes.
function tablaNoExiste(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

// Por id de mueble, sus partes en el orden del despiece. Un mueble sin despiece guardado
// queda con una lista vacía.
export async function cargarPartes(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<Map<string, ParteMueble[]>> {
  const mapa = new Map<string, ParteMueble[]>(itemIds.map((id) => [id, []]));
  if (itemIds.length === 0) return mapa;
  // .in() con muchos ids rompe el largo de la dirección: de 100 en 100.
  for (let i = 0; i < itemIds.length; i += 100) {
    const { data, error } = await supabase
      .from("partes_despiece")
      .select("id, planeacion_item_id, descripcion, piezas_por_mueble, unidad")
      .in("planeacion_item_id", itemIds.slice(i, i + 100))
      .is("retirada_en", null)
      .order("orden")
      .returns<
        { id: string; planeacion_item_id: string; descripcion: string; piezas_por_mueble: number | string; unidad: string | null }[]
      >();
    if (error) {
      if (tablaNoExiste(error)) return mapa;
      throw new ErrorLectura(`No se pudo leer las partes del despiece: ${error.message}`);
    }
    for (const p of data ?? []) {
      mapa.get(p.planeacion_item_id)?.push({
        id: p.id,
        descripcion: p.descripcion,
        piezasPorMueble: Number(p.piezas_por_mueble),
        unidad: p.unidad,
      });
    }
  }
  return mapa;
}
