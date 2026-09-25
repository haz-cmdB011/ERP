// Revisión y pago de recibos de maquila (todos los tipos). Envuelve las RPC
// de supabase/migrations/20260925191851_estimaciones_maquiladores_revision.sql:
//   decidir_renglon       — aceptar o modificar el precio de un renglón
//   marcar_recibo_pagado  — revisado -> pagado
//   cancelar_recibo       — pendiente -> cancelado (el maquilador, solo los
//                           suyos y mientras nadie los haya revisado)
// Las reglas (quién puede, en qué estado) viven en la base; aquí solo se
// traducen los errores.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Banda } from "./motor-precio";
import type { TipoRecibo } from "./recibos-db";

export type TipoCualquierRecibo = TipoRecibo | "electrificacion";

export const NOMBRE_TIPO_CUALQUIERA: Record<TipoCualquierRecibo, string> = {
  acabados: "Acabados",
  armado: "Armado",
  electrificacion: "Electrificación",
};

export function esTipoCualquierRecibo(t: string): t is TipoCualquierRecibo {
  return t === "acabados" || t === "armado" || t === "electrificacion";
}

type Resultado = { error: string | null };

export async function decidirRenglon(
  supabase: SupabaseClient,
  tipo: TipoCualquierRecibo,
  renglonId: string,
  decision: {
    aceptado: number;
    puSugerido: number | null;
    fuente: string;
    banda: Banda;
    justificacion: string;
  }
): Promise<Resultado> {
  const { error } = await supabase.rpc("decidir_renglon", {
    p_tipo: tipo,
    p_renglon_id: renglonId,
    p_aceptado: decision.aceptado,
    p_pu_sugerido: decision.puSugerido,
    p_fuente: decision.fuente,
    p_banda: decision.banda,
    p_justificacion: decision.justificacion,
  });
  return { error: error?.message ?? null };
}

export async function marcarReciboPagado(
  supabase: SupabaseClient,
  tipo: TipoCualquierRecibo,
  reciboId: string
): Promise<Resultado> {
  const { error } = await supabase.rpc("marcar_recibo_pagado", {
    p_tipo: tipo,
    p_recibo_id: reciboId,
  });
  return { error: error?.message ?? null };
}

export async function cancelarRecibo(
  supabase: SupabaseClient,
  tipo: TipoCualquierRecibo,
  reciboId: string
): Promise<Resultado> {
  const { error } = await supabase.rpc("cancelar_recibo", {
    p_tipo: tipo,
    p_recibo_id: reciboId,
  });
  return { error: error?.message ?? null };
}
