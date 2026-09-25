// Todos los recibos de maquila juntos (Acabados y Armado viven en `recibos`,
// Electrificación en sus propias tablas), ordenados por folio. Para el
// personal de Estimaciones RLS devuelve todos; al maquilador solo los suyos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { compararFolios, listarRecibos, type EstadoRecibo, type ReciboResumen } from "./recibos-db";
import { listarRecibosElectrificacion } from "./recibos-electrificacion-db";
import type { TipoCualquierRecibo } from "./revision-db";

export type ReciboListado = Omit<ReciboResumen, "tipo"> & { tipo: TipoCualquierRecibo };

export const ESTADOS_FILTRO = ["pendiente", "revisado", "pagado", "cancelado"] as const;

export function esEstadoRecibo(s: string | undefined): s is EstadoRecibo {
  return !!s && (ESTADOS_FILTRO as readonly string[]).includes(s);
}

export async function listarTodosLosRecibos(supabase: SupabaseClient): Promise<ReciboListado[]> {
  const [acabadosArmado, electrificacion] = await Promise.all([
    listarRecibos(supabase),
    listarRecibosElectrificacion(supabase),
  ]);
  return [...acabadosArmado, ...electrificacion].sort(
    (a, b) => compararFolios(a.folio, b.folio) || a.tipo.localeCompare(b.tipo)
  );
}
