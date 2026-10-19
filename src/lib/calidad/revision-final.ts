// Revisión final del mueble completo antes de mandarlo a obra (migración
// revision_final_calidad). Calidad ya revisó cada proceso por lotes; aquí
// revisa el mueble terminado. Solo muebles padre. Está detrás del ajuste
// `revision_final` (ver ajustes-flujo.ts), creado apagado.
//
// Listas para la revisión final = lo que Calidad aprobó en el último paso de la
// ruta del mueble (más los retrabajos que ella misma mandó, ya aprobados) menos
// lo ya revisado. Lo rechazado regresa al paso de la ruta que elija Calidad.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";

// Fila de la vista revision_final_muebles.
export interface ResumenRevisionFinal {
  planeacion_item_id: string;
  cantidad_total: number;
  listas: number;
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
  liberado_a_obra: boolean;
}

export interface RevisionFinal {
  id: string;
  planeacion_item_id: string;
  folio: string;
  aprobado: boolean;
  cantidad: number;
  motivo: string | null;
  categoria: string | null;
  paso_retrabajo_id: string | null;
  elaborado_en: string;
}

// Mismos límites que registrar_revision_final en la base.
export function validarRevisionFinal(
  aprobadas: number,
  rechazadas: number,
  pendientes: number,
  motivo: string,
  pasoId: string | null
): string | null {
  if (!Number.isFinite(aprobadas) || !Number.isFinite(rechazadas) || aprobadas < 0 || rechazadas < 0) {
    return "Las cantidades no pueden ser negativas.";
  }
  if (aprobadas + rechazadas <= 0) return "Indica cuántas piezas apruebas o rechazas.";
  if (aprobadas + rechazadas > pendientes) {
    return `Este mueble solo tiene ${pendientes} pieza(s) listas para la revisión final.`;
  }
  if (rechazadas > 0 && !motivo.trim()) return "Indica el motivo por el que no se aprueban las piezas rechazadas.";
  if (rechazadas > 0 && !pasoId) return "Indica a qué paso de la ruta regresa lo rechazado.";
  return null;
}

// Por id de mueble: su resumen y sus revisiones (la más reciente primero).
export async function cargarRevisionFinal(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<{ resumen: Map<string, ResumenRevisionFinal>; revisiones: Map<string, RevisionFinal[]> }> {
  const resumen = new Map<string, ResumenRevisionFinal>();
  const revisiones = new Map<string, RevisionFinal[]>();
  if (itemIds.length === 0) return { resumen, revisiones };

  const [filasResumen, filasRevisiones] = await Promise.all([
    leer(
      supabase
        .from("revision_final_muebles")
        .select("planeacion_item_id, cantidad_total, listas, aprobadas, rechazadas, pendientes, liberado_a_obra")
        .in("planeacion_item_id", itemIds)
        .returns<Record<keyof ResumenRevisionFinal, string | number | boolean>[]>(),
      "la revisión final"
    ),
    leer(
      supabase
        .from("revisiones_finales_calidad")
        .select("id, planeacion_item_id, folio, aprobado, cantidad, motivo, categoria, paso_retrabajo_id, elaborado_en")
        .in("planeacion_item_id", itemIds)
        .order("elaborado_en", { ascending: false })
        .returns<(Omit<RevisionFinal, "cantidad"> & { cantidad: number | string })[]>(),
      "las revisiones finales"
    ),
  ]);

  for (const f of filasResumen ?? []) {
    resumen.set(String(f.planeacion_item_id), {
      planeacion_item_id: String(f.planeacion_item_id),
      cantidad_total: Number(f.cantidad_total),
      listas: Number(f.listas),
      aprobadas: Number(f.aprobadas),
      rechazadas: Number(f.rechazadas),
      pendientes: Number(f.pendientes),
      liberado_a_obra: f.liberado_a_obra === true,
    });
  }
  for (const r of filasRevisiones ?? []) {
    const lista = revisiones.get(r.planeacion_item_id) ?? [];
    lista.push({ ...r, cantidad: Number(r.cantidad) });
    revisiones.set(r.planeacion_item_id, lista);
  }
  return { resumen, revisiones };
}
