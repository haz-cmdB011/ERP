import type { createClient } from "@/lib/supabase/server";
import { elegirPlanos, normalizarModelo } from "./modelo";

// Carpeta compartida de Ingeniería en la red de la empresa (en las PC suele
// estar conectada como I:, pero la letra cambia de una PC a otra: la ruta
// de red funciona en todas).
const RAIZ_PLANOS_RED = process.env.RAIZ_PLANOS_RED ?? "\\\\192.168.120.100\\ingenieria";

export interface PlanoLink {
  id: string;
  nombre_archivo: string;
  modelo_carpeta: string;
  cancelada: boolean;
  // PM de donde viene el plano cuando no es del mismo PM (modelo reutilizado).
  de_otro_pm: string | null;
  // Ruta de red completa del PDF, para abrirlo desde el servidor.
  ruta: string;
  paginas: number | null;
  especificacion: string | null;
  descripcion: string | null;
  dibujo: string | null;
  verifico: string | null;
  fecha_plano: string | null;
  escala: string | null;
  acabados: string[];
  notas: string[];
  error_lectura: string | null;
}

interface PlanoRow extends Omit<PlanoLink, "de_otro_pm" | "ruta"> {
  pm: string | null;
  anio: number;
  modelo_normalizado: string;
  ruta_origen: string;
}

const COLUMNAS =
  "id, pm, anio, modelo_carpeta, modelo_normalizado, cancelada, nombre_archivo, ruta_origen, paginas, especificacion, descripcion, dibujo, verifico, fecha_plano, escala, acabados, notas, error_lectura";

/**
 * Planos de Ingeniería de cada ítem (sincronizados por
 * scripts/planos/sincronizar-planos.mts), por id de ítem. Los hijos cuyo
 * modelo es el mismo que el de su padre no se repiten: el plano va en el padre.
 */
export async function getPlanosPorItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pm: string,
  items: { id: string; modelo: string | null; parent_item_id: string | null }[]
): Promise<Record<string, PlanoLink[]>> {
  const modeloPorId = new Map(items.map((i) => [i.id, i.modelo]));
  const conModelo = items.filter(
    (i) =>
      i.modelo &&
      normalizarModelo(i.modelo) !==
        normalizarModelo((i.parent_item_id && modeloPorId.get(i.parent_item_id)) || "")
  );
  if (conModelo.length === 0) return {};

  const claves = Array.from(new Set(conModelo.map((i) => normalizarModelo(i.modelo!))));
  const [{ data: delPm, error: errorPm }, { data: exactos, error: errorExactos }] = await Promise.all([
    supabase.from("planos").select(COLUMNAS).eq("pm", pm).returns<PlanoRow[]>(),
    supabase.from("planos").select(COLUMNAS).in("modelo_normalizado", claves).returns<PlanoRow[]>(),
  ]);
  // Sin la tabla o sin permisos: la página se muestra igual, solo sin planos.
  if (errorPm || errorExactos) return {};

  const candidatos = Array.from(
    new Map([...(delPm ?? []), ...(exactos ?? [])].map((p) => [p.id, p])).values()
  );

  const resultado: Record<string, PlanoLink[]> = {};
  for (const item of conModelo) {
    const { planos, deOtroPm } = elegirPlanos(item.modelo!, pm, candidatos);
    if (planos.length === 0) continue;
    resultado[item.id] = planos
      .sort(
        (a, b) =>
          a.modelo_carpeta.localeCompare(b.modelo_carpeta) ||
          a.nombre_archivo.localeCompare(b.nombre_archivo)
      )
      .map((p) => ({
        id: p.id,
        nombre_archivo: p.nombre_archivo,
        modelo_carpeta: p.modelo_carpeta,
        cancelada: p.cancelada,
        de_otro_pm: deOtroPm ? (p.pm ?? "otro proyecto") : null,
        ruta: `${RAIZ_PLANOS_RED}\\${p.ruta_origen}`,
        paginas: p.paginas,
        especificacion: p.especificacion,
        descripcion: p.descripcion,
        dibujo: p.dibujo,
        verifico: p.verifico,
        fecha_plano: p.fecha_plano,
        escala: p.escala,
        acabados: p.acabados,
        notas: p.notas,
        error_lectura: p.error_lectura,
      }));
  }
  return resultado;
}
