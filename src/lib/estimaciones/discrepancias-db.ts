// Discrepancias con el PM de los recibos de Acabados, Armado y
// Electrificación (tabla discrepancias_pm). Las crea la base al guardar un
// renglón cuyo modelo no está en el PM o cuya cantidad acumulada lo supera
// (trigger est_conciliar_renglon_pm, ver
// supabase/migrations/20260930191049_control_pm_recibos.sql); aquí solo se
// consultan y se deciden.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AreaRecibo = "acabados" | "armado" | "electrificacion";
export type EstadoDiscrepancia = "pendiente" | "aceptada" | "rechazada";

export const AREA_RECIBO_LABELS: Record<AreaRecibo, string> = {
  acabados: "Acabados",
  armado: "Armado",
  electrificacion: "Electrificación",
};

export interface DiscrepanciaRecibo {
  id: string;
  modelo: string;
  cantidadCapturada: number;
  cantidadAcumulada: number;
  // null: el modelo no está en el PM de la OT.
  cantidadPm: number | null;
  motivo: string;
  estado: EstadoDiscrepancia;
  notaResolucion: string | null;
}

interface DiscrepanciaRow {
  id: string;
  modelo: string;
  cantidad_capturada: number;
  cantidad_acumulada: number;
  cantidad_pm: number | null;
  motivo: string;
  estado: EstadoDiscrepancia;
  nota_resolucion: string | null;
}

// Discrepancias de un recibo (RLS: las ven quien decide, el personal de
// Estimaciones y quien capturó el renglón).
export async function listarDiscrepanciasRecibo(
  supabase: SupabaseClient,
  area: AreaRecibo,
  reciboId: string
): Promise<DiscrepanciaRecibo[]> {
  const { data, error } = await supabase
    .from("discrepancias_pm")
    .select(
      "id, modelo, cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, estado, nota_resolucion"
    )
    .eq(area === "electrificacion" ? "recibo_electrificacion_id" : "recibo_id", reciboId)
    .order("creado_en", { ascending: true })
    .returns<DiscrepanciaRow[]>();
  if (error || !data) return [];
  return data.map((d) => ({
    id: d.id,
    modelo: d.modelo,
    cantidadCapturada: Number(d.cantidad_capturada),
    cantidadAcumulada: Number(d.cantidad_acumulada),
    cantidadPm: d.cantidad_pm == null ? null : Number(d.cantidad_pm),
    motivo: d.motivo,
    estado: d.estado,
    notaResolucion: d.nota_resolucion,
  }));
}

export async function decidirDiscrepancia(
  supabase: SupabaseClient,
  id: string,
  decision: "aceptada" | "rechazada",
  nota: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("decidir_discrepancia_pm", {
    p_id: id,
    p_decision: decision,
    p_nota: nota,
  });
  return { error: error?.message ?? null };
}
