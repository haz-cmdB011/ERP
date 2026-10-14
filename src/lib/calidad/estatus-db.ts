// Lee de la base lo que hace falta para calcular el estatus de un reporte de no
// conformidad de un lote: si Producción ya asignó el retrabajo y cuántas piezas
// de él aprobó Calidad (ver estatusNoConformidad en no-conformidad.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { estatusNoConformidad, type EstatusNoConformidad } from "./no-conformidad";

export async function estatusDeInforme(
  supabase: SupabaseClient,
  informe: { id: string; entrega_id: string | null; cantidad: number | null; cerrado_en: string | null }
): Promise<{ estatus: EstatusNoConformidad; fecha: string | null }> {
  if (!informe.entrega_id) {
    return estatusNoConformidad({
      cerradoEn: informe.cerrado_en,
      esLote: false,
      piezasRechazadas: 0,
      asignacionesRetrabajo: 0,
      piezasAprobadasRetrabajo: 0,
      fechaUltimaAprobacion: null,
    });
  }

  // Con conteo (`leer` solo devuelve `data`).
  const { count: nAsignaciones, error: errorAsig } = await supabase
    .from("asignaciones_produccion")
    .select("id", { count: "exact", head: true })
    .eq("informe_rechazo_id", informe.id)
    .is("cancelada_en", null);
  if (errorAsig) throw new Error(`No se pudo leer asignaciones_produccion: ${errorAsig.message}`);

  const lotes =
    (await leer(
      supabase
        .from("lotes_calidad")
        .select("entrega_id, aprobadas")
        .eq("informe_rechazo_id", informe.id)
        .returns<{ entrega_id: string; aprobadas: number | string }[]>(),
      "lotes_calidad"
    )) ?? [];
  const aprobadas = lotes.reduce((suma, l) => suma + Number(l.aprobadas), 0);

  let ultima: string | null = null;
  if (lotes.length > 0) {
    const aprobaciones =
      (await leer(
        supabase
          .from("informes_calidad")
          .select("elaborado_en")
          .in("entrega_id", lotes.map((l) => l.entrega_id))
          .eq("aprobado", true)
          .order("elaborado_en", { ascending: false })
          .limit(1)
          .returns<{ elaborado_en: string }[]>(),
        "informes_calidad"
      )) ?? [];
    ultima = aprobaciones[0]?.elaborado_en ?? null;
  }

  return estatusNoConformidad({
    cerradoEn: informe.cerrado_en,
    esLote: true,
    piezasRechazadas: Number(informe.cantidad ?? 0),
    asignacionesRetrabajo: nAsignaciones ?? 0,
    piezasAprobadasRetrabajo: aprobadas,
    fechaUltimaAprobacion: ultima,
  });
}
