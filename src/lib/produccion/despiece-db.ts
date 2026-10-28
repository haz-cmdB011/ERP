import type { SupabaseClient } from "@supabase/supabase-js";
import { leer } from "@/lib/supabase/leer";
import { ErrorLectura } from "@/lib/supabase/paginar";
import {
  basePmDesdeJson,
  diferenciasConPm,
  lineasConComponenteCaido,
  lineasDesdeJson,
  sugerirDespiece,
  trasladarLineas,
  type HijoDespiece,
  type LineaDespiece,
  type SugerenciaDespiece,
  type VersionHistorial,
} from "./despiece";

export interface ItemDespiece {
  id: string;
  item_code: number;
  tipo_registro: "MO" | "FU";
  modelo: string | null;
  descripcion: string | null;
  tipo_material: string | null;
  unidad: string | null;
  cantidad_total: number;
  parent_item_id: string | null;
  eliminacion_solicitada_en: string | null;
  estado_revision: string | null;
  pedido_versiones: {
    pedido_id: string;
    es_version_activa: boolean;
    pedidos: {
      numero_pedido: string;
      cancelado_en: string | null;
      eliminado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    } | null;
  } | null;
}

// Lo que necesita el editor del despiece (salvo el permiso de quien edita).
export interface DatosDespiece {
  itemId: string;
  version: number;
  historial: VersionHistorial[];
  deVersionAnterior: { lineas: LineaDespiece[]; guardadoEn: string } | null;
  cambiosPm: string[];
  lineasCaidas: number[];
  muebles: number;
  unidadMueble: string | null;
  sugerencia: SugerenciaDespiece;
  guardado: { lineas: LineaDespiece[]; igualASugerencia: boolean; actualizadoEn: string } | null;
  // Por qué solo se puede ver (la base lo exige igual).
  motivoBloqueo: string | null;
  partesAsignadas: string[];
}

interface DespieceGuardado {
  lineas: unknown;
  igual_a_sugerencia: boolean;
  actualizado_en: string;
  version: number;
  base_pm: unknown;
}

interface FilaHistorial {
  version: number;
  lineas: unknown;
  igual_a_sugerencia: boolean;
  guardado_en: string;
}

interface DespiecePrevio {
  lineas: unknown;
  actualizado_en: string;
  planeacion_items: { id: string };
}

export async function leerItemDespiece(supabase: SupabaseClient, itemId: string): Promise<ItemDespiece | null> {
  return leer(
    supabase
      .from("planeacion_items")
      .select(
        "id, item_code, tipo_registro, modelo, descripcion, tipo_material, unidad, cantidad_total, parent_item_id, eliminacion_solicitada_en, estado_revision, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( numero_pedido, cancelado_en, eliminado_en, proyectos ( nombre, cliente ) ) )"
      )
      .eq("id", itemId)
      .maybeSingle<ItemDespiece>(),
    "planeacion_items"
  );
}

// Todo lo del despiece de un mueble (ítem padre): lo guardado, la sugerencia con los
// componentes (hijos) del PM, su historial y lo que cambió en el PM. Lo usan la página
// del despiece y el carrito (que lo abre en una ventana). Ver despiece.ts.
export async function cargarDespieceMueble(supabase: SupabaseClient, item: ItemDespiece): Promise<DatosDespiece> {
  const pedidoId = item.pedido_versiones?.pedido_id;
  const pedido = item.pedido_versiones?.pedidos;

  const [hijos, guardado] = await Promise.all([
    leer(
      supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, descripcion, tipo_material, unidad, cantidad_x_mueble, cantidad_total, fila_excel_origen, eliminacion_solicitada_en, estado_revision"
        )
        .eq("parent_item_id", item.id)
        .returns<HijoDespiece[]>(),
      "planeacion_items"
    ),
    leer(
      supabase
        .from("despieces_produccion")
        .select("lineas, igual_a_sugerencia, actualizado_en, version, base_pm")
        .eq("planeacion_item_id", item.id)
        .maybeSingle<DespieceGuardado>(),
      "despieces_produccion"
    ),
  ]);

  const sugerencia = sugerirDespiece(item, hijos ?? []);
  const lineasGuardadas = guardado ? lineasDesdeJson(guardado.lineas) : [];

  // Partes ya asignadas a un equipo: no se pueden quitar del despiece. Si la migración
  // despiece_por_partes todavía no está en la base (no existe la columna), no hay ninguna.
  const { data: asignadas, error: errorAsignadas } = await supabase
    .from("asignaciones_produccion")
    .select("parte_id")
    .eq("planeacion_item_id", item.id)
    .not("parte_id", "is", null)
    .is("cancelada_en", null)
    .returns<{ parte_id: string }[]>();
  if (errorAsignadas && errorAsignadas.code !== "42703") {
    throw new ErrorLectura(`No se pudo leer las partes asignadas: ${errorAsignadas.message}`);
  }
  const partesAsignadas = [...new Set((asignadas ?? []).map((a) => a.parte_id))];

  // Historial del despiece (las últimas versiones guardadas).
  let historial: VersionHistorial[] = [];
  if (guardado) {
    const filas = await leer(
      supabase
        .from("despieces_produccion_historial")
        .select("version, lineas, igual_a_sugerencia, guardado_en, despieces_produccion!inner ( planeacion_item_id )")
        .eq("despieces_produccion.planeacion_item_id", item.id)
        .order("version", { ascending: false })
        .limit(15)
        .returns<FilaHistorial[]>(),
      "despieces_produccion_historial"
    );
    historial = (filas ?? []).map((f) => ({
      version: f.version,
      guardadoEn: f.guardado_en,
      igualASugerencia: f.igual_a_sugerencia,
      lineas: lineasDesdeJson(f.lineas),
    }));
  }

  // Sin despiece en esta versión del PM: ¿hay uno de una versión anterior? Se ofrece
  // como punto de partida, con sus componentes vueltos a ligar por número de ítem.
  let deVersionAnterior: { lineas: LineaDespiece[]; guardadoEn: string } | null = null;
  if (!guardado && pedidoId) {
    const previos = await leer(
      supabase
        .from("despieces_produccion")
        .select(
          "lineas, actualizado_en, planeacion_items!inner ( id, item_code, pedido_versiones!inner ( pedido_id, es_version_activa ) )"
        )
        .eq("planeacion_items.item_code", item.item_code)
        .eq("planeacion_items.pedido_versiones.pedido_id", pedidoId)
        .eq("planeacion_items.pedido_versiones.es_version_activa", false)
        .order("actualizado_en", { ascending: false })
        .limit(1)
        .returns<DespiecePrevio[]>(),
      "despieces_produccion"
    );
    const previo = previos?.[0];
    if (previo) {
      const hijosAnteriores = await leer(
        supabase
          .from("planeacion_items")
          .select("id, item_code")
          .eq("parent_item_id", previo.planeacion_items.id)
          .returns<{ id: string; item_code: number }[]>(),
        "planeacion_items"
      );
      deVersionAnterior = {
        lineas: trasladarLineas(lineasDesdeJson(previo.lineas), hijosAnteriores ?? [], hijos ?? []),
        guardadoEn: previo.actualizado_en,
      };
    }
  }

  // Cambios del PM después de guardar el despiece.
  const cambiosPm = guardado ? diferenciasConPm(basePmDesdeJson(guardado.base_pm), item, hijos ?? []) : [];
  const lineasCaidas = guardado ? lineasConComponenteCaido(lineasGuardadas, hijos ?? []) : [];

  let motivoBloqueo: string | null = null;
  if (!item.pedido_versiones?.es_version_activa) {
    motivoBloqueo = "Este ítem es de una versión anterior del PM. El despiece se hace en la versión activa.";
  } else if (pedido?.cancelado_en || item.eliminacion_solicitada_en || item.estado_revision === "cancelado") {
    motivoBloqueo = "Este ítem o su PM está cancelado o eliminado.";
  }

  return {
    itemId: item.id,
    version: guardado?.version ?? 0,
    historial,
    deVersionAnterior,
    cambiosPm,
    lineasCaidas,
    muebles: Number(item.cantidad_total) || 0,
    unidadMueble: item.unidad,
    sugerencia,
    guardado: guardado
      ? {
          lineas: lineasGuardadas,
          igualASugerencia: guardado.igual_a_sugerencia,
          actualizadoEn: guardado.actualizado_en,
        }
      : null,
    motivoBloqueo,
    partesAsignadas,
  };
}
