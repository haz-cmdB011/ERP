// Consulta de Folios de calidad compartida por la pantalla y por el Excel: los
// mismos filtros sobre la vista informes_calidad_estado (id, folio, aprobado,
// elaborado_en, con_situacion, categoria, numero_pedido y orden_trabajo). El texto
// de búsqueda busca en el folio, en el PM y en la O.T.

import type { SupabaseClient } from "@supabase/supabase-js";
import { paginarTodo } from "@/lib/supabase/paginar";
import { rangoDeInstantes, type EstadoFolios, type FiltrosFolios } from "./folios-filtros";
import { estatusDeInformes, type EstatusDeInforme } from "./estatus-db";
import type { EstatusNoConformidad } from "./no-conformidad";

/* eslint-disable @typescript-eslint/no-unsafe-function-type -- el constructor de consultas de Supabase tiene tipos demasiado profundos para describirlos aquí */
type Filtrable = { ilike: Function; eq: Function; gte: Function; lt: Function; or: Function };

// Escapa los comodines de LIKE para que se busque el texto tal cual.
function literalLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Código de PM u OT como lo escribe quien busca: sin espacios ni el prefijo "OT"
// ("OT 134-26" → "134-26") y solo letras, números, guion y diagonal.
export function codigoPedidoBuscado(q: string): string {
  return q
    .replace(/\s+/g, "")
    .replace(/^(OT|O\.T\.?)/i, "")
    .replace(/[^\p{L}\p{N}\-\/]/gu, "");
}

// Filtro `or` de la vista: el folio, el PM o la O.T. contienen el texto buscado.
// Se quitan comas, paréntesis, comillas y asteriscos, que tienen sentido dentro de
// la lista del filtro.
export function filtroFoliosOr(q: string): string {
  const partes: string[] = [];
  const texto = q.replace(/[,()"\\*]/g, "").trim();
  if (texto) partes.push(`folio.ilike.*${literalLike(texto)}*`);
  const codigo = codigoPedidoBuscado(q);
  if (codigo) partes.push(`numero_pedido.ilike.*${codigo}*`, `orden_trabajo.ilike.*${codigo}*`);
  // Sin nada que buscar, ningún folio coincide (id nunca es nulo).
  return partes.length > 0 ? partes.join(",") : "id.is.null";
}

// Aplica los filtros a una consulta de la vista. `estado` permite contar cada
// pestaña (aprobados, no aprobados…) con los demás filtros iguales.
export function aplicarFiltrosFolios<T extends Filtrable>(
  consulta: T,
  filtros: Pick<FiltrosFolios, "q" | "desde" | "hasta" | "categoria">,
  estado: EstadoFolios
): T {
  const { inicio, fin } = rangoDeInstantes(filtros);
  let c = consulta;
  if (filtros.q) c = c.or(filtroFoliosOr(filtros.q));
  if (estado === "aprobados") c = c.eq("aprobado", true);
  if (estado === "no_aprobados") c = c.eq("aprobado", false);
  if (estado === "cancelados") c = c.eq("con_situacion", true);
  if (inicio) c = c.gte("elaborado_en", inicio);
  if (fin) c = c.lt("elaborado_en", fin);
  if (filtros.categoria) c = c.eq("categoria", filtros.categoria);
  return c;
}

export interface FolioParaExcel {
  folio: string;
  aprobado: boolean;
  categoria: string | null;
  elaboradoEn: string;
  elaboro: string | null;
  pedido: string | null;
  proyecto: string | null;
  cliente: string | null;
  itemCode: number | null;
  modelo: string | null;
  situacion: string | null;
  // Datos de la no conformidad (los aprobados los dejan vacíos).
  motivo: string | null;
  areaOrigen: string | null;
  responsableOrigen: string | null;
  estatus: EstatusNoConformidad | null;
  fechaCierre: string | null;
}

export const MAX_FOLIOS_EXCEL = 5000;

interface DetalleInforme {
  id: string;
  folio: string;
  aprobado: boolean;
  categoria: string | null;
  elaborado_por: string | null;
  elaborado_en: string;
  cantidad: number | string | null;
  entrega_id: string | null;
  cerrado_en: string | null;
  area_origen: string | null;
  responsable_origen: string | null;
  motivo: { codigo: string; nombre: string } | null;
  planeacion_items: ItemDetalle | ItemDetalle[] | null;
}

interface ItemDetalle {
  id: string;
  item_code: number;
  modelo: string | null;
  estado_revision: string | null;
  eliminacion_solicitada_en: string | null;
  pedido_versiones: {
    pedidos: {
      numero_pedido: string;
      eliminado_en: string | null;
      cancelado_en: string | null;
      proyectos: { nombre: string; cliente: string } | null;
    } | null;
  } | null;
}

function lotes<T>(items: T[], tamano = 100): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) salida.push(items.slice(i, i + tamano));
  return salida;
}

// Todos los folios que cumplen los filtros (hasta MAX_FOLIOS_EXCEL), del más
// reciente al más antiguo. Lanza si una lectura falla.
export async function cargarFoliosParaExcel(
  supabase: SupabaseClient,
  filtros: FiltrosFolios
): Promise<{ filas: FolioParaExcel[]; truncado: boolean }> {
  const ids = await paginarTodo<{ id: string }>(
    (desde, hasta) =>
      aplicarFiltrosFolios(supabase.from("informes_calidad_estado").select("id"), filtros, filtros.estado)
        .order("elaborado_en", { ascending: false })
        .order("folio", { ascending: false })
        .range(desde, hasta)
        .returns<{ id: string }[]>(),
    { maxFilas: MAX_FOLIOS_EXCEL + 1, contexto: "los folios" }
  );
  const truncado = ids.length > MAX_FOLIOS_EXCEL;
  const idsUsados = ids.slice(0, MAX_FOLIOS_EXCEL).map((r) => r.id);
  const orden = new Map(idsUsados.map((id, i) => [id, i]));

  const detalle = (
    await Promise.all(
      lotes(idsUsados).map((lote) =>
        paginarTodo<DetalleInforme>(
          (desde, hasta) =>
            supabase
              .from("informes_calidad")
              .select(
                "id, folio, aprobado, categoria, elaborado_por, elaborado_en, cantidad, entrega_id, cerrado_en, area_origen, responsable_origen, motivo:motivos_calidad ( codigo, nombre ), planeacion_items ( id, item_code, modelo, estado_revision, eliminacion_solicitada_en, pedido_versiones ( pedidos ( numero_pedido, eliminado_en, cancelado_en, proyectos ( nombre, cliente ) ) ) )"
              )
              .in("id", lote)
              .order("id")
              .range(desde, hasta)
              .returns<DetalleInforme[]>(),
          { contexto: "el detalle de los folios" }
        )
      )
    )
  ).flat();
  detalle.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));

  const unico = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  const autorIds = [...new Set(detalle.map((d) => d.elaborado_por).filter((x): x is string => !!x))];

  const perfiles = (
    await Promise.all(
      lotes(autorIds).map(async (lote) => {
        const { data, error } = await supabase
          .from("perfiles")
          .select("id, nombre_completo, email")
          .in("id", lote)
          .returns<{ id: string; nombre_completo: string | null; email: string | null }[]>();
        if (error) throw new Error(`No se pudo leer quién elaboró los folios: ${error.message}`);
        return data ?? [];
      })
    )
  ).flat();
  const autor = new Map(perfiles.map((p) => [p.id, p.nombre_completo || p.email || null]));

  // Estatus de las no conformidades (los aprobados no lo tienen).
  const noAprobados = detalle.filter((d) => !d.aprobado);
  const estatus = await estatusDeInformes(
    supabase,
    noAprobados.map((d) => ({
      id: d.id,
      entrega_id: d.entrega_id,
      cantidad: d.cantidad != null ? Number(d.cantidad) : null,
      cerrado_en: d.cerrado_en,
    }))
  );
  const estatusPorInforme = new Map<string, EstatusDeInforme>(noAprobados.map((d, i) => [d.id, estatus[i]]));

  const filas = detalle.map((d): FolioParaExcel => {
    const item = unico(d.planeacion_items);
    const pedido = item?.pedido_versiones?.pedidos ?? null;
    let situacion: string | null = null;
    if (!item) situacion = "Ítem no disponible";
    else if (pedido?.eliminado_en) situacion = "Pedido eliminado";
    else if (item.eliminacion_solicitada_en) situacion = "Ítem eliminado";
    else if (item.estado_revision === "cancelado" || pedido?.cancelado_en) situacion = "Cancelado";
    const estatusNc = estatusPorInforme.get(d.id);
    return {
      folio: d.folio,
      aprobado: d.aprobado,
      categoria: d.categoria,
      elaboradoEn: d.elaborado_en,
      elaboro: (d.elaborado_por && autor.get(d.elaborado_por)) || null,
      pedido: pedido?.numero_pedido ?? null,
      proyecto: pedido?.proyectos?.nombre ?? null,
      cliente: pedido?.proyectos?.cliente ?? null,
      itemCode: item?.item_code ?? null,
      modelo: item?.modelo ?? null,
      situacion,
      motivo: d.motivo ? `${d.motivo.codigo} · ${d.motivo.nombre}` : null,
      areaOrigen: d.area_origen,
      responsableOrigen: d.responsable_origen,
      estatus: estatusNc?.estatus ?? null,
      fechaCierre: estatusNc?.fecha ?? null,
    };
  });
  return { filas, truncado };
}
