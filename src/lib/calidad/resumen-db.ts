// Lecturas de Calidad para el panel y la bandeja de entregas. Todas lanzan
// (ErrorLectura) si una consulta falla: un número a medias engaña.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { resumirCalidad, type InformeBasico, type ItemLiberado, type ResumenCalidad } from "./resumen";
import type { EntregaDeItem, InformeDeItem } from "./inspeccion";

interface FilaItem {
  id: string;
  liberado_en: string | null;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedido_id: string;
    pedidos: { eliminado_en: string | null; eliminado_definitivo_en: string | null; cancelado_en: string | null } | null;
  } | null;
}

function lotes<T>(items: T[], tamano = 100): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) salida.push(items.slice(i, i + tamano));
  return salida;
}

// Resumen vigente: ítems enviados a producción de la versión activa de pedidos
// no cancelados ni eliminados, y todos los informes.
export async function cargarResumenCalidad(supabase: SupabaseClient, ahora = new Date()): Promise<ResumenCalidad> {
  const filas = await paginarTodo<FilaItem>(
    (desde, hasta) =>
      supabase
        .from("planeacion_items")
        .select(
          "id, liberado_en, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( pedido_id, es_version_activa, pedidos!inner ( eliminado_en, eliminado_definitivo_en, cancelado_en ) )"
        )
        .eq("estado_liberacion", "enviado_a_produccion")
        .eq("pedido_versiones.es_version_activa", true)
        .order("id")
        .range(desde, hasta)
        .returns<FilaItem[]>(),
    { contexto: "los ítems liberados" }
  );
  const items: ItemLiberado[] = [];
  for (const f of filas) {
    const pedido = f.pedido_versiones?.pedidos;
    if (!f.pedido_versiones || !pedido) continue;
    if (pedido.eliminado_en || pedido.eliminado_definitivo_en || pedido.cancelado_en) continue;
    if (f.estado_revision === "cancelado" || f.eliminacion_solicitada_en) continue;
    items.push({ id: f.id, pedidoId: f.pedido_versiones.pedido_id, liberadoEn: f.liberado_en });
  }

  const informes = await paginarTodo<{ planeacion_item_id: string; aprobado: boolean; elaborado_en: string; piezas_verificadas: number | string | null }>(
    (desde, hasta) =>
      supabase
        .from("informes_calidad")
        .select("planeacion_item_id, aprobado, elaborado_en")
        .order("id")
        .range(desde, hasta)
        .returns<{ planeacion_item_id: string; aprobado: boolean; elaborado_en: string; piezas_verificadas: number | string | null }[]>(),
    { contexto: "los informes de calidad" }
  );
  const basicos: InformeBasico[] = informes.map((i) => ({
    itemId: i.planeacion_item_id,
    aprobado: i.aprobado,
    elaboradoEn: i.elaborado_en,
  }));
  return resumirCalidad(items, basicos, ahora);
}

interface FilaAsignacion {
  planeacion_item_id: string;
  pedido_id: string;
  numero_pedido: string;
  item_code: number;
  modelo: string | null;
  unidad: string | null;
  cantidad: number | string;
  // Solo lo que el trabajador de Producción ya revisó y mandó a Calidad.
  verificado: number | string;
  ultima_verificacion: string | null;
}

// Lo que Producción entregó y su trabajador ya verificó, sumado por ítem, y el
// último informe de cada uno
// para decidir qué falta inspeccionar. Excluye ítems cancelados/eliminados.
export async function cargarEntregasConInforme(
  supabase: SupabaseClient
): Promise<{ entregas: EntregaDeItem[]; ultimoInforme: Map<string, InformeDeItem> }> {
  const filas = await paginarTodo<FilaAsignacion>(
    (desde, hasta) =>
      supabase
        .from("asignaciones_produccion_resumen")
        .select("planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, unidad, cantidad, verificado, ultima_verificacion")
        .neq("estado", "cancelada")
        .gt("verificado", 0)
        .order("id")
        .range(desde, hasta)
        .returns<FilaAsignacion[]>(),
    { contexto: "las entregas de Producción" }
  );

  const porItem = new Map<string, EntregaDeItem>();
  for (const f of filas) {
    if (!f.ultima_verificacion) continue;
    const previo = porItem.get(f.planeacion_item_id);
    if (previo) {
      previo.entregado += Number(f.verificado);
      previo.asignado += Number(f.cantidad);
      if (f.ultima_verificacion > previo.ultimaEntrega) previo.ultimaEntrega = f.ultima_verificacion;
    } else {
      porItem.set(f.planeacion_item_id, {
        itemId: f.planeacion_item_id,
        pedidoId: f.pedido_id,
        numeroPedido: f.numero_pedido,
        modelo: f.modelo,
        itemCode: f.item_code,
        entregado: Number(f.verificado),
        asignado: Number(f.cantidad),
        unidad: f.unidad,
        ultimaEntrega: f.ultima_verificacion.slice(0, 10),
      });
    }
  }

  const ids = [...porItem.keys()];

  // Fuera lo cancelado o eliminado.
  const estados = (
    await Promise.all(
      lotes(ids).map((lote) =>
        paginarTodo<FilaItem>(
          (desde, hasta) =>
            supabase
              .from("planeacion_items")
              .select(
                "id, liberado_en, estado_revision, eliminacion_solicitada_en, pedido_versiones!inner ( pedido_id, pedidos!inner ( eliminado_en, eliminado_definitivo_en, cancelado_en ) )"
              )
              .in("id", lote)
              .order("id")
              .range(desde, hasta)
              .returns<FilaItem[]>(),
          { contexto: "los ítems entregados" }
        )
      )
    )
  ).flat();
  for (const f of estados) {
    const pedido = f.pedido_versiones?.pedidos;
    if (
      f.estado_revision === "cancelado" ||
      f.eliminacion_solicitada_en ||
      !pedido ||
      pedido.eliminado_en ||
      pedido.eliminado_definitivo_en ||
      pedido.cancelado_en
    ) {
      porItem.delete(f.id);
    }
  }

  const informes = (
    await Promise.all(
      lotes([...porItem.keys()]).map((lote) =>
        paginarTodo<{ planeacion_item_id: string; aprobado: boolean; elaborado_en: string; piezas_verificadas: number | string | null }>(
          (desde, hasta) =>
            supabase
              .from("informes_calidad")
              .select("planeacion_item_id, aprobado, elaborado_en, piezas_verificadas")
              .in("planeacion_item_id", lote)
              .order("elaborado_en", { ascending: false })
              .order("id")
              .range(desde, hasta)
              .returns<{ planeacion_item_id: string; aprobado: boolean; elaborado_en: string; piezas_verificadas: number | string | null }[]>(),
          { contexto: "los informes de los ítems entregados" }
        )
      )
    )
  ).flat();
  const ultimoInforme = new Map<string, InformeDeItem>();
  for (const i of informes) {
    const previo = ultimoInforme.get(i.planeacion_item_id);
    if (!previo || i.elaborado_en > previo.elaboradoEn) {
      ultimoInforme.set(i.planeacion_item_id, {
        aprobado: i.aprobado,
        elaboradoEn: i.elaborado_en,
        piezasVerificadas: i.piezas_verificadas == null ? null : Number(i.piezas_verificadas),
      });
    }
  }

  return { entregas: [...porItem.values()], ultimoInforme };
}
