import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import type { MuebleInicio } from "./inicio";
import { cargarMueblesDePanel } from "./panel-db";

interface FilaPedido {
  id: string;
  created_at: string;
}

interface FilaPorLiberar {
  id: string;
  modelo: string | null;
  descripcion: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: { numero_pedido: string; orden_trabajo: string | null } | null;
  } | null;
}

// Todos los muebles padre vigentes para el inicio: los liberados con su estado en el flujo
// (lo mismo que el panel de asignación) y los que siguen por liberar. Lee con la sesión de
// quien consulta: RLS decide qué ve.
export async function cargarMueblesInicio(supabase: SupabaseClient): Promise<MuebleInicio[]> {
  const [liberados, porLiberar, pedidos] = await Promise.all([
    cargarMueblesDePanel(supabase, null),
    paginarTodo<FilaPorLiberar>(
      (desde, hasta) =>
        supabase
          .from("planeacion_items")
          .select("id, modelo, descripcion, pedido_versiones!inner ( pedido_id, pedidos!inner ( numero_pedido, orden_trabajo ) )")
          .eq("tipo_registro", "MO")
          .eq("estado_liberacion", "pendiente")
          .is("eliminacion_solicitada_en", null)
          .or("estado_revision.is.null,estado_revision.neq.cancelado")
          .eq("pedido_versiones.es_version_activa", true)
          .is("pedido_versiones.pedidos.cancelado_en", null)
          .is("pedido_versiones.pedidos.eliminado_en", null)
          .is("pedido_versiones.pedidos.eliminado_definitivo_en", null)
          .order("id")
          .range(desde, hasta)
          .returns<FilaPorLiberar[]>(),
      { contexto: "los muebles por liberar" }
    ),
    // Cuándo se subió cada PM: el inicio muestra primero lo más reciente.
    paginarTodo<FilaPedido>(
      (desde, hasta) =>
        supabase
          .from("pedidos")
          .select("id, created_at")
          .is("eliminado_en", null)
          .order("id")
          .range(desde, hasta)
          .returns<FilaPedido[]>(),
      { contexto: "los pedidos" }
    ),
  ]);
  const creadoEn = new Map(pedidos.map((p) => [p.id, p.created_at]));

  return [
    ...porLiberar.flatMap((f) =>
      f.pedido_versiones?.pedidos
        ? [
            {
              id: f.id,
              modelo: f.modelo,
              descripcion: f.descripcion,
              estado: "por_liberar" as const,
              pedidoId: f.pedido_versiones.pedido_id,
              numeroPm: f.pedido_versiones.pedidos.numero_pedido,
              ot: f.pedido_versiones.pedidos.orden_trabajo,
              creadoEn: creadoEn.get(f.pedido_versiones.pedido_id) ?? "",
            },
          ]
        : []
    ),
    ...liberados.map((m) => {
      const subido = creadoEn.get(m.pedidoId) ?? "";
      return {
        id: m.flujo.id,
        modelo: m.flujo.modelo,
        descripcion: m.descripcion,
        estado: m.estado,
        pedidoId: m.pedidoId,
        numeroPm: m.numeroPm,
        ot: m.ot,
        creadoEn: subido,
        // Lo último que le pasó: liberarlo, asignarlo o entregar algo de él.
        actividad: [
          subido,
          m.liberadoEn,
          ...m.flujo.asignaciones.flatMap((a) => [a.creado_en, a.ultima_entrega]),
        ].reduce<string>((max, f) => (f && f > max ? f : max), ""),
      };
    }),
  ];
}
