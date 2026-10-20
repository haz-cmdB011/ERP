// Lecturas de Calidad para el panel y la bandeja de lotes por evaluar. Todas lanzan
// (ErrorLectura) si una consulta falla: un número a medias engaña.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { resumirCalidad, type InformeBasico, type ItemLiberado, type ResumenCalidad } from "./resumen";
import { lotesPorEvaluar, normalizarLote, type LoteCalidad } from "./lotes";
import { enTallerParaCalidad, listosParaCalidad } from "./estado-item";
import { verificacionProduccionActiva } from "./ajustes-flujo";
import { cargarMueblesPreaprobados } from "./preaprobados-db";

interface FilaItem {
  id: string;
  tipo_registro: "MO" | "FU";
  parent_item_id: string | null;
  liberado_en: string | null;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: { eliminado_en: string | null; eliminado_definitivo_en: string | null; cancelado_en: string | null } | null;
  } | null;
}

export interface ResumenCalidadConTaller extends ResumenCalidad {
  // Ítems de cada pedido que siguen en taller (Calidad los ve, pero abajo y sin
  // contar como pendientes).
  enTallerPorPedido: Map<string, number>;
}

// Resumen vigente: ítems enviados a producción de la versión activa de pedidos
// no cancelados ni eliminados, y todos los informes. Los números cuentan solo lo
// que está listo para Calidad: con la verificación de Producción activa, los
// muebles preaprobados (y sus componentes) y lo que ya tiene informes. Lo demás
// va aparte, por pedido, como "en taller".
export async function cargarResumenCalidad(
  supabase: SupabaseClient,
  ahora = new Date()
): Promise<ResumenCalidadConTaller> {
  const filas = await paginarTodo<FilaItem>(
    (desde, hasta) =>
      supabase
        .from("planeacion_items")
        .select(
          "id, tipo_registro, parent_item_id, liberado_en, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( eliminado_en, eliminado_definitivo_en, cancelado_en ) )"
        )
        .eq("estado_liberacion", "enviado_a_produccion")
        .eq("pedido_versiones.es_version_activa", true)
        .order("id")
        .range(desde, hasta)
        .returns<FilaItem[]>(),
    { contexto: "los ítems liberados" }
  );
  const candidatos: (ItemLiberado & Pick<FilaItem, "tipo_registro" | "parent_item_id">)[] = [];
  for (const f of filas) {
    const pedido = f.pedido_versiones?.pedidos;
    if (!f.pedido_versiones || !pedido) continue;
    if (pedido.eliminado_en || pedido.eliminado_definitivo_en || pedido.cancelado_en) continue;
    if (f.estado_revision === "cancelado" || f.eliminacion_solicitada_en) continue;
    candidatos.push({
      id: f.id,
      pedidoId: f.pedido_versiones.pedido_id,
      liberadoEn: f.liberado_en,
      tipo_registro: f.tipo_registro,
      parent_item_id: f.parent_item_id,
    });
  }

  const [informes, preaprobados, verificacionActiva] = await Promise.all([
    paginarTodo<{ planeacion_item_id: string; aprobado: boolean; elaborado_en: string }>(
      (desde, hasta) =>
        supabase
          .from("informes_calidad")
          .select("planeacion_item_id, aprobado, elaborado_en")
          .order("id")
          .range(desde, hasta)
          .returns<{ planeacion_item_id: string; aprobado: boolean; elaborado_en: string }[]>(),
      { contexto: "los informes de calidad" }
    ),
    cargarMueblesPreaprobados(supabase),
    verificacionProduccionActiva(supabase),
  ]);
  const listos = listosParaCalidad(
    candidatos,
    preaprobados,
    new Set(informes.map((i) => i.planeacion_item_id)),
    verificacionActiva
  );
  const enTaller = enTallerParaCalidad(candidatos, listos);
  const enTallerPorPedido = new Map<string, number>();
  for (const c of candidatos) {
    if (enTaller.has(c.id)) enTallerPorPedido.set(c.pedidoId, (enTallerPorPedido.get(c.pedidoId) ?? 0) + 1);
  }
  const items: ItemLiberado[] = candidatos
    .filter((c) => listos.has(c.id))
    .map(({ id, pedidoId, liberadoEn }) => ({ id, pedidoId, liberadoEn }));
  const basicos: InformeBasico[] = informes.map((i) => ({
    itemId: i.planeacion_item_id,
    aprobado: i.aprobado,
    elaboradoEn: i.elaborado_en,
  }));
  return { ...resumirCalidad(items, basicos, ahora), enTallerPorPedido };
}

// Lotes que Calidad tiene que evaluar (entregas verificadas por Producción con
// piezas pendientes, de muebles y PM vigentes), del más antiguo al más nuevo.
export async function cargarLotesPorEvaluar(supabase: SupabaseClient): Promise<LoteCalidad[]> {
  const filas = await paginarTodo<LoteCalidad>(
    (desde, hasta) =>
      supabase
        .from("lotes_calidad")
        .select("*")
        .eq("vigente", true)
        .gt("pendiente", 0)
        .order("verificada_en")
        .order("entrega_id")
        .range(desde, hasta)
        .returns<LoteCalidad[]>(),
    { contexto: "los lotes por evaluar" }
  );
  return lotesPorEvaluar(filas.map(normalizarLote));
}
