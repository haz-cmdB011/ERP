// Entregas parciales por parte del despiece (migración entrega_por_partes). El mueble se asigna
// completo; sus partes ("Puerta", "Marco") se entregan cuando están, y los muebles completos que
// alcanzan las partes pasan solos como entrega del mueble. Lógica sin base ni navegador; la
// lectura vive al final y la regla real, en registrar_entrega_partes.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import type { AsignacionResumen } from "./asignaciones";
import { partesConRuta, type MuebleFlujo } from "./flujo-mueble";
import { tandas } from "./tandas";

// Una parte tal como la ve el formulario de entrega de una asignación.
export interface ParteEntrega {
  id: string;
  descripcion: string;
  piezasPorMueble: number;
  unidad: string | null;
  // Piezas de esta parte ya entregadas en esta asignación.
  entregadas: number;
}

// Piezas que faltan por entregar de una parte: piezas por mueble × muebles de la asignación.
export function faltanDeParte(p: ParteEntrega, muebles: number): number {
  return Math.max(0, Math.round((p.piezasPorMueble * muebles - p.entregadas) * 1000) / 1000);
}

// Muebles completos que alcanzan las partes (la más atrasada manda), sin pasar de `muebles`.
// `nuevas` son las piezas que se están capturando ahora, por id de parte.
export function completosPorPartes(
  partes: ParteEntrega[],
  muebles: number,
  nuevas: Record<string, number> = {}
): number {
  if (partes.length === 0) return 0;
  const alcanza = partes.map((p) =>
    Math.floor((p.entregadas + (nuevas[p.id] ?? 0)) / (p.piezasPorMueble || Infinity) + 1e-9)
  );
  return Math.max(0, Math.min(muebles, ...alcanza));
}

// Las partes que se ofrecen al registrar una entrega, o undefined si esa asignación se entrega
// como siempre: la de una parte (muebles de antes), la de un mueble sin despiece o la de uno de
// antes que ya trabajaba por partes con ruta propia (sus partes tienen asignaciones aparte).
export function partesParaEntrega(
  mueble: MuebleFlujo | undefined,
  asignacion: Pick<AsignacionResumen, "parte_id" | "cancelada_en">,
  entregadas: Map<string, number> | undefined
): ParteEntrega[] | undefined {
  if (!mueble || asignacion.parte_id || asignacion.cancelada_en) return undefined;
  const partes = mueble.partes ?? [];
  if (partes.length === 0 || partesConRuta(mueble).length > 0) return undefined;
  return partes.map((p) => ({
    id: p.id,
    descripcion: p.descripcion,
    piezasPorMueble: p.piezasPorMueble,
    unidad: p.unidad,
    entregadas: entregadas?.get(p.id) ?? 0,
  }));
}

// Piezas entregadas por parte en cada asignación (solo de las que se piden).
export async function entregasPorParte(
  supabase: SupabaseClient,
  asignacionIds: string[]
): Promise<Map<string, Map<string, number>>> {
  const mapa = new Map<string, Map<string, number>>();
  try {
    for (const lote of tandas(asignacionIds)) {
      const filas = await leer(
        supabase
          .from("entregas_partes_produccion")
          .select("asignacion_id, parte_id, piezas")
          .in("asignacion_id", lote)
          .returns<{ asignacion_id: string; parte_id: string; piezas: number | string }[]>(),
        "entregas_partes_produccion"
      );
      for (const f of filas ?? []) {
        const porParte = mapa.get(f.asignacion_id) ?? new Map<string, number>();
        porParte.set(f.parte_id, (porParte.get(f.parte_id) ?? 0) + Number(f.piezas));
        mapa.set(f.asignacion_id, porParte);
      }
    }
  } catch {
    // Si no se pueden leer (la tabla aún no existe en esa base), el panel sigue y la entrega
    // por partes arranca en cero; la base rechaza lo que no cuadre al registrar.
  }
  return mapa;
}
