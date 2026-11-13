// Lectura de los recibos por llegar (lógica en por-llegar.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarOtContraCobrado } from "./pm-cobrado";
import { cargarHistoricoDb } from "./recibos-db";
import { HISTORICO, type RenglonHistorico } from "./datos-acabados";
import {
  mueblesEnCalidad,
  renglonesPorLlegar,
  resumirPorArea,
  type FilaMuebleEnCalidad,
  type MuebleEnCalidad,
  type RenglonPorLlegar,
  type ResumenArea,
} from "./por-llegar";

export interface RecibosPorLlegar {
  renglones: RenglonPorLlegar[];
  resumen: ResumenArea[];
  muebles: MuebleEnCalidad[];
  // Lo que no se pudo leer: la vista previa sale incompleta pero sale.
  avisos: string[];
  // No se pudo leer lo aprobado: sin eso no hay vista previa.
  error: string | null;
}

interface FilaMueblesRpc {
  ot: string;
  planeacion_item_id: string;
  item_code: string | null;
  modelo: string;
  descripcion: string | null;
  cantidad: number;
  proceso: string;
  parte_id: string | null;
  parte: string | null;
  piezas_por_mueble: number;
  entregadas: number;
  aprobadas: number;
  veces: number;
  final_aprobadas: number;
}

export async function cargarRecibosPorLlegar(supabase: SupabaseClient): Promise<RecibosPorLlegar> {
  const avisos: string[] = [];
  const historico = (tipo: "acabados" | "armado") =>
    cargarHistoricoDb(supabase, tipo, { soloPagados: true }).catch(() => {
      avisos.push(`No se pudo leer el histórico de precios de ${tipo === "acabados" ? "Acabados" : "Armado"}.`);
      return [] as RenglonHistorico[];
    });
  const [cobrado, acabados, armado, enCalidad] = await Promise.all([
    cargarOtContraCobrado(supabase),
    historico("acabados"),
    historico("armado"),
    supabase.rpc("muebles_en_calidad"),
  ]);

  if (enCalidad.error) {
    // PGRST202: la función no existe (falta aplicar la migración muebles_en_calidad).
    avisos.push(
      enCalidad.error.code === "PGRST202"
        ? "Lo entregado a Calidad todavía no está disponible: falta aplicar la migración muebles_en_calidad."
        : "No se pudo leer lo entregado a Calidad."
    );
  }
  const filasCalidad = ((enCalidad.data ?? []) as FilaMueblesRpc[]).map(
    (r): FilaMuebleEnCalidad => ({
      ot: r.ot,
      itemId: r.planeacion_item_id,
      itemCodigo: r.item_code,
      modelo: r.modelo,
      descripcion: r.descripcion,
      cantidad: Number(r.cantidad),
      proceso: r.proceso,
      parteId: r.parte_id,
      parte: r.parte,
      piezasPorMueble: Number(r.piezas_por_mueble),
      entregadas: Number(r.entregadas),
      aprobadas: Number(r.aprobadas),
      veces: Number(r.veces),
      finalAprobadas: Number(r.final_aprobadas),
    })
  );

  if (cobrado.error) {
    const muebles = mueblesEnCalidad(filasCalidad, [], []);
    return { renglones: [], resumen: resumirPorArea([], muebles), muebles, avisos, error: cobrado.error };
  }
  // Acabados también usa el histórico base (de Excel), como la captura.
  const renglones = renglonesPorLlegar(cobrado.filas, { acabados: [...HISTORICO, ...acabados], armado });
  const muebles = mueblesEnCalidad(filasCalidad, cobrado.filas, renglones);
  return { renglones, resumen: resumirPorArea(renglones, muebles), muebles, avisos, error: null };
}
