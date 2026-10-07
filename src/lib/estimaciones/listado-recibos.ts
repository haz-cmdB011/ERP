// Todos los recibos de maquila juntos (Acabados y Armado viven en `recibos`,
// Electrificación en sus propias tablas), ordenados por folio. Para el
// personal de Estimaciones RLS devuelve todos; al maquilador solo los suyos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { compararFolios, listarRecibos, type EstadoRecibo, type ReciboResumen } from "./recibos-db";
import { listarRecibosElectrificacion } from "./recibos-electrificacion-db";
import type { TipoCualquierRecibo } from "./revision-db";

export type ReciboListado = Omit<ReciboResumen, "tipo"> & { tipo: TipoCualquierRecibo };

export const ESTADOS_FILTRO = ["pendiente", "revisado", "pagado", "cancelado"] as const;

export function esEstadoRecibo(s: string | undefined): s is EstadoRecibo {
  return !!s && (ESTADOS_FILTRO as readonly string[]).includes(s);
}

interface FilaResumen {
  id: string;
  tipo: TipoCualquierRecibo;
  estado: EstadoRecibo;
  folio: string;
  fecha_recibo: string;
  contratista: string;
  obra: string | null;
  ot: string | null;
  prioridad: string;
  creado_en: string;
  num_renglones: number;
  num_pendientes: number;
  total_propuesto: number | string;
  total_aceptado: number | string;
}

export function aReciboListado(f: FilaResumen): ReciboListado {
  return {
    id: f.id,
    estado: f.estado,
    tipo: f.tipo,
    folio: f.folio,
    fecha: f.fecha_recibo,
    contratista: f.contratista,
    obra: f.obra ?? "",
    ot: f.ot ?? "",
    prioridad: f.prioridad,
    guardadoEn: f.creado_en,
    numRenglones: Number(f.num_renglones),
    numPendientes: Number(f.num_pendientes),
    totalPropuesto: Number(f.total_propuesto),
    totalAceptado: Number(f.total_aceptado),
  };
}

// Vista `recibos_resumen` (migración 20261007120000): una fila por recibo con los
// totales ya calculados. null si la vista aún no existe en la base; cualquier
// otro fallo se lanza.
async function listarDesdeVista(supabase: SupabaseClient): Promise<ReciboListado[] | null> {
  const { error: sonda } = await supabase.from("recibos_resumen").select("id").limit(1);
  if (sonda) {
    const falta = sonda.code === "42P01" || sonda.code === "PGRST205" || /recibos_resumen/.test(sonda.message);
    if (falta) return null;
    throw new Error(`No se pudo leer los recibos: ${sonda.message}`);
  }
  const filas = await paginarTodo<FilaResumen>(
    (desde, hasta) =>
      supabase
        .from("recibos_resumen")
        .select("*")
        .order("creado_en", { ascending: false })
        .order("id")
        .range(desde, hasta)
        .returns<FilaResumen[]>(),
    { contexto: "los recibos" }
  );
  return filas.map(aReciboListado);
}

export function ordenarPorFolio<T extends { folio: string; tipo: string }>(recibos: T[]): T[] {
  return [...recibos].sort((a, b) => compararFolios(a.folio, b.folio) || a.tipo.localeCompare(b.tipo));
}

// Lanza si falla la lectura. Usa la vista si existe; si no, el cálculo anterior
// (todos los recibos con sus renglones anidados).
export async function listarTodosLosRecibos(supabase: SupabaseClient): Promise<ReciboListado[]> {
  const desdeVista = await listarDesdeVista(supabase);
  if (desdeVista) return ordenarPorFolio(desdeVista);
  const [acabadosArmado, electrificacion] = await Promise.all([
    listarRecibos(supabase),
    listarRecibosElectrificacion(supabase),
  ]);
  return ordenarPorFolio([...acabadosArmado, ...electrificacion]);
}
