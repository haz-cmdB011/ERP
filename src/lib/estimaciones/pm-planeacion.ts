// OT/PM y modelos que subió Planeación, para los generadores de recibos de
// Acabados y Armado (RPC listar_ots_pm_recibos / listar_modelos_pm_recibos,
// ver supabase/migrations/20260930170000_recibos_modelos_pm.sql).
// Electrificación usa sus propias funciones, que además marcan y filtran los
// modelos con iluminación (ver recibos-electrificacion-db.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PmRecibo {
  pedidoId: string;
  numeroPedido: string;
  proyecto: string | null;
  numModelos: number;
}

export interface ModeloPmRecibo {
  modelo: string;
  // Suma de lo que Planeación declaró para ese modelo en el PM.
  cantidadPm: number;
  // Primera línea de la descripción, para reconocer el modelo en la lista.
  descripcion: string | null;
}

// null si la consulta falla.
export async function listarPmRecibos(supabase: SupabaseClient): Promise<PmRecibo[] | null> {
  const { data, error } = await supabase.rpc("listar_ots_pm_recibos");
  if (error || !data) return null;
  return (
    data as { pedido_id: string; numero_pedido: string; proyecto: string | null; num_modelos: number }[]
  ).map((r) => ({
    pedidoId: r.pedido_id,
    numeroPedido: r.numero_pedido,
    proyecto: r.proyecto,
    numModelos: Number(r.num_modelos),
  }));
}

// null si la consulta falla.
export async function listarModelosPmRecibo(
  supabase: SupabaseClient,
  pedidoId: string
): Promise<ModeloPmRecibo[] | null> {
  const { data, error } = await supabase.rpc("listar_modelos_pm_recibos", { p_pedido: pedidoId });
  if (error || !data) return null;
  return (data as { modelo: string; cantidad_pm: number; descripcion: string | null }[]).map((r) => ({
    modelo: r.modelo,
    cantidadPm: Number(r.cantidad_pm),
    descripcion: r.descripcion || null,
  }));
}
