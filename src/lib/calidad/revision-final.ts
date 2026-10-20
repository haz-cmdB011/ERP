// Revisión final del mueble completo antes de mandarlo a obra (migraciones
// revision_final_calidad y revision_final_obligatoria). Calidad revisa el mueble
// terminado, no cada proceso. Solo muebles padre. Está detrás del ajuste
// `revision_final` (ver ajustes-flujo.ts).
//
// Listas para la revisión final = lo que Producción verificó en el último paso
// de la ruta del mueble (menos lo que Calidad rechazó en esos lotes, si los
// revisó) menos lo ya revisado. Lo rechazado regresa al paso de la ruta que
// elija Calidad y lleva dónde nació la falla: un paso de la ruta o un área.

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
  // Dónde nació la falla (solo rechazos): un paso de la ruta o un área.
  origen_paso_id: string | null;
  origen_area: string | null;
  elaborado_en: string;
}

// Áreas fuera de la ruta donde puede nacer una falla (mismas claves que la base).
export const AREAS_ORIGEN: { valor: string; nombre: string }[] = [
  { valor: "ingenieria", nombre: "Ingeniería" },
  { valor: "planeacion", nombre: "Planeación" },
  { valor: "compras", nombre: "Compras o proveedor" },
  { valor: "diseno", nombre: "Diseño" },
  { valor: "otra", nombre: "Otra área" },
];

export function nombreAreaOrigen(valor: string | null): string | null {
  return AREAS_ORIGEN.find((a) => a.valor === valor)?.nombre ?? null;
}

// El selector de origen junta pasos y áreas en un valor: "paso:<id>" o "area:<clave>".
export function leerOrigen(valor: string): { pasoId: string | null; area: string | null } | null {
  if (valor.startsWith("paso:") && valor.length > 5) return { pasoId: valor.slice(5), area: null };
  if (valor.startsWith("area:") && AREAS_ORIGEN.some((a) => a.valor === valor.slice(5))) {
    return { pasoId: null, area: valor.slice(5) };
  }
  return null;
}

// Mismos límites que registrar_revision_final en la base. `origen`: el valor
// del selector de dónde nació la falla (ver leerOrigen).
export function validarRevisionFinal(
  aprobadas: number,
  rechazadas: number,
  pendientes: number,
  motivo: string,
  pasoId: string | null,
  origen = ""
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
  if (rechazadas > 0 && !leerOrigen(origen)) return "Indica dónde nació la falla: un paso de la ruta o un área.";
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
        .select(
          "id, planeacion_item_id, folio, aprobado, cantidad, motivo, categoria, paso_retrabajo_id, origen_paso_id, origen_area, elaborado_en"
        )
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
