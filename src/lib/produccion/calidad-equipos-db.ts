// Lectura para "Calidad por equipo": entregas del periodo (por fecha de
// entrega), sus asignaciones y los informes de Calidad de esas entregas.
// Lanza ErrorLectura si una consulta falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import {
  metricasPorEquipo,
  type AsignacionParaMetricas,
  type EntregaParaMetricas,
  type InformeParaMetricas,
  type MetricasEquipo,
} from "./calidad-equipos";

// .in() con muchos ids rompe el largo de la URL: se piden por tandas.
function tandas<T>(lista: T[], tamano = 100): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

export async function cargarCalidadPorEquipo(
  supabase: SupabaseClient,
  desde: string | null
): Promise<MetricasEquipo[]> {
  const entregas = await paginarTodo<EntregaParaMetricas>(
    (ini, fin) => {
      let q = supabase
        .from("entregas_produccion")
        .select("id, asignacion_id, cantidad, verificada_en, rechazada_en, anulada_en")
        .order("id")
        .range(ini, fin);
      if (desde) q = q.gte("fecha_entrega", desde);
      return q.returns<EntregaParaMetricas[]>();
    },
    { contexto: "las entregas de los equipos" }
  );
  if (entregas.length === 0) return [];

  const idsAsignaciones = [...new Set(entregas.map((e) => e.asignacion_id))];
  const idsEntregas = entregas.map((e) => e.id);

  const [asignaciones, informes] = await Promise.all([
    Promise.all(
      tandas(idsAsignaciones).map((lote) =>
        paginarTodo<AsignacionParaMetricas>(
          (ini, fin) =>
            supabase
              .from("asignaciones_produccion")
              .select("id, equipo_id")
              .in("id", lote)
              .order("id")
              .range(ini, fin)
              .returns<AsignacionParaMetricas[]>(),
          { contexto: "las asignaciones de los equipos" }
        )
      )
    ),
    Promise.all(
      tandas(idsEntregas).map((lote) =>
        paginarTodo<InformeParaMetricas>(
          (ini, fin) =>
            supabase
              .from("informes_calidad")
              .select("entrega_id, aprobado, cantidad, categoria")
              .in("entrega_id", lote)
              .order("id")
              .range(ini, fin)
              .returns<InformeParaMetricas[]>(),
          { contexto: "los informes de Calidad de las entregas" }
        )
      )
    ),
  ]);

  return metricasPorEquipo(entregas, asignaciones.flat(), informes.flat());
}
