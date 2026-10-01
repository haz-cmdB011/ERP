// OT y modelos que subió Planeación, para los generadores de recibos de
// Acabados y Armado (RPC listar_ots_recibos / listar_modelos_ot_recibos, ver
// supabase/migrations/20261001194636_recibos_por_ot.sql). Una OT junta todos
// sus PM vigentes: los modelos traen la cantidad sumada de todos.
// Electrificación usa sus propias funciones, que solo cuentan los muebles con
// iluminación (ver recibos-electrificacion-db.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OtRecibo {
  // Clave de la OT ("193-24"); es lo que se guarda en el recibo.
  ot: string;
  // El proyecto más frecuente entre sus PM.
  proyecto: string | null;
  numPms: number;
  numModelos: number;
}

export interface ModeloOtRecibo {
  modelo: string;
  // Suma de lo que Planeación declaró para ese modelo en todos los PM de la OT.
  cantidadPm: number;
  // Primera línea de la descripción, para reconocer el modelo en la lista.
  descripcion: string | null;
  // Lo ya capturado de ese modelo en recibos vigentes de la OT en el área (sin
  // reprocesos ni el recibo que se está modificando).
  cantidadRegistrada: number;
  // En qué PM de la OT viene ("2PM193-24, 7PM193-24").
  pms: string;
}

// null si la consulta falla.
export async function listarOtsRecibos(supabase: SupabaseClient): Promise<OtRecibo[] | null> {
  const { data, error } = await supabase.rpc("listar_ots_recibos");
  if (error || !data) return null;
  return (
    data as { orden_trabajo: string; proyecto: string | null; num_pms: number; num_modelos: number }[]
  ).map((r) => ({
    ot: r.orden_trabajo,
    proyecto: r.proyecto,
    numPms: Number(r.num_pms),
    numModelos: Number(r.num_modelos),
  }));
}

// null si la consulta falla.
export async function listarModelosOtRecibo(
  supabase: SupabaseClient,
  ot: string,
  tipo: "acabados" | "armado",
  excluirReciboId?: string
): Promise<ModeloOtRecibo[] | null> {
  const { data, error } = await supabase.rpc("listar_modelos_ot_recibos", {
    p_ot: ot,
    p_tipo: tipo,
    p_excluir_recibo: excluirReciboId ?? null,
  });
  if (error || !data) return null;
  return (
    data as {
      modelo: string;
      cantidad_pm: number;
      descripcion: string | null;
      cantidad_registrada: number;
      pms: string | null;
    }[]
  ).map((r) => ({
    modelo: r.modelo,
    cantidadPm: Number(r.cantidad_pm),
    descripcion: r.descripcion || null,
    cantidadRegistrada: Number(r.cantidad_registrada),
    pms: r.pms ?? "",
  }));
}
