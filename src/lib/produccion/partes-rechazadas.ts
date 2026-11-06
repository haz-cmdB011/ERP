// Piezas de partes que Calidad no aprobó en una entrega por partes (migración
// calidad_revisa_partes). No se reasignan como retrabajo: se vuelven a entregar en la misma
// asignación (lo rechazado no gasta lo que falta por entregar). Aquí, cuántas faltan por
// volver a entregar de cada parte de cada asignación.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proceso } from "./asignaciones";

export interface LotePartePlano {
  asignacion_id: string;
  parte_id: string;
  parte_descripcion: string;
  unidad: string;
  piezas_por_mueble: number;
  cantidad: number;
  rechazadas: number;
}

export interface ParteRechazada {
  asignacionId: string;
  parteId: string;
  parte: string;
  unidad: string;
  rechazadas: number;
  // Piezas rechazadas que todavía no se han vuelto a entregar.
  porReentregar: number;
}

// Por asignación y parte: lo rechazado que falta por volver a entregar = lo que falta para
// la meta (piezas por mueble × muebles de la asignación) contando solo lo no rechazado, sin
// pasar de lo rechazado.
export function partesPorReentregar(lotes: LotePartePlano[], muebles: Map<string, number>): ParteRechazada[] {
  const grupos = new Map<string, ParteRechazada & { entregadas: number; meta: number }>();
  for (const l of lotes) {
    const clave = `${l.asignacion_id}:${l.parte_id}`;
    const g = grupos.get(clave) ?? {
      asignacionId: l.asignacion_id,
      parteId: l.parte_id,
      parte: l.parte_descripcion,
      unidad: l.unidad,
      rechazadas: 0,
      porReentregar: 0,
      entregadas: 0,
      meta: Number(l.piezas_por_mueble) * (muebles.get(l.asignacion_id) ?? 0),
    };
    g.entregadas += Number(l.cantidad);
    g.rechazadas += Number(l.rechazadas);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map(({ entregadas, meta, ...g }) => ({
      ...g,
      porReentregar: Math.max(0, Math.min(g.rechazadas, meta - (entregadas - g.rechazadas))),
    }))
    .filter((g) => g.porReentregar > 0);
}

export interface AsignacionConPartesRechazadas {
  asignacionId: string;
  pedidoId: string | null;
  numeroPedido: string;
  modelo: string | null;
  itemCode: number | null;
  proceso: Proceso;
  equipo: string;
  partes: ParteRechazada[];
  // Folios y motivos de lo rechazado, del más reciente al más viejo.
  informes: { folio: string; motivo: string | null; cantidad: number; parte: string }[];
}

interface FilaLote extends LotePartePlano {
  entrega_parte_id: string;
  pedido_id: string | null;
  numero_pedido: string;
  modelo: string | null;
  item_code: number | null;
  proceso: Proceso;
  equipo: string;
  vigente: boolean;
}

// Lee lo de partes rechazado que falta por volver a entregar, agrupado por asignación.
// Si la base aún no tiene la vista, no hay nada que mostrar.
export async function cargarPartesRechazadas(supabase: SupabaseClient): Promise<AsignacionConPartesRechazadas[]> {
  const conRechazo = await supabase
    .from("lotes_partes_calidad")
    .select("asignacion_id")
    .eq("vigente", true)
    .gt("rechazadas", 0)
    .returns<{ asignacion_id: string }[]>();
  const ids = [...new Set((conRechazo.data ?? []).map((f) => f.asignacion_id))];
  if (conRechazo.error || ids.length === 0) return [];

  const [lotes, asignaciones, informes] = await Promise.all([
    supabase.from("lotes_partes_calidad").select("*").in("asignacion_id", ids).returns<FilaLote[]>(),
    supabase.from("asignaciones_produccion").select("id, cantidad").in("id", ids).returns<{ id: string; cantidad: number }[]>(),
    supabase
      .from("informes_calidad")
      .select("folio, descripcion, cantidad, elaborado_en, entrega_parte_id")
      .eq("aprobado", false)
      .not("entrega_parte_id", "is", null)
      .order("elaborado_en", { ascending: false })
      .limit(500)
      .returns<{ folio: string; descripcion: string | null; cantidad: number; elaborado_en: string; entrega_parte_id: string }[]>(),
  ]);
  if (lotes.error || asignaciones.error) return [];

  const muebles = new Map((asignaciones.data ?? []).map((a) => [a.id, Number(a.cantidad)]));
  const filas = lotes.data ?? [];
  const pendientes = partesPorReentregar(filas, muebles);
  const loteDe = new Map(filas.map((l) => [l.entrega_parte_id, l]));

  const porAsignacion = new Map<string, AsignacionConPartesRechazadas>();
  for (const p of pendientes) {
    const l = filas.find((x) => x.asignacion_id === p.asignacionId)!;
    const g = porAsignacion.get(p.asignacionId) ?? {
      asignacionId: p.asignacionId,
      pedidoId: l.pedido_id,
      numeroPedido: l.numero_pedido,
      modelo: l.modelo,
      itemCode: l.item_code,
      proceso: l.proceso,
      equipo: l.equipo,
      partes: [],
      informes: [],
    };
    g.partes.push(p);
    porAsignacion.set(p.asignacionId, g);
  }
  for (const i of informes.data ?? []) {
    const l = loteDe.get(i.entrega_parte_id);
    const g = l && porAsignacion.get(l.asignacion_id);
    if (!g || !g.partes.some((p) => p.parteId === l.parte_id)) continue;
    g.informes.push({ folio: i.folio, motivo: i.descripcion, cantidad: Number(i.cantidad), parte: l.parte_descripcion });
  }
  return [...porAsignacion.values()];
}
