import type { createClient } from "@/lib/supabase/server";
import {
  BUCKET_FOTOS_ENTREGA,
  esEstadoAsignacion,
  esProceso,
  leerFecha,
  type AsignacionResumen,
  type EntregaProduccion,
  type EstadoAsignacion,
  type Proceso,
} from "./asignaciones";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// "activas" = lo que sigue en el taller (en proceso o con entrega parcial).
// "por_verificar" = entregas que el trabajador todavía no revisa.
export type FiltroEstado = EstadoAsignacion | "activas" | "por_verificar" | "todas";

export interface FiltrosAsignaciones {
  estado: FiltroEstado;
  equipo: string | null;
  proceso: Proceso | null;
  q: string;
  desde: string | null;
  hasta: string | null;
}

type Params = Record<string, string | string[] | undefined>;

function uno(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function leerFiltros(params: Params): FiltrosAsignaciones {
  const estado = uno(params.estado);
  const equipo = uno(params.equipo);
  const proceso = uno(params.proceso);
  return {
    estado:
      estado === "todas" || estado === "activas" || estado === "por_verificar" || esEstadoAsignacion(estado) ? estado : "activas",
    equipo: equipo && /^[0-9a-f-]{36}$/i.test(equipo) ? equipo : null,
    proceso: esProceso(proceso) ? proceso : null,
    q: (uno(params.q) ?? "").trim().slice(0, 100),
    desde: leerFecha(uno(params.desde)),
    hasta: leerFecha(uno(params.hasta)),
  };
}

export function filtrosAQuery(f: FiltrosAsignaciones, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.estado !== "activas") p.set("estado", f.estado);
  if (f.equipo) p.set("equipo", f.equipo);
  if (f.proceso) p.set("proceso", f.proceso);
  if (f.q) p.set("q", f.q);
  if (f.desde) p.set("desde", f.desde);
  if (f.hasta) p.set("hasta", f.hasta);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// Asignaciones según los filtros, de la más reciente a la más antigua.
// `rango` pagina; sin él trae todas (para el Excel).
export async function consultarAsignaciones(
  supabase: Supabase,
  f: FiltrosAsignaciones,
  rango?: { desde: number; hasta: number }
): Promise<{ filas: AsignacionResumen[]; total: number; error: string | null }> {
  let consulta = supabase
    .from("asignaciones_produccion_resumen")
    .select("*", { count: "exact" })
    .order("fecha_asignacion", { ascending: false })
    .order("creado_en", { ascending: false });

  if (f.estado === "activas") consulta = consulta.in("estado", ["en_proceso", "parcial"]);
  else if (f.estado === "por_verificar") consulta = consulta.gt("por_verificar", 0);
  else if (f.estado !== "todas") consulta = consulta.eq("estado", f.estado);
  if (f.equipo) consulta = consulta.eq("equipo_id", f.equipo);
  if (f.proceso) consulta = consulta.eq("proceso", f.proceso);
  if (f.desde) consulta = consulta.gte("fecha_asignacion", f.desde);
  if (f.hasta) consulta = consulta.lte("fecha_asignacion", f.hasta);
  if (f.q) {
    // Sin comas ni paréntesis: romperían la sintaxis del filtro or().
    const texto = f.q.replace(/[,()*%\\]/g, " ").trim();
    if (texto) {
      consulta = consulta.or(
        `numero_pedido.ilike.*${texto}*,modelo.ilike.*${texto}*,descripcion.ilike.*${texto}*,folios_calidad.ilike.*${texto}*,folios_cal.ilike.*${texto}*`
      );
    }
  }
  if (rango) consulta = consulta.range(rango.desde, rango.hasta);

  const { data, count, error } = await consulta.returns<AsignacionResumen[]>();
  return { filas: data ?? [], total: count ?? 0, error: error?.message ?? null };
}

// Resultado de Calidad sobre (parte de) una entrega: un folio por resultado.
export interface ResultadoCalidad {
  id: string;
  folio: string;
  aprobado: boolean;
  cantidad: number;
}

export interface EntregaConFoto extends EntregaProduccion {
  fotoUrl: string | null;
  calidad: ResultadoCalidad[];
}

// Entregas (incluidas las anuladas y rechazadas, para el historial) de un conjunto de
// asignaciones, con la URL firmada de su foto.
export async function entregasPorAsignacion(
  supabase: Supabase,
  asignacionIds: string[]
): Promise<Map<string, EntregaConFoto[]>> {
  const mapa = new Map<string, EntregaConFoto[]>();
  if (asignacionIds.length === 0) return mapa;

  const { data } = await supabase
    .from("entregas_produccion")
    .select(
      "id, asignacion_id, fecha_entrega, cantidad, folios_calidad, foto_path, registrado_en, anulada_en, motivo_anulacion, verificada_en, rechazada_en, motivo_rechazo"
    )
    .in("asignacion_id", asignacionIds)
    .order("fecha_entrega")
    .order("registrado_en")
    .returns<EntregaProduccion[]>();

  const entregaIds = (data ?? []).map((e) => e.id);
  const { data: informes } = entregaIds.length
    ? await supabase
        .from("informes_calidad")
        .select("id, folio, aprobado, cantidad, entrega_id")
        .in("entrega_id", entregaIds)
        .order("elaborado_en")
        .returns<(Omit<ResultadoCalidad, "cantidad"> & { cantidad: number | string; entrega_id: string })[]>()
    : { data: [] };
  const calidadPorEntrega = new Map<string, ResultadoCalidad[]>();
  for (const i of informes ?? []) {
    const lista = calidadPorEntrega.get(i.entrega_id) ?? [];
    lista.push({ id: i.id, folio: i.folio, aprobado: i.aprobado, cantidad: Number(i.cantidad) });
    calidadPorEntrega.set(i.entrega_id, lista);
  }

  const rutas = Array.from(new Set((data ?? []).map((e) => e.foto_path)));
  const { data: firmadas } = rutas.length
    ? await supabase.storage.from(BUCKET_FOTOS_ENTREGA).createSignedUrls(rutas, 3600)
    : { data: [] };
  const urlPorRuta = new Map(
    (firmadas ?? [])
      .filter((x): x is typeof x & { signedUrl: string } => !x.error && !!x.signedUrl)
      .map((x) => [x.path, x.signedUrl])
  );

  for (const e of data ?? []) {
    const lista = mapa.get(e.asignacion_id) ?? [];
    lista.push({ ...e, fotoUrl: urlPorRuta.get(e.foto_path) ?? null, calidad: calidadPorEntrega.get(e.id) ?? [] });
    mapa.set(e.asignacion_id, lista);
  }
  return mapa;
}
