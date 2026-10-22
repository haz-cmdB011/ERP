import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import type { Proceso } from "./asignaciones";
import { disponibleDe } from "./flujo-mueble";
import { cargarFlujoMuebles } from "./flujo-db";

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

  const flujos = await cargarFlujoMuebles(supabase, asignables);
  const muebles = flujos.map((m) => ({
    id: m.id,
    item_code: m.item_code,
    modelo: m.modelo,
    unidad: m.unidad,
    ...disponibleDe(m),
  }));

  return { estados, muebles };
}
