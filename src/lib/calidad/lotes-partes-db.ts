// Entregas por partes como lotes de Calidad (migración calidad_revisa_partes).
//
// Un mueble asignado completo puede entregarse "por partes": cada renglón de piezas de una
// parte (vista lotes_partes_calidad) se revisa como cualquier entrega, con
// evaluar_entrega_parte_calidad. La entrega del mueble que la base junta con esas piezas
// (entregas_produccion.desde_partes) ya no se revisa directo: la aprueba la base cuando las
// partes alcanzan. Aquí se quitan esas y se agregan las de partes a una lista de lotes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Proceso } from "@/lib/produccion/asignaciones";
import { normalizarLote, type LoteCalidad } from "./lotes";

interface FilaLoteParte {
  entrega_parte_id: string;
  asignacion_id: string;
  planeacion_item_id: string | null;
  pedido_id: string | null;
  numero_pedido: string;
  item_code: number | null;
  modelo: string | null;
  descripcion: string | null;
  proceso: Proceso;
  equipo_id: string;
  equipo: string;
  parte_id: string;
  parte_descripcion: string;
  unidad: string;
  piezas_por_mueble: number;
  fecha_entrega: string;
  registrado_en: string;
  cantidad: number;
  aprobadas: number;
  rechazadas: number;
  pendiente: number;
  vigente: boolean;
  folio_hoja: string | null;
}

function comoLote(f: FilaLoteParte): LoteCalidad {
  return normalizarLote({
    entrega_id: f.entrega_parte_id,
    entrega_parte: true,
    asignacion_id: f.asignacion_id,
    planeacion_item_id: f.planeacion_item_id,
    pedido_id: f.pedido_id,
    numero_pedido: f.numero_pedido,
    item_code: f.item_code,
    modelo: f.modelo,
    descripcion: f.descripcion,
    unidad: f.unidad,
    proceso: f.proceso,
    equipo_id: f.equipo_id,
    equipo: f.equipo,
    informe_rechazo_id: null,
    folio_rechazo: null,
    fecha_entrega: f.fecha_entrega,
    // Nace verificada: Producción la registra y Calidad la revisa.
    verificada_en: f.registrado_en,
    cantidad: f.cantidad,
    aprobadas: f.aprobadas,
    rechazadas: f.rechazadas,
    pendiente: f.pendiente,
    vigente: f.vigente,
    folio_hoja: f.folio_hoja,
    vez_paso: null,
    veces_proceso: null,
    parte_id: f.parte_id,
    parte_descripcion: f.parte_descripcion,
    parte_piezas_por_mueble: Number(f.piezas_por_mueble),
  });
}

// Quita de `lotes` las entregas del mueble juntadas de partes y agrega las piezas por parte
// de los mismos muebles (o de todos, sin `itemIds`). Si la base aún no tiene la migración,
// deja la lista como estaba.
export async function conLotesDePartes(
  supabase: SupabaseClient,
  lotes: LoteCalidad[],
  filtro: { itemIds?: string[]; soloPendientes?: boolean } = {}
): Promise<LoteCalidad[]> {
  if (filtro.itemIds && filtro.itemIds.length === 0) return lotes;
  let consulta = supabase.from("lotes_partes_calidad").select("*");
  if (filtro.itemIds) consulta = consulta.in("planeacion_item_id", filtro.itemIds);
  if (filtro.soloPendientes) consulta = consulta.eq("vigente", true).gt("pendiente", 0);
  // Las juntadas de partes son pocas: se leen todas en vez de pasar la lista de ids.
  const [partes, desdePartes] = await Promise.all([
    consulta.order("registrado_en").returns<FilaLoteParte[]>(),
    supabase.from("entregas_produccion").select("id").eq("desde_partes", true).returns<{ id: string }[]>(),
  ]);
  if (partes.error || desdePartes.error) return lotes;
  const juntadas = new Set((desdePartes.data ?? []).map((e) => e.id));
  return [...lotes.filter((l) => !juntadas.has(l.entrega_id)), ...(partes.data ?? []).map(comoLote)];
}
