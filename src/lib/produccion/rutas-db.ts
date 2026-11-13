// Lectura de las rutas guardadas de varios muebles: la del mueble completo y la de cada
// parte de su despiece (ver ruta.ts y las migraciones ruta_produccion y rutas_por_parte).
// Lanza ErrorLectura si una consulta falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { ErrorLectura, paginarTodo } from "@/lib/supabase/paginar";
import { esProceso } from "./asignaciones";
import type { PasoRuta } from "./ruta";
import { MUEBLES_POR_TANDA, enParalelo, tandas } from "./tandas";

export interface RutaGuardada {
  version: number;
  // Se asigna por partes (migración asignar_por_partes): false = el mueble completo, lo normal.
  porPartes?: boolean;
  // Pasos del mueble completo.
  pasos: PasoRuta[];
  // Pasos de cada parte, por id de parte (solo las que tienen pasos guardados).
  partes: Map<string, PasoRuta[]>;
}

interface FilaRuta {
  planeacion_item_id: string;
  version: number;
  por_partes?: boolean;
}

// Las rutas de un lote de muebles. Si la columna por_partes aún no existe en esa base (la
// migración asignar_por_partes sin aplicar), se leen sin ella: todos van por mueble completo.
async function leerRutas(supabase: SupabaseClient, lote: string[]): Promise<FilaRuta[] | null> {
  const { data, error } = await supabase
    .from("rutas_produccion")
    .select("planeacion_item_id, version, por_partes")
    .in("planeacion_item_id", lote)
    .returns<FilaRuta[]>();
  if (!error) return data;
  if (error.code !== "42703" && !/por_partes/.test(error.message)) {
    throw new ErrorLectura(`No se pudo leer las rutas de los muebles: ${error.message}`);
  }
  return leer(
    supabase
      .from("rutas_produccion")
      .select("planeacion_item_id, version")
      .in("planeacion_item_id", lote)
      .returns<FilaRuta[]>(),
    "las rutas de los muebles"
  );
}

// Por id de mueble; los que no tienen ruta guardada no aparecen (usan la sugerida).
export async function cargarRutas(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<Map<string, RutaGuardada>> {
  const mapa = new Map<string, RutaGuardada>();
  if (itemIds.length === 0) return mapa;

  // Por tandas de MUEBLES_POR_TANDA, de a pocas a la vez (con miles de muebles, pedirlas todas juntas satura la base).
  // Los pasos con paginación: la base corta cada respuesta en 1000 filas sin avisar.
  const lotes = await enParalelo(tandas(itemIds, MUEBLES_POR_TANDA), async (lote) => {
    const [rutas, pasos] = await Promise.all([
      leerRutas(supabase, lote),
      paginarTodo<{ id: string; planeacion_item_id: string; parte_id: string | null; orden: number; proceso: string }>(
        (desde, hasta) =>
          supabase
            .from("pasos_ruta_produccion")
            .select("id, planeacion_item_id, parte_id, orden, proceso")
            .in("planeacion_item_id", lote)
            .is("retirado_en", null)
            .order("orden")
            .order("id")
            .range(desde, hasta),
        { contexto: "los pasos de las rutas" }
      ),
    ]);
    return [rutas, pasos] as const;
  });

  for (const [rutas, pasos] of lotes) {
    for (const r of rutas ?? []) {
      mapa.set(r.planeacion_item_id, {
        version: r.version,
        porPartes: r.por_partes === true,
        pasos: [],
        partes: new Map(),
      });
    }
    for (const p of pasos ?? []) {
      const ruta = mapa.get(p.planeacion_item_id);
      if (!ruta || !esProceso(p.proceso)) continue;
      const paso = { id: p.id, proceso: p.proceso };
      if (!p.parte_id) {
        ruta.pasos.push(paso);
        continue;
      }
      const deParte = ruta.partes.get(p.parte_id);
      if (deParte) deParte.push(paso);
      else ruta.partes.set(p.parte_id, [paso]);
    }
  }
  return mapa;
}
