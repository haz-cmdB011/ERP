import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import type { AsignacionResumen, Proceso } from "./asignaciones";
import { admiteElectrificacion } from "./electrificacion";
import { admiteSuperficieSolida } from "./superficie-solida";
import { disponibleDe, type MuebleFlujo } from "./flujo-mueble";
import { rutaSugerida } from "./ruta";
import { cargarRutas } from "./rutas-db";
import { cargarPartes } from "./partes-db";
import { revisionFinalActiva } from "@/lib/calidad/ajustes-flujo";
import { cargarRevisionFinal } from "@/lib/calidad/revision-final";

// Lo que el carrito necesita saber de la base sobre cada ítem que lleva.
export interface EstadoItemCarrito {
  // Dejó de servir para asignar: está en la papelera, cancelado, ya no es de la
  // versión activa del PM o el PM se canceló.
  vigente: boolean;
  liberado: boolean;
}

// Un mueble liberado del carrito, con lo que falta asignar de cada proceso
// (mismo formato que usa "Asignar varios a un equipo").
export interface MuebleCarrito {
  id: string;
  item_code: number;
  modelo: string | null;
  unidad: string | null;
  disponible: Record<Proceso, number>;
  listo: Record<Proceso, number>;
}

export interface DatosCarrito {
  estados: Record<string, EstadoItemCarrito>;
  muebles: MuebleCarrito[];
}

interface ItemFila {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  estado_liberacion: string;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
  pedido_versiones: {
    es_version_activa: boolean;
    pedidos: { cancelado_en: string | null; eliminado_en: string | null } | null;
  } | null;
}

// Estado real de los ítems del carrito y, de sus muebles liberados, lo que falta
// por asignar. Lee con la sesión de quien consulta: RLS decide qué ve.
export async function cargarDatosCarrito(
  supabase: SupabaseClient,
  itemIds: string[]
): Promise<DatosCarrito> {
  if (itemIds.length === 0) return { estados: {}, muebles: [] };

  const filas = await leer(
    supabase
      .from("planeacion_items")
      .select(
        "id, item_code, tipo_registro, modelo, descripcion, cantidad_total, unidad, estado_liberacion, eliminacion_solicitada_en, estado_revision, pedido_versiones ( es_version_activa, pedidos ( cancelado_en, eliminado_en ) )"
      )
      .in("id", itemIds)
      .returns<ItemFila[]>(),
    "los ítems del carrito"
  );

  const estados: Record<string, EstadoItemCarrito> = {};
  const asignables: ItemFila[] = [];
  for (const f of filas ?? []) {
    const pedido = f.pedido_versiones?.pedidos;
    const vigente =
      !!f.pedido_versiones?.es_version_activa &&
      !f.eliminacion_solicitada_en &&
      f.estado_revision !== "cancelado" &&
      !!pedido &&
      !pedido.cancelado_en &&
      !pedido.eliminado_en;
    const liberado = f.estado_liberacion === "enviado_a_produccion";
    estados[f.id] = { vigente, liberado };
    if (vigente && liberado && f.tipo_registro === "MO") asignables.push(f);
  }
  if (asignables.length === 0) return { estados, muebles: [] };

  const idsMuebles = asignables.map((m) => m.id);
  const [componentes, asignaciones, rutas, finalActiva, partes] = await Promise.all([
    // Electrificación y Superficie Sólida también se detectan por los componentes.
    leer(
      supabase
        .from("planeacion_items")
        .select("parent_item_id, descripcion")
        .in("parent_item_id", idsMuebles)
        .eq("tipo_registro", "FU")
        .returns<{ parent_item_id: string | null; descripcion: string | null }[]>(),
      "los componentes"
    ),
    leer(
      supabase
        .from("asignaciones_produccion_resumen")
        .select("*")
        .in("planeacion_item_id", idsMuebles)
        .returns<AsignacionResumen[]>(),
      "asignaciones_produccion_resumen"
    ),
    cargarRutas(supabase, idsMuebles),
    revisionFinalActiva(supabase),
    cargarPartes(supabase, idsMuebles),
  ]);
  const revisionFinal = finalActiva ? (await cargarRevisionFinal(supabase, idsMuebles)).resumen : null;

  const descripcionesHijos = new Map<string, string[]>();
  for (const c of componentes ?? []) {
    if (!c.parent_item_id || !c.descripcion) continue;
    const lista = descripcionesHijos.get(c.parent_item_id) ?? [];
    lista.push(c.descripcion);
    descripcionesHijos.set(c.parent_item_id, lista);
  }
  const porItem = new Map<string, AsignacionResumen[]>();
  for (const a of asignaciones ?? []) {
    if (!a.planeacion_item_id) continue;
    const lista = porItem.get(a.planeacion_item_id) ?? [];
    lista.push(a);
    porItem.set(a.planeacion_item_id, lista);
  }

  const muebles = asignables.map((m) => {
    const hijos = descripcionesHijos.get(m.id);
    const aplica: Record<Proceso, boolean> = {
      armado: true,
      barniz: true,
      electrificacion: admiteElectrificacion(m.descripcion, hijos),
      superficie_solida: admiteSuperficieSolida(m.descripcion, hijos),
    };
    const guardada = rutas.get(m.id);
    const flujo: MuebleFlujo = {
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
    };
    return {
      id: m.id,
      item_code: m.item_code,
      modelo: m.modelo,
      unidad: m.unidad,
      ...disponibleDe(flujo),
    };
  });

  return { estados, muebles };
}
