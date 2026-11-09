import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { procesosDeMueble, type MuebleInicio, type TipoActividad } from "./inicio";
import { cargarMueblesDePanel, listarLiberadosDePanel } from "./panel-db";
import { partesParaEntrega } from "./entregas-partes";
import type { MuebleDePanel } from "./panel";

interface FilaPedido {
  id: string;
  created_at: string;
}

interface FilaPorLiberar {
  id: string;
  modelo: string | null;
  descripcion: string | null;
  cantidad_total: number | string | null;
  unidad: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: { numero_pedido: string; orden_trabajo: string | null } | null;
  } | null;
}

// Todos los muebles padre vigentes para el inicio: los liberados con su estado en el flujo
// (lo mismo que el panel de asignación) y los que siguen por liberar. Lee con la sesión de
// quien consulta: RLS decide qué ve.
export async function cargarMueblesInicio(supabase: SupabaseClient): Promise<MuebleInicio[]> {
  const [liberados, porLiberar, creadoEn] = await Promise.all([
    listarLiberadosDePanel(supabase).then((l) => cargarMueblesDePanel(supabase, l)),
    paginarTodo<FilaPorLiberar>(
      (desde, hasta) =>
        supabase
          .from("planeacion_items")
          .select("id, modelo, descripcion, cantidad_total, unidad, pedido_versiones!inner ( pedido_id, pedidos!inner ( numero_pedido, orden_trabajo ) )")
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
    cargarFechasDePedidos(supabase),
  ]);

  return [
    ...porLiberar.flatMap((f) =>
      f.pedido_versiones?.pedidos
        ? [
            {
              id: f.id,
              modelo: f.modelo,
              descripcion: f.descripcion,
              cantidad: Number(f.cantidad_total ?? 0),
              unidad: f.unidad,
              estado: "por_liberar" as const,
              pedidoId: f.pedido_versiones.pedido_id,
              numeroPm: f.pedido_versiones.pedidos.numero_pedido,
              ot: f.pedido_versiones.pedidos.orden_trabajo,
              creadoEn: creadoEn.get(f.pedido_versiones.pedido_id) ?? "",
            },
          ]
        : []
    ),
    ...liberados.map((m) => muebleInicioDeLiberado(m, creadoEn)),
  ];
}

// Cuándo se subió cada PM (por id): el inicio y el panel muestran primero lo más reciente.
export async function cargarFechasDePedidos(supabase: SupabaseClient): Promise<Map<string, string>> {
  const pedidos = await paginarTodo<FilaPedido>(
    (desde, hasta) =>
      supabase
        .from("pedidos")
        .select("id, created_at")
        .is("eliminado_en", null)
        .order("id")
        .range(desde, hasta)
        .returns<FilaPedido[]>(),
    { contexto: "los pedidos" }
  );
  return new Map(pedidos.map((p) => [p.id, p.created_at]));
}

// Un mueble liberado como lo cuenta el inicio, con lo último que le pasó: liberarlo, asignarlo
// o entregar algo de él.
export function muebleInicioDeLiberado(m: MuebleDePanel, creadoEn: Map<string, string>): MuebleInicio {
  const subido = creadoEn.get(m.pedidoId) ?? "";
  return {
    id: m.flujo.id,
    modelo: m.flujo.modelo,
    descripcion: m.descripcion,
    cantidad: m.flujo.cantidad,
    unidad: m.flujo.unidad,
    estado: m.estado,
    pedidoId: m.pedidoId,
    numeroPm: m.numeroPm,
    ot: m.ot,
    creadoEn: subido,
    procesos: procesosDeMueble(m.flujo),
    entregaPorPartes: m.flujo.asignaciones.filter((a) => partesParaEntrega(m.flujo, a, undefined)).map((a) => a.id),
    ...ultimaActividad([
      [subido, "pm"],
      [m.liberadoEn, "liberacion"],
      ...m.flujo.asignaciones.flatMap<[string | null | undefined, TipoActividad]>((a) => [
        [a.creado_en, "asignacion"],
        [a.ultima_entrega, "entrega"],
      ]),
    ]),
  };
}

// Lo más reciente de una lista de movimientos (fecha y de qué fue); si ninguno tiene fecha, vacío.
function ultimaActividad(
  movimientos: [string | null | undefined, TipoActividad][]
): { actividad: string; actividadTipo: TipoActividad } {
  let mejor: { actividad: string; actividadTipo: TipoActividad } = { actividad: "", actividadTipo: "pm" };
  for (const [fecha, tipo] of movimientos) {
    if (fecha && fecha > mejor.actividad) mejor = { actividad: fecha, actividadTipo: tipo };
  }
  return mejor;
}
