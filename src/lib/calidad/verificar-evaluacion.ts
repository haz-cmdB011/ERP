// Dos personas pueden tener abierto el mismo pedido y evaluar el mismo ítem: el
// segundo folio sale sin que nadie se entere. Antes de generar un folio se
// compara el último informe que la pantalla mostraba con el que hay ahora en la
// base; si cambió, se avisa en vez de duplicar la evaluación.

import type { SupabaseClient } from "@supabase/supabase-js";
import { haceCuanto } from "@/lib/estimaciones/borrador";

export interface UltimoInforme {
  id: string;
  folio: string;
  aprobado: boolean;
  elaboradoEn: string;
}

export interface CambioDeEvaluacion {
  itemId: string;
  informe: UltimoInforme;
}

// `vistos`: ítem -> id del último informe que mostraba la pantalla (null si no
// tenía). `actuales`: ítem -> último informe real. Devuelve los ítems que ya
// tienen un informe distinto al visto.
export function cambiosDesdeLaPantalla(
  vistos: Map<string, string | null>,
  actuales: Map<string, UltimoInforme>
): CambioDeEvaluacion[] {
  const cambios: CambioDeEvaluacion[] = [];
  for (const [itemId, visto] of vistos) {
    const actual = actuales.get(itemId);
    if (actual && actual.id !== visto) cambios.push({ itemId, informe: actual });
  }
  return cambios;
}

export function mensajeEvaluacionNueva(
  cambios: CambioDeEvaluacion[],
  codigoDe: (itemId: string) => number | string,
  ahora: Date
): string {
  const detalle = cambios
    .slice(0, 3)
    .map(
      (c) =>
        `ítem ${codigoDe(c.itemId)}: ${c.informe.folio} ${c.informe.aprobado ? "aprobado" : "no aprobado"} ${haceCuanto(c.informe.elaboradoEn, ahora)}`
    )
    .join("; ");
  const resto = cambios.length > 3 ? ` y ${cambios.length - 3} más` : "";
  return `Alguien ya evaluó ${cambios.length === 1 ? "este ítem" : "estos ítems"} mientras tenías la pantalla abierta (${detalle}${resto}). Revisa la tabla ya actualizada antes de generar otro folio.`;
}

// Último informe de cada ítem en la base ahora mismo. Lanza si la lectura falla.
export async function ultimosInformes(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<Map<string, UltimoInforme>> {
  const salida = new Map<string, UltimoInforme>();
  for (let i = 0; i < itemIds.length; i += 100) {
    const lote = itemIds.slice(i, i + 100);
    const { data, error } = await supabase
      .from("informes_calidad")
      .select("id, folio, aprobado, elaborado_en, planeacion_item_id")
      .in("planeacion_item_id", lote)
      .order("elaborado_en", { ascending: false })
      .limit(1000)
      .returns<{ id: string; folio: string; aprobado: boolean; elaborado_en: string; planeacion_item_id: string }[]>();
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      if (!salida.has(r.planeacion_item_id)) {
        salida.set(r.planeacion_item_id, {
          id: r.id,
          folio: r.folio,
          aprobado: r.aprobado,
          elaboradoEn: r.elaborado_en,
        });
      }
    }
  }
  return salida;
}
