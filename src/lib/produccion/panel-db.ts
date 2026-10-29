import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { cargarFlujoMuebles } from "./flujo-db";
import { estadoMueble } from "./flujo-mueble";
import { MAX_IDS_PANEL, type MuebleDePanel } from "./panel";

interface FilaPanel {
  id: string;
  item_code: number;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number;
  unidad: string | null;
  liberado_en: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: {
      numero_pedido: string;
      orden_trabajo: string | null;
      proyectos: { nombre: string; cliente: string | null } | null;
    } | null;
  } | null;
}

// Los muebles padre liberados a producción de la versión activa de cada PM (sin los de la
// papelera, los cancelados ni los de PM cancelados o eliminados), cada uno con su flujo.
// Con `ids`, solo esos. Lee con la sesión de quien consulta: RLS decide qué ve.
export async function cargarMueblesDePanel(
  supabase: SupabaseClient,
  ids: string[] | null
): Promise<MuebleDePanel[]> {
  const filas = await paginarTodo<FilaPanel>(
    (desde, hasta) => {
      const base = supabase
        .from("planeacion_items")
        .select(
          "id, item_code, modelo, descripcion, cantidad_total, unidad, liberado_en, pedido_versiones!inner ( pedido_id, pedidos!inner ( numero_pedido, orden_trabajo, proyectos ( nombre, cliente ) ) )"
        )
        .eq("tipo_registro", "MO")
        .eq("estado_liberacion", "enviado_a_produccion")
        .is("eliminacion_solicitada_en", null)
        .or("estado_revision.is.null,estado_revision.neq.cancelado")
        .eq("pedido_versiones.es_version_activa", true)
        .is("pedido_versiones.pedidos.cancelado_en", null)
        .is("pedido_versiones.pedidos.eliminado_en", null)
        .is("pedido_versiones.pedidos.eliminado_definitivo_en", null);
      return (ids ? base.in("id", ids.slice(0, MAX_IDS_PANEL)) : base)
        .order("fila_excel_origen")
        .order("id")
        .range(desde, hasta)
        .returns<FilaPanel[]>();
    },
    { contexto: "los muebles liberados" }
  );

  const conPedido = filas.flatMap((f) =>
    f.pedido_versiones?.pedidos ? [{ fila: f, pedido: f.pedido_versiones.pedidos }] : []
  );
  const flujos = await cargarFlujoMuebles(
    supabase,
    conPedido.map((x) => ({ ...x.fila, pedido_id: x.fila.pedido_versiones?.pedido_id ?? null }))
  );

  return conPedido.map(({ fila, pedido }, i) => ({
    flujo: flujos[i],
    estado: estadoMueble(flujos[i]),
    descripcion: fila.descripcion,
    liberadoEn: fila.liberado_en,
    pedidoId: fila.pedido_versiones?.pedido_id ?? "",
    numeroPm: pedido.numero_pedido,
    ot: pedido.orden_trabajo,
    proyecto: pedido.proyectos?.nombre ?? null,
    // Como en Pedidos (clienteDe): sin espacios de más y en mayúsculas, para que no se parta el grupo.
    cliente: pedido.proyectos?.cliente?.replace(/\s+/g, " ").trim().toUpperCase() || null,
  }));
}
