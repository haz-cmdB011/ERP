// Lectura de las cosas detenidas (ver detenidos.ts). Solo trae el instante en
// que cada cosa empezó a esperar, de lo vigente (mueble y PM no cancelados ni
// eliminados). Lanza ErrorLectura si una consulta falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import {
  DIAS_SIN_EVALUAR_LOTE,
  DIAS_SIN_REASIGNAR,
  DIAS_SIN_VERIFICAR,
  contarPendientes,
  type Detenidos,
} from "./detenidos";

export async function cargarDetenidos(supabase: SupabaseClient, hoy: string): Promise<Detenidos> {
  const [porVerificar, porEvaluar, porReasignar] = await Promise.all([
    paginarTodo<{ registrado_en: string }>(
      (desde, hasta) =>
        supabase
          .from("entregas_por_verificar")
          .select("registrado_en")
          .eq("vigente", true)
          .order("entrega_id")
          .range(desde, hasta)
          .returns<{ registrado_en: string }[]>(),
      { contexto: "las entregas por verificar" }
    ),
    paginarTodo<{ verificada_en: string }>(
      (desde, hasta) =>
        supabase
          .from("lotes_calidad")
          .select("verificada_en")
          .eq("vigente", true)
          .gt("pendiente", 0)
          .order("entrega_id")
          .range(desde, hasta)
          .returns<{ verificada_en: string }[]>(),
      { contexto: "los lotes por evaluar" }
    ),
    paginarTodo<{ elaborado_en: string }>(
      (desde, hasta) =>
        supabase
          .from("rechazos_calidad")
          .select("elaborado_en")
          .eq("vigente", true)
          .gt("por_reasignar", 0)
          .order("informe_id")
          .range(desde, hasta)
          .returns<{ elaborado_en: string }[]>(),
      { contexto: "los rechazos por reasignar" }
    ),
  ]);

  return {
    sinVerificar: contarPendientes(porVerificar.map((e) => e.registrado_en), DIAS_SIN_VERIFICAR, hoy),
    sinEvaluar: contarPendientes(porEvaluar.map((l) => l.verificada_en), DIAS_SIN_EVALUAR_LOTE, hoy),
    sinReasignar: contarPendientes(porReasignar.map((r) => r.elaborado_en), DIAS_SIN_REASIGNAR, hoy),
  };
}
