// Lo cobrado en un recibo contra lo que Calidad ya aprobó (función
// recibo_contra_calidad, ver supabase/migrations/20261014195109_cuadre_calidad_recibos.sql).
// Es solo un aviso para quien revisa el recibo: no bloquea la revisión ni el pago
// y no le pide nada al maquilador. Si Calidad aprueba después, el aviso
// desaparece solo porque se calcula al abrir el recibo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoCualquierRecibo } from "./revision-db";

export interface RenglonContraCalidad {
  renglonId: string;
  numero: number;
  modelo: string;
  // Primera línea de la descripción de la variante (mueble o componente).
  descripcion: string | null;
  esComponente: boolean;
  cantidad: number;
  // Lo cobrado de esa variante en el área hasta este renglón (incluido).
  acumulado: number;
  // null: no hay con qué comparar (el mueble no pasó por Producción en el sistema
  // o la variante no está en el PM).
  aprobado: number | null;
}

// Lo cobrado de más respecto a lo aprobado por Calidad (0 si no hay dato).
export function sinAprobarPorCalidad(l: Pick<RenglonContraCalidad, "acumulado" | "aprobado">): number {
  return l.aprobado == null ? 0 : Math.max(0, l.acumulado - l.aprobado);
}

export interface ResumenContraCalidad {
  // Renglones cobrados por encima de lo que Calidad aprobó.
  conDiferencia: RenglonContraCalidad[];
  // Renglones comparados que sí concuerdan.
  cuadran: number;
  // Renglones que no se pudieron comparar con Calidad.
  sinDato: number;
}

export function resumirContraCalidad(lineas: RenglonContraCalidad[]): ResumenContraCalidad {
  const conDiferencia = lineas.filter((l) => sinAprobarPorCalidad(l) > 0);
  const conDato = lineas.filter((l) => l.aprobado != null);
  return {
    conDiferencia,
    cuadran: conDato.length - conDiferencia.length,
    sinDato: lineas.length - conDato.length,
  };
}

interface FilaRpc {
  renglon_id: string;
  numero: number;
  modelo: string;
  descripcion: string | null;
  es_componente: boolean | null;
  cantidad: number | string;
  acumulado: number | string;
  aprobado: number | string | null;
}

// null si la consulta falla (por ejemplo, la migración aún no está en la base):
// la revisión sigue sin este aviso. Electrificación no se compara con Calidad.
export async function listarReciboContraCalidad(
  supabase: SupabaseClient,
  tipo: TipoCualquierRecibo,
  reciboId: string
): Promise<RenglonContraCalidad[] | null> {
  if (tipo === "electrificacion") return [];
  const { data, error } = await supabase.rpc("recibo_contra_calidad", {
    p_tipo: tipo,
    p_recibo_id: reciboId,
  });
  if (error || !data) return null;
  return (data as FilaRpc[]).map((r) => ({
    renglonId: r.renglon_id,
    numero: Number(r.numero),
    modelo: r.modelo,
    descripcion: r.descripcion || null,
    esComponente: r.es_componente === true,
    cantidad: Number(r.cantidad),
    acumulado: Number(r.acumulado),
    aprobado: r.aprobado == null ? null : Number(r.aprobado),
  }));
}
