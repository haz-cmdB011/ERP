import type { SupabaseClient } from "@supabase/supabase-js";
import { paginar } from "@/lib/resumen/avance-items";
import type { ItemComparable } from "./diff-versiones";
import { idsConInformeDeCalidad } from "./linea-tiempo-db";
import {
  SIN_TRABAJO,
  aComparables,
  calcularImpacto,
  necesitaConfirmacion,
  type EstadoItemEnMarcha,
  type ImpactoPm,
} from "./impacto-version";
import type { PlaneacionItemParsed } from "./types";
import { cargarItemsVersion } from "./versiones-db";

export interface HojaParaImpacto {
  nombreHoja: string;
  // Número de PM ya normalizado (el mismo con el que se guardaría).
  numeroPedido: string;
  items: PlaneacionItemParsed[];
}

// Qué tiene en Producción y Calidad cada ítem de la versión activa de un PM:
// liberado, asignaciones vigentes (y con entregas) e informes de Calidad.
async function estadosEnMarcha(
  supabase: SupabaseClient,
  pedidoId: string,
  versionId: string,
  idsVersion: ReadonlySet<string>
): Promise<Map<string, EstadoItemEnMarcha>> {
  const estados = new Map<string, EstadoItemEnMarcha>();
  const de = (id: string): EstadoItemEnMarcha => {
    let e = estados.get(id);
    if (!e) {
      e = { ...SIN_TRABAJO };
      estados.set(id, e);
    }
    return e;
  };

  const liberados = await paginar<{ id: string }>((desde, hasta) =>
    supabase
      .from("planeacion_items")
      .select("id")
      .eq("pedido_version_id", versionId)
      .eq("estado_liberacion", "enviado_a_produccion")
      .order("id")
      .range(desde, hasta)
      .returns<{ id: string }[]>()
  );
  for (const l of liberados) de(l.id).liberado = true;

  // Las asignaciones de versiones anteriores del PM no cuentan: ya no están en
  // la versión que se va a reemplazar.
  const asignaciones = await paginar<{
    id: string;
    planeacion_item_id: string | null;
    entregado: number;
    cancelada_en: string | null;
  }>((desde, hasta) =>
    supabase
      .from("asignaciones_produccion_resumen")
      .select("id, planeacion_item_id, entregado, cancelada_en")
      .eq("pedido_id", pedidoId)
      .order("id")
      .range(desde, hasta)
      .returns<
        { id: string; planeacion_item_id: string | null; entregado: number; cancelada_en: string | null }[]
      >()
  );
  for (const a of asignaciones) {
    if (a.cancelada_en || !a.planeacion_item_id || !idsVersion.has(a.planeacion_item_id)) continue;
    const e = de(a.planeacion_item_id);
    e.asignaciones += 1;
    if (Number(a.entregado) > 0) e.asignacionesConEntregas += 1;
  }

  for (const id of await idsConInformeDeCalidad(
    supabase,
    liberados.map((l) => l.id)
  )) {
    de(id).informes = 1;
  }
  return estados;
}

function hayTrabajo(estados: ReadonlyMap<string, EstadoItemEnMarcha>): boolean {
  for (const e of estados.values()) {
    if (e.liberado || e.asignaciones > 0 || e.informes > 0) return true;
  }
  return false;
}

// Para cada hoja del Excel cuyo PM ya existe, qué trabajo en marcha tiene su
// versión activa y cómo la cambiaría el archivo. Devuelve solo los PM con
// trabajo en marcha (los demás se cargan sin preguntar). Es una ayuda para
// quien carga, no una barrera: un PM que no se pueda revisar se omite.
export async function analizarImpactoCarga(
  supabase: SupabaseClient,
  hojas: HojaParaImpacto[]
): Promise<ImpactoPm[]> {
  const impactos: ImpactoPm[] = [];
  for (const hoja of hojas) {
    const { data: pedido } = await supabase
      .from("pedidos")
      .select("id, eliminado_en")
      .eq("numero_pedido", hoja.numeroPedido)
      .is("eliminado_definitivo_en", null)
      .maybeSingle<{ id: string; eliminado_en: string | null }>();
    // Un PM nuevo no tiene nada en marcha; uno en la papelera lo rechaza la carga misma.
    if (!pedido || pedido.eliminado_en) continue;

    const { data: versiones } = await supabase
      .from("pedido_versiones")
      .select("id, numero_version, es_version_activa")
      .eq("pedido_id", pedido.id)
      .returns<{ id: string; numero_version: number; es_version_activa: boolean }[]>();
    const activa = versiones?.find((v) => v.es_version_activa);
    if (!versiones || !activa) continue;

    const antes: ItemComparable[] | null = await cargarItemsVersion(supabase, activa.id);
    if (!antes) continue;
    const estados = await estadosEnMarcha(supabase, pedido.id, activa.id, new Set(antes.map((i) => i.id)));
    // Sin nada en marcha no hace falta comparar (la comparación es la parte cara).
    if (!hayTrabajo(estados)) continue;

    const impacto = calcularImpacto({
      hoja: hoja.nombreHoja,
      numeroPedido: hoja.numeroPedido,
      versionActiva: activa.numero_version,
      versionNueva: Math.max(...versiones.map((v) => v.numero_version)) + 1,
      antes,
      despues: aComparables(hoja.items),
      estados,
    });
    if (necesitaConfirmacion(impacto.enMarcha)) impactos.push(impacto);
  }
  return impactos;
}
