// Lee de la base lo que hace falta para calcular el estatus de los reportes de
// no conformidad de un lote: si Producción ya asignó el retrabajo y cuántas piezas
// de él aprobó Calidad (ver estatusNoConformidad en no-conformidad.ts). Lo usan la
// pantalla del informe (un reporte), la lista de folios y su Excel (varios), con
// una consulta por tipo y por tandas de reportes en vez de una por reporte.

import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { estatusNoConformidad, type EstatusNoConformidad } from "./no-conformidad";

// Reportes por tanda: con listas de ids más largas la URL de la consulta es demasiado larga.
const TANDA = 50;

function tandas<T>(items: T[]): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += TANDA) salida.push(items.slice(i, i + TANDA));
  return salida;
}

export interface InformeParaEstatus {
  id: string;
  entrega_id: string | null;
  cantidad: number | null;
  cerrado_en: string | null;
}

export interface EstatusDeInforme {
  estatus: EstatusNoConformidad;
  fecha: string | null;
}

// Estatus de cada reporte, en el mismo orden que `informes`.
export async function estatusDeInformes(
  supabase: SupabaseClient,
  informes: InformeParaEstatus[]
): Promise<EstatusDeInforme[]> {
  const salida: EstatusDeInforme[] = [];
  for (const tanda of tandas(informes)) {
    salida.push(...(await estatusDeTanda(supabase, tanda)));
  }
  return salida;
}

async function estatusDeTanda(supabase: SupabaseClient, informes: InformeParaEstatus[]): Promise<EstatusDeInforme[]> {
  const idsLote = informes.filter((i) => i.entrega_id).map((i) => i.id);

  // Asignaciones vigentes del retrabajo y lotes de cada reporte de lote.
  const asignacionesPorInforme = new Map<string, number>();
  const lotesPorInforme = new Map<string, { entrega_id: string; aprobadas: number }[]>();
  if (idsLote.length > 0) {
    const asignaciones =
      (await leer(
        supabase
          .from("asignaciones_produccion")
          .select("informe_rechazo_id")
          .in("informe_rechazo_id", idsLote)
          .is("cancelada_en", null)
          .returns<{ informe_rechazo_id: string }[]>(),
        "asignaciones_produccion"
      )) ?? [];
    for (const a of asignaciones) {
      asignacionesPorInforme.set(a.informe_rechazo_id, (asignacionesPorInforme.get(a.informe_rechazo_id) ?? 0) + 1);
    }

    const lotes =
      (await leer(
        supabase
          .from("lotes_calidad")
          .select("informe_rechazo_id, entrega_id, aprobadas")
          .in("informe_rechazo_id", idsLote)
          .returns<{ informe_rechazo_id: string; entrega_id: string; aprobadas: number | string }[]>(),
        "lotes_calidad"
      )) ?? [];
    for (const l of lotes) {
      const del = lotesPorInforme.get(l.informe_rechazo_id) ?? [];
      del.push({ entrega_id: l.entrega_id, aprobadas: Number(l.aprobadas) });
      lotesPorInforme.set(l.informe_rechazo_id, del);
    }
  }

  // Aprobaciones de las entregas de esos lotes, de la más reciente a la más antigua:
  // la primera que corresponda a un reporte es su última aprobación.
  const entregas = [...new Set([...lotesPorInforme.values()].flat().map((l) => l.entrega_id))];
  const aprobaciones =
    entregas.length > 0
      ? ((await leer(
          supabase
            .from("informes_calidad")
            .select("entrega_id, elaborado_en")
            .in("entrega_id", entregas)
            .eq("aprobado", true)
            .order("elaborado_en", { ascending: false })
            .returns<{ entrega_id: string; elaborado_en: string }[]>(),
          "informes_calidad"
        )) ?? [])
      : [];

  return informes.map((informe) => {
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
    const lotes = lotesPorInforme.get(informe.id) ?? [];
    const entregasDelReporte = new Set(lotes.map((l) => l.entrega_id));
    return estatusNoConformidad({
      cerradoEn: informe.cerrado_en,
      esLote: true,
      piezasRechazadas: Number(informe.cantidad ?? 0),
      asignacionesRetrabajo: asignacionesPorInforme.get(informe.id) ?? 0,
      piezasAprobadasRetrabajo: lotes.reduce((suma, l) => suma + l.aprobadas, 0),
      fechaUltimaAprobacion: aprobaciones.find((a) => entregasDelReporte.has(a.entrega_id))?.elaborado_en ?? null,
    });
  });
}

// Estatus de un reporte (la pantalla del informe).
export async function estatusDeInforme(
  supabase: SupabaseClient,
  informe: InformeParaEstatus
): Promise<EstatusDeInforme> {
  const [estatus] = await estatusDeInformes(supabase, [informe]);
  return estatus;
}
