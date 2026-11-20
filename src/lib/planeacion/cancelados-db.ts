// Lectura de lo cancelado y lo eliminado para las pantallas "Cancelados" de Planeación, Producción y Calidad.
//
// Antes cada pantalla pedía TODOS los pedidos y luego TODOS los muebles de todas sus versiones activas para
// quedarse con los pocos que tenían cancelaciones: con cientos de PM la dirección del `.in()` se volvía demasiado
// larga (falla) y la base corta cada respuesta en 1000 filas sin avisar (la lista quedaba incompleta). Aquí se
// leen solo los pedidos que de verdad tienen algo (cancelados, con muebles cancelados o con muebles en la papelera),
// todo paginado y con los `.in()` en lotes. Lanza ErrorLectura si una lectura falla: una lista incompleta engaña.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";

// Los `.in()` con cientos de ids rompen la URL: se piden en lotes.
export const IDS_POR_LOTE = 100;

export function enLotes<T>(items: T[], tamano = IDS_POR_LOTE): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) salida.push(items.slice(i, i + tamano));
  return salida;
}

export interface PedidoConVersiones {
  id: string;
  numero_pedido: string;
  created_at: string;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  eliminado_definitivo_en: string | null;
  proyectos: { nombre: string; cliente: string } | null;
  pedido_versiones: { id: string; numero_version: number; es_version_activa: boolean }[];
}

export interface ItemEstadoFila {
  id: string;
  item_code: number;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  pedido_version_id: string;
  estado_revision: string | null;
  motivo_cancelacion: string | null;
}

export interface ItemPapeleraFila {
  id: string;
  item_code: number;
  modelo: string | null;
  tipo_material: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  pedido_version_id: string;
  eliminacion_solicitada_en: string;
}

const COLUMNAS_PEDIDO =
  "id, numero_pedido, created_at, cancelado_en, motivo_cancelacion, eliminado_definitivo_en, proyectos ( nombre, cliente ), pedido_versiones ( id, numero_version, es_version_activa )";
const COLUMNAS_ITEM_ESTADO =
  "id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, pedido_version_id, estado_revision, motivo_cancelacion";
const COLUMNAS_ITEM_PAPELERA =
  "id, item_code, modelo, tipo_material, descripcion, cantidad_total, unidad, pedido_version_id, eliminacion_solicitada_en";

export interface OpcionesCancelados {
  // Solo cuenta los muebles que ya se enviaron a Producción (Calidad: lo que nunca llegó a su flujo no le interesa).
  soloLiberados?: boolean;
  // También trae los muebles que están en la papelera (Producción).
  incluirPapelera?: boolean;
}

export interface Cancelados {
  // Solo los pedidos con algo que mostrar, del más reciente al más antiguo.
  pedidos: PedidoConVersiones[];
  // Versión que cuenta de cada pedido: la activa o, si no hay, la más reciente.
  versionPorPedido: Map<string, string>;
  // TODOS los muebles de esas versiones (para saber cuántos están cancelados del total).
  itemsEstado: ItemEstadoFila[];
  itemsPapelera: ItemPapeleraFila[];
}

export function versionQueCuenta(p: Pick<PedidoConVersiones, "pedido_versiones">): string | null {
  const activa =
    p.pedido_versiones.find((v) => v.es_version_activa) ??
    [...p.pedido_versiones].sort((a, b) => b.numero_version - a.numero_version)[0];
  return activa?.id ?? null;
}

export async function cargarCancelados(supabase: SupabaseClient, opciones: OpcionesCancelados = {}): Promise<Cancelados> {
  const { soloLiberados = false, incluirPapelera = false } = opciones;

  // 1. Versiones que tienen muebles cancelados (o en la papelera): de ahí salen los pedidos con algo que mostrar.
  const versionesConMovimiento = new Set<string>();
  const cancelados = await paginarTodo<{ pedido_version_id: string }>(
    (desde, hasta) => {
      let q = supabase.from("planeacion_items").select("pedido_version_id").eq("estado_revision", "cancelado");
      if (soloLiberados) q = q.eq("estado_liberacion", "enviado_a_produccion");
      return q.order("id").range(desde, hasta).returns<{ pedido_version_id: string }[]>();
    },
    { contexto: "los muebles cancelados" }
  );
  for (const f of cancelados) versionesConMovimiento.add(f.pedido_version_id);
  if (incluirPapelera) {
    const enPapelera = await paginarTodo<{ pedido_version_id: string }>(
      (desde, hasta) =>
        supabase
          .from("planeacion_items")
          .select("pedido_version_id")
          .not("eliminacion_solicitada_en", "is", null)
          .order("id")
          .range(desde, hasta)
          .returns<{ pedido_version_id: string }[]>(),
      { contexto: "los muebles de la papelera" }
    );
    for (const f of enPapelera) versionesConMovimiento.add(f.pedido_version_id);
  }

  // 2. A qué pedidos pertenecen esas versiones.
  const pedidosConMovimiento = new Set<string>();
  for (const lote of enLotes([...versionesConMovimiento])) {
    const versiones = await paginarTodo<{ pedido_id: string }>(
      (desde, hasta) =>
        supabase
          .from("pedido_versiones")
          .select("pedido_id")
          .in("id", lote)
          .order("id")
          .range(desde, hasta)
          .returns<{ pedido_id: string }[]>(),
      { contexto: "las versiones de los pedidos" }
    );
    for (const v of versiones) pedidosConMovimiento.add(v.pedido_id);
  }

  // 3. Los pedidos cancelados enteros y los que tienen muebles con movimiento.
  const completos = await paginarTodo<PedidoConVersiones>(
    (desde, hasta) =>
      supabase
        .from("pedidos")
        .select(COLUMNAS_PEDIDO)
        .is("eliminado_en", null)
        .not("cancelado_en", "is", null)
        .order("created_at", { ascending: false })
        .order("id")
        .range(desde, hasta)
        .returns<PedidoConVersiones[]>(),
    { contexto: "los pedidos cancelados" }
  );
  const yaLeidos = new Set(completos.map((p) => p.id));
  const pedidos: PedidoConVersiones[] = [...completos];
  for (const lote of enLotes([...pedidosConMovimiento].filter((id) => !yaLeidos.has(id)))) {
    pedidos.push(
      ...(await paginarTodo<PedidoConVersiones>(
        (desde, hasta) =>
          supabase
            .from("pedidos")
            .select(COLUMNAS_PEDIDO)
            .is("eliminado_en", null)
            .in("id", lote)
            .order("created_at", { ascending: false })
            .order("id")
            .range(desde, hasta)
            .returns<PedidoConVersiones[]>(),
        { contexto: "los pedidos con muebles cancelados" }
      ))
    );
  }
  pedidos.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? -1 : 1));

  const versionPorPedido = new Map<string, string>();
  for (const p of pedidos) {
    const v = versionQueCuenta(p);
    if (v) versionPorPedido.set(p.id, v);
  }
  const versionIds = [...versionPorPedido.values()];

  // 4. Todos los muebles de las versiones que cuentan (y, aparte, los de la papelera).
  const itemsEstado: ItemEstadoFila[] = [];
  const itemsPapelera: ItemPapeleraFila[] = [];
  for (const lote of enLotes(versionIds)) {
    itemsEstado.push(
      ...(await paginarTodo<ItemEstadoFila>(
        (desde, hasta) => {
          let q = supabase.from("planeacion_items").select(COLUMNAS_ITEM_ESTADO).in("pedido_version_id", lote);
          if (soloLiberados) q = q.eq("estado_liberacion", "enviado_a_produccion");
          return q.order("id").range(desde, hasta).returns<ItemEstadoFila[]>();
        },
        { contexto: "los muebles de los pedidos cancelados" }
      ))
    );
    if (incluirPapelera) {
      itemsPapelera.push(
        ...(await paginarTodo<ItemPapeleraFila>(
          (desde, hasta) =>
            supabase
              .from("planeacion_items")
              .select(COLUMNAS_ITEM_PAPELERA)
              .in("pedido_version_id", lote)
              .not("eliminacion_solicitada_en", "is", null)
              .order("id")
              .range(desde, hasta)
              .returns<ItemPapeleraFila[]>(),
          { contexto: "los muebles de la papelera" }
        ))
      );
    }
  }
  // Lo más reciente primero, como antes (los lotes dejaron el orden por id).
  itemsPapelera.sort((a, b) => (a.eliminacion_solicitada_en < b.eliminacion_solicitada_en ? 1 : -1));

  return { pedidos, versionPorPedido, itemsEstado, itemsPapelera };
}
