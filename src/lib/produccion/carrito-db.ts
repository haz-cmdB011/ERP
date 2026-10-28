import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import type { Proceso } from "./asignaciones";
import { disponibleDe, seAsignaCompleto } from "./flujo-mueble";
import { cargarFlujoMuebles } from "./flujo-db";
import { tandas } from "./tandas";

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

// El despiece de un mueble del carrito: cuántos componentes vigentes tiene en el PM y
// cuántas partes tiene su despiece guardado (0 = aún no se hace).
export interface DespieceCarrito {
  componentes: number;
  partes: number;
}

export interface DatosCarrito {
  estados: Record<string, EstadoItemCarrito>;
  muebles: MuebleCarrito[];
  // Por mueble vigente del carrito (liberado o no).
  despieces: Record<string, DespieceCarrito>;
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
  if (itemIds.length === 0) return { estados: {}, muebles: [], despieces: {} };

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
  const mueblesVigentes: string[] = [];
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
    if (vigente && f.tipo_registro === "MO") mueblesVigentes.push(f.id);
    if (vigente && liberado && f.tipo_registro === "MO") asignables.push(f);
  }

  const [flujos, despieces] = await Promise.all([
    cargarFlujoMuebles(supabase, asignables),
    cargarDespieces(supabase, mueblesVigentes),
  ]);
  // Uno que se asigna por partes sigue en la lista (para abrirlo en el panel) pero sin nada
  // que asignar completo: sus partes se asignan desde la tabla del despiece.
  const muebles = flujos.map((m) => {
    const d = disponibleDe(m);
    const vacio = Object.fromEntries(Object.keys(d.disponible).map((p) => [p, 0])) as typeof d.disponible;
    return {
      id: m.id,
      item_code: m.item_code,
      modelo: m.modelo,
      unidad: m.unidad,
      ...(seAsignaCompleto(m) ? d : { disponible: vacio, listo: vacio }),
    };
  });

  return { estados, muebles, despieces };
}

// Componentes vigentes de cada mueble (los que piden despiece) y las partes de su despiece guardado.
async function cargarDespieces(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, DespieceCarrito>> {
  if (ids.length === 0) return {};
  const [componentes, guardados] = await Promise.all([
    Promise.all(
      tandas(ids, 25).map((lote) =>
        leer(
          supabase
            .from("planeacion_items")
            .select("parent_item_id")
            .in("parent_item_id", lote)
            .eq("tipo_registro", "FU")
            .is("eliminacion_solicitada_en", null)
            .or("estado_revision.is.null,estado_revision.neq.cancelado")
            .returns<{ parent_item_id: string }[]>(),
          "los componentes"
        )
      )
    ),
    Promise.all(
      tandas(ids).map((lote) =>
        leer(
          supabase
            .from("despieces_produccion")
            .select("planeacion_item_id, lineas")
            .in("planeacion_item_id", lote)
            .returns<{ planeacion_item_id: string; lineas: unknown }[]>(),
          "despieces_produccion"
        )
      )
    ),
  ]);
  const resultado: Record<string, DespieceCarrito> = Object.fromEntries(
    ids.map((id) => [id, { componentes: 0, partes: 0 }])
  );
  for (const c of componentes.flatMap((l) => l ?? [])) resultado[c.parent_item_id].componentes += 1;
  for (const d of guardados.flatMap((l) => l ?? [])) {
    resultado[d.planeacion_item_id].partes = Array.isArray(d.lineas) ? d.lineas.length : 0;
  }
  return resultado;
}
