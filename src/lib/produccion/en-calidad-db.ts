import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";

interface FilaRevisionFinal {
  planeacion_item_id: string;
  pendientes: number | string | null;
}

// Cuántas piezas de cada mueble esperan la revisión final de Calidad (por id de mueble): lo que Producción
// ya entregó y verificó en el último paso de su ruta y Calidad todavía no aprueba ni rechaza (vista
// revision_final_muebles, columna `pendientes`). Solo trae los muebles con algo pendiente. Es un dato de apoyo
// del tablero: si no se puede leer devuelve vacío y no tumba el inicio.
export async function cargarEnCalidad(supabase: SupabaseClient): Promise<Map<string, number>> {
  try {
    const filas = await paginarTodo<FilaRevisionFinal>(
      (desde, hasta) =>
        supabase
          .from("revision_final_muebles")
          .select("planeacion_item_id, pendientes")
          .gt("pendientes", 0)
          .order("planeacion_item_id")
          .range(desde, hasta)
          .returns<FilaRevisionFinal[]>(),
      { contexto: "las piezas en revisión de Calidad" }
    );
    const porMueble = new Map<string, number>();
    for (const f of filas) {
      const n = Number(f.pendientes ?? 0);
      if (Number.isFinite(n) && n > 0) porMueble.set(String(f.planeacion_item_id), n);
    }
    return porMueble;
  } catch (e) {
    console.warn("No se pudo leer lo que está en revisión de Calidad:", e instanceof Error ? e.message : e);
    return new Map();
  }
}
