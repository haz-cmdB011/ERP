// Resumen ligero de las discrepancias con el PM (cantidades que superan lo
// declarado, de cualquier área de recibos) para contadores y avisos. La RLS decide qué ve cada
// quien: el administrador de Estimaciones y el desarrollador ven todas; el
// maquilador solo las de sus propios recibos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import type { EstadoDiscrepancia } from "./discrepancias-db";

export interface ResumenDiscrepancia {
  reciboId: string;
  estado: EstadoDiscrepancia;
  // Estado del recibo al que pertenece (un recibo cancelado ya no importa).
  estadoRecibo: string | null;
}

// Lanza si falla la lectura. Quien solo pinta un contador (menú, panel) lo
// atrapa con `.catch` para no tumbar la pantalla por un número.
export async function listarResumenDiscrepancias(
  supabase: SupabaseClient
): Promise<ResumenDiscrepancia[]> {
  type Fila = {
    recibo_id: string | null;
    recibo_electrificacion_id: string | null;
    estado: EstadoDiscrepancia;
    recibos: { estado: string } | null;
    recibos_electrificacion: { estado: string } | null;
  };
  const data = await paginarTodo<Fila>(
    (desde, hasta) =>
      supabase
        .from("discrepancias_pm")
        .select("recibo_id, recibo_electrificacion_id, estado, recibos(estado), recibos_electrificacion(estado)")
        .order("id")
        .range(desde, hasta)
        .returns<Fila[]>(),
    { contexto: "las discrepancias" }
  );
  return data.map((d) => ({
    reciboId: (d.recibo_electrificacion_id ?? d.recibo_id) as string,
    estado: d.estado,
    estadoRecibo: d.recibos_electrificacion?.estado ?? d.recibos?.estado ?? null,
  }));
}

// Pendientes de decidir en recibos que siguen vigentes.
export function contarPendientes(resumen: ResumenDiscrepancia[]): number {
  return resumen.filter((d) => d.estado === "pendiente" && d.estadoRecibo !== "cancelado").length;
}

// Motivos rechazados en recibos vigentes: el maquilador debe corregirlos o
// cancelar el recibo (al modificarlo, sus discrepancias se vuelven a evaluar).
export function contarRechazadas(resumen: ResumenDiscrepancia[]): number {
  return resumen.filter((d) => d.estado === "rechazada" && d.estadoRecibo !== "cancelado").length;
}

// Por recibo: cuántas discrepancias pendientes y rechazadas tiene.
export function agruparPorRecibo(
  resumen: ResumenDiscrepancia[]
): Map<string, { pendientes: number; rechazadas: number }> {
  const mapa = new Map<string, { pendientes: number; rechazadas: number }>();
  for (const d of resumen) {
    const actual = mapa.get(d.reciboId) ?? { pendientes: 0, rechazadas: 0 };
    if (d.estado === "pendiente") actual.pendientes += 1;
    if (d.estado === "rechazada") actual.rechazadas += 1;
    mapa.set(d.reciboId, actual);
  }
  return mapa;
}
