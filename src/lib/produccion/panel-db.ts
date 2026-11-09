import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { cargarFlujoMuebles } from "./flujo-db";
import { estadoMueble } from "./flujo-mueble";
import { MAX_IDS_PANEL, type MuebleDePanel, type TextoBuscableMueble } from "./panel";

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

// Un mueble liberado sin su flujo: lo que alcanza para filtrar por O.T. y buscar sin cargar
// asignaciones, rutas ni entregas.
export interface MuebleLiberado {
  fila: FilaPanel;
  pedidoId: string;
  numeroPm: string;
  ot: string | null;
  texto: TextoBuscableMueble;
}

// Los muebles padre liberados a producción de la versión activa de cada PM (sin los de la
// papelera, los cancelados ni los de PM cancelados o eliminados). Con `ids`, solo esos; con
// `lote`, los liberados en ese instante (`liberado_en`), sin límite de cantidad. Una fila
// por mueble: el flujo se carga aparte (cargarMueblesDePanel), solo de los que se necesitan.
// Lee con la sesión de quien consulta: RLS decide qué ve.
export async function listarLiberadosDePanel(
  supabase: SupabaseClient,
  { ids = null, lote = null }: { ids?: string[] | null; lote?: string | null } = {}
): Promise<MuebleLiberado[]> {
  const filas = await paginarTodo<FilaPanel>(
    (desde, hasta) => {
      let consulta = supabase
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
      if (ids) consulta = consulta.in("id", ids.slice(0, MAX_IDS_PANEL));
      else if (lote) consulta = consulta.eq("liberado_en", lote);
      return consulta.order("fila_excel_origen").order("id").range(desde, hasta).returns<FilaPanel[]>();
    },
    { contexto: "los muebles liberados" }
  );

  return filas.flatMap((fila) => {
    const pedido = fila.pedido_versiones?.pedidos;
    if (!pedido) return [];
    return [
      {
        fila,
        pedidoId: fila.pedido_versiones?.pedido_id ?? "",
        numeroPm: pedido.numero_pedido,
        ot: pedido.orden_trabajo,
        texto: {
          numeroPm: pedido.numero_pedido,
          ot: pedido.orden_trabajo,
          proyecto: pedido.proyectos?.nombre ?? null,
          // Como en Pedidos (clienteDe): sin espacios de más y en mayúsculas, para que no se parta el grupo.
          cliente: pedido.proyectos?.cliente?.replace(/\s+/g, " ").trim().toUpperCase() || null,
          modelo: fila.modelo,
          descripcion: fila.descripcion,
          itemCode: fila.item_code,
        },
      },
    ];
  });
}

// El flujo (ruta, asignaciones, avance) de los muebles que se le pasen, con su estado.
export async function cargarMueblesDePanel(
  supabase: SupabaseClient,
  liberados: MuebleLiberado[]
): Promise<MuebleDePanel[]> {
  const flujos = await cargarFlujoMuebles(
    supabase,
    liberados.map((x) => ({ ...x.fila, pedido_id: x.pedidoId || null }))
  );

  return liberados.map((x, i) => ({
    flujo: flujos[i],
    estado: estadoMueble(flujos[i]),
    descripcion: x.fila.descripcion,
    liberadoEn: x.fila.liberado_en,
    pedidoId: x.pedidoId,
    numeroPm: x.numeroPm,
    ot: x.ot,
    proyecto: x.texto.proyecto,
    cliente: x.texto.cliente,
  }));
}
