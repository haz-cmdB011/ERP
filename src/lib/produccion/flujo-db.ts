import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { revisionFinalActiva } from "@/lib/calidad/ajustes-flujo";
import { cargarRevisionFinal } from "@/lib/calidad/revision-final";
import type { AsignacionResumen, Proceso } from "./asignaciones";
import { admiteElectrificacion } from "./electrificacion";
import { admiteSuperficieSolida } from "./superficie-solida";
import type { MuebleFlujo } from "./flujo-mueble";
import { cargarPartes } from "./partes-db";
import { rutaSugerida } from "./ruta";
import { cargarRutas } from "./rutas-db";
import { tandas } from "./tandas";

// Lo mínimo de un mueble padre (MO) para armar su flujo.
export interface MuebleBase {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number | string;
  unidad: string | null;
  // El PM del mueble: con él se arma el enlace a su despiece.
  pedido_id?: string | null;
}

// El flujo (ruta, asignaciones, partes, revisión final) de varios muebles a la vez, en el
// mismo orden en que llegan. Es lo que pintan la pantalla de asignaciones de un PM, el
// panel de asignación y el carrito. Lee con la sesión de quien consulta: RLS decide qué ve.
export async function cargarFlujoMuebles(
  supabase: SupabaseClient,
  muebles: MuebleBase[]
): Promise<MuebleFlujo[]> {
  if (muebles.length === 0) return [];
  const ids = muebles.map((m) => m.id);

  const [componentes, asignaciones, rutas, finalActiva, partes] = await Promise.all([
    // Electrificación y Superficie Sólida también se detectan por lo que dicen los componentes.
    Promise.all(
      tandas(ids, 25).map((lote) =>
        leer(
          supabase
            .from("planeacion_items")
            .select("parent_item_id, descripcion, eliminacion_solicitada_en, estado_revision")
            .in("parent_item_id", lote)
            .eq("tipo_registro", "FU")
            .returns<
              {
                parent_item_id: string | null;
                descripcion: string | null;
                eliminacion_solicitada_en: string | null;
                estado_revision: string | null;
              }[]
            >(),
          "los componentes"
        )
      )
    ),
    Promise.all(
      tandas(ids, 25).map((lote) =>
        leer(
          supabase
            .from("asignaciones_produccion_resumen")
            .select("*")
            .in("planeacion_item_id", lote)
            .order("fecha_asignacion")
            .order("creado_en")
            .returns<AsignacionResumen[]>(),
          "asignaciones_produccion_resumen"
        )
      )
    ),
    cargarRutas(supabase, ids),
    revisionFinalActiva(supabase),
    cargarPartes(supabase, ids),
  ]);

  // Revisión final de Calidad (ajuste revision_final): solo si está encendida.
  const revisionFinal = finalActiva
    ? new Map(
        (
          await Promise.all(tandas(ids).map((lote) => cargarRevisionFinal(supabase, lote)))
        ).flatMap((r) => [...r.resumen])
      )
    : null;

  const descripcionesHijos = new Map<string, string[]>();
  // Muebles con componentes vigentes: se asignan por su despiece.
  const conComponentes = new Set<string>();
  for (const c of componentes.flatMap((l) => l ?? [])) {
    if (c.parent_item_id && !c.eliminacion_solicitada_en && c.estado_revision !== "cancelado") {
      conComponentes.add(c.parent_item_id);
    }
    if (!c.parent_item_id || !c.descripcion) continue;
    const lista = descripcionesHijos.get(c.parent_item_id) ?? [];
    lista.push(c.descripcion);
    descripcionesHijos.set(c.parent_item_id, lista);
  }
  const porItem = new Map<string, AsignacionResumen[]>();
  for (const a of asignaciones.flatMap((l) => l ?? [])) {
    if (!a.planeacion_item_id) continue;
    const lista = porItem.get(a.planeacion_item_id) ?? [];
    lista.push(a);
    porItem.set(a.planeacion_item_id, lista);
  }

  return muebles.map((m) => {
    const hijos = descripcionesHijos.get(m.id);
    // Electrificación y Superficie Sólida solo si el mueble o sus componentes las llevan.
    const aplica: Record<Proceso, boolean> = {
      armado: true,
      barniz: true,
      electrificacion: admiteElectrificacion(m.descripcion, hijos),
      superficie_solida: admiteSuperficieSolida(m.descripcion, hijos),
    };
    // La ruta guardada o, si aún no tiene, la sugerida.
    const guardada = rutas.get(m.id);
    return {
      id: m.id,
      item_code: m.item_code,
      modelo: m.modelo,
      unidad: m.unidad,
      cantidad: Number(m.cantidad_total),
      aplica,
      ruta: guardada && guardada.pasos.length > 0 ? guardada.pasos : rutaSugerida(aplica),
      versionRuta: guardada?.version ?? 0,
      asignaciones: porItem.get(m.id) ?? [],
      revisionFinal: revisionFinal ? { aprobadas: revisionFinal.get(m.id)?.aprobadas ?? 0 } : null,
      partes: partes.get(m.id) ?? [],
      conComponentes: conComponentes.has(m.id),
      despieceHref: m.pedido_id ? `/produccion/pedidos/${m.pedido_id}/despiece/${m.id}` : null,
    };
  });
}
