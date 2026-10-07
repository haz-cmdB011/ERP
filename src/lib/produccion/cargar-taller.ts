import type { createClient } from "@/lib/supabase/server";
import { plazoDePedido, type AsignacionTaller, type Plazo } from "./atrasos";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// PostgREST devuelve máximo 1000 filas por consulta: se pide por páginas.
const PAGINA = 1000;
// Ids por consulta .in(): más largos pasarían el límite de tamaño de la URL.
const LOTE_IDS = 100;

const COLUMNAS_TALLER =
  "id, pedido_id, numero_pedido, item_code, modelo, descripcion, unidad, equipo_id, equipo, proceso, cantidad, entregado, fecha_asignacion, estado";

// Todas las asignaciones que siguen en el taller (en proceso o con entrega
// parcial). Ante un error devuelve lo que alcanzó a leer: es un resumen y no
// debe tumbar la pantalla donde se muestra.
export async function asignacionesEnTaller(supabase: Supabase): Promise<AsignacionTaller[]> {
  const filas: AsignacionTaller[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase
      .from("asignaciones_produccion_resumen")
      .select(COLUMNAS_TALLER)
      .in("estado", ["en_proceso", "parcial"])
      .order("fecha_asignacion")
      .order("id")
      .range(desde, desde + PAGINA - 1)
      .returns<AsignacionTaller[]>();
    if (error || !data) break;
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas;
}

interface FilaPedidoFecha {
  id: string;
  fecha_entrega: string | null;
  cancelado_en: string | null;
  eliminado_en: string | null;
  eliminado_definitivo_en: string | null;
}

// Plazo de un PM junto con su fecha de entrega (para mostrarla en un tooltip).
export type PlazoConFecha = Plazo & { fecha: string | null };

// Plazo de entrega de cada PM dado (por id). Un PM cancelado o eliminado no
// tiene plazo: ya no se espera ese trabajo.
export async function plazosDePedidos(
  supabase: Supabase,
  pedidoIds: string[],
  hoy: string
): Promise<Map<string, PlazoConFecha>> {
  const unicos = [...new Set(pedidoIds)];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += LOTE_IDS) lotes.push(unicos.slice(i, i + LOTE_IDS));

  const respuestas = await Promise.all(
    lotes.map((ids) =>
      supabase
        .from("pedidos")
        .select("id, fecha_entrega, cancelado_en, eliminado_en, eliminado_definitivo_en")
        .in("id", ids)
        .returns<FilaPedidoFecha[]>()
    )
  );

  const plazos = new Map<string, PlazoConFecha>();
  for (const { data } of respuestas) {
    for (const p of data ?? []) {
      const sinTrabajo = p.cancelado_en || p.eliminado_en || p.eliminado_definitivo_en;
      plazos.set(p.id, {
        ...(sinTrabajo ? ({ tipo: "sin-fecha" } as const) : plazoDePedido(p.fecha_entrega, hoy)),
        fecha: p.fecha_entrega,
      });
    }
  }
  return plazos;
}

// Asignaciones en taller junto con el plazo de su PM.
export async function cargarTaller(
  supabase: Supabase,
  hoy: string
): Promise<{ asignaciones: AsignacionTaller[]; plazos: Map<string, PlazoConFecha> }> {
  const asignaciones = await asignacionesEnTaller(supabase);
  const plazos = await plazosDePedidos(
    supabase,
    asignaciones.map((a) => a.pedido_id).filter((id): id is string => !!id),
    hoy
  );
  return { asignaciones, plazos };
}
