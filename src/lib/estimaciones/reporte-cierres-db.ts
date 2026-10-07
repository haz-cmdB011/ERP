// Cierre del reporte semanal (tabla reporte_semanal_cierres, ver
// supabase/migrations/20261007180000_cierre_reporte_semanal.sql): copia de lo
// reportado en una semana para detectar cambios posteriores.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorLectura } from "@/lib/supabase/paginar";
import type { InstantaneaSemana, ReciboCerrado } from "./reporte-control";
import type { Semana } from "./reporte-semanal";

export interface CierreSemana extends InstantaneaSemana {
  cerradoEn: string;
  cerradoPorCorreo: string | null;
}

interface FilaCierre {
  cerrado_en: string;
  cerrado_por_correo: string | null;
  num_recibos: number;
  importe: number | string;
  recibos: ReciboCerrado[];
}

// PostgREST responde PGRST205 (o Postgres 42P01) si la tabla aún no existe: la
// pantalla sigue funcionando sin la función de cierre hasta aplicar la migración.
function faltaLaTabla(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

export async function cargarCierre(
  supabase: SupabaseClient,
  semana: Semana
): Promise<{ disponible: boolean; cierre: CierreSemana | null }> {
  const { data, error } = await supabase
    .from("reporte_semanal_cierres")
    .select("cerrado_en, cerrado_por_correo, num_recibos, importe, recibos")
    .eq("anio", semana.anio)
    .eq("semana", semana.semana)
    .maybeSingle<FilaCierre>();
  if (error) {
    if (faltaLaTabla(error)) return { disponible: false, cierre: null };
    throw new ErrorLectura(`No se pudo leer el cierre de la semana: ${error.message}`);
  }
  if (!data) return { disponible: true, cierre: null };
  return {
    disponible: true,
    cierre: {
      cerradoEn: data.cerrado_en,
      cerradoPorCorreo: data.cerrado_por_correo,
      numRecibos: data.num_recibos,
      importe: Number(data.importe),
      recibos: data.recibos,
    },
  };
}

export async function cerrarSemana(
  supabase: SupabaseClient,
  semana: Semana,
  instantanea: InstantaneaSemana
): Promise<{ error: string | null }> {
  const { data: sesion } = await supabase.auth.getUser();
  const usuario = sesion.user;
  if (!usuario) return { error: "Tu sesión expiró. Vuelve a entrar." };
  const { error } = await supabase.from("reporte_semanal_cierres").insert({
    anio: semana.anio,
    semana: semana.semana,
    cerrado_por: usuario.id,
    cerrado_por_correo: usuario.email ?? null,
    num_recibos: instantanea.numRecibos,
    importe: instantanea.importe,
    recibos: instantanea.recibos,
  });
  if (!error) return { error: null };
  if (error.code === "23505") return { error: "Esta semana ya fue cerrada por otra persona." };
  if (error.code === "42501") return { error: "Solo el administrador de Estimaciones puede cerrar la semana." };
  return { error: error.message };
}

export async function reabrirSemana(
  supabase: SupabaseClient,
  semana: Semana
): Promise<{ error: string | null }> {
  const { error, count } = await supabase
    .from("reporte_semanal_cierres")
    .delete({ count: "exact" })
    .eq("anio", semana.anio)
    .eq("semana", semana.semana);
  if (error) return { error: error.message };
  // RLS no avisa cuando no deja borrar: simplemente no borra nada.
  if (!count) return { error: "Solo el administrador de Estimaciones puede reabrir la semana." };
  return { error: null };
}
