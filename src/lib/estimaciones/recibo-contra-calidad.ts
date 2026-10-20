// Lo cobrado en un recibo contra lo liberado para cobrar (función
// recibo_contra_calidad, ver supabase/migrations/20261014195109_cuadre_calidad_recibos.sql
// y 20261020181303_cobro_segun_produccion.sql). Lo liberado es lo que Producción
// verificó o, con el ajuste cobro_segun_produccion apagado, lo que aprobó Calidad.
// Es solo un aviso para quien revisa el recibo: no bloquea la revisión ni el pago
// y no le pide nada al maquilador. Si después se libera, el aviso desaparece solo
// porque se calcula al abrir el recibo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cobroSegunProduccion } from "@/lib/calidad/ajustes-flujo";
import type { BaseCobro } from "./pm-cobrado";
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
  // Lo que aprobó Calidad y lo que verificó Producción. null: no hay con qué
  // comparar (el mueble no pasó por Producción en el sistema o la variante no
  // está en el PM).
  aprobado: number | null;
  verificado: number | null;
  // El de los dos que manda según la base de cobro.
  liberado: number | null;
}

// Lo cobrado de más respecto a lo liberado (0 si no hay dato).
export function sinLiberar(l: Pick<RenglonContraCalidad, "acumulado" | "liberado">): number {
  return l.liberado == null ? 0 : Math.max(0, l.acumulado - l.liberado);
}

export interface ResumenContraCalidad {
  // Renglones cobrados por encima de lo liberado.
  conDiferencia: RenglonContraCalidad[];
  // Renglones comparados que sí concuerdan.
  cuadran: number;
  // Renglones que no se pudieron comparar.
  sinDato: number;
}

export function resumirContraCalidad(lineas: RenglonContraCalidad[]): ResumenContraCalidad {
  const conDiferencia = lineas.filter((l) => sinLiberar(l) > 0);
  const conDato = lineas.filter((l) => l.liberado != null);
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
  // Falta si la migración cobro_segun_produccion aún no está en la base.
  verificado?: number | string | null;
}

export interface ReciboContraCalidad {
  lineas: RenglonContraCalidad[];
  base: BaseCobro;
}

// null si la consulta falla (por ejemplo, la migración aún no está en la base):
// la revisión sigue sin este aviso. Electrificación no se compara.
export async function listarReciboContraCalidad(
  supabase: SupabaseClient,
  tipo: TipoCualquierRecibo,
  reciboId: string
): Promise<ReciboContraCalidad | null> {
  const base: BaseCobro = (await cobroSegunProduccion(supabase)) ? "produccion" : "calidad";
  if (tipo === "electrificacion") return { lineas: [], base };
  const { data, error } = await supabase.rpc("recibo_contra_calidad", {
    p_tipo: tipo,
    p_recibo_id: reciboId,
  });
  if (error || !data) return null;
  const lineas = (data as FilaRpc[]).map((r) => {
    const aprobado = r.aprobado == null ? null : Number(r.aprobado);
    const verificado = r.verificado == null ? null : Number(r.verificado);
    return {
      renglonId: r.renglon_id,
      numero: Number(r.numero),
      modelo: r.modelo,
      descripcion: r.descripcion || null,
      esComponente: r.es_componente === true,
      cantidad: Number(r.cantidad),
      acumulado: Number(r.acumulado),
      aprobado,
      verificado,
      liberado: base === "produccion" ? verificado : aprobado,
    };
  });
  return { lineas, base };
}
