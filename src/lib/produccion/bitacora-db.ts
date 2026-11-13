import type { createClient } from "@/lib/supabase/server";
import { plazosDePedidos, type PlazoConFecha } from "./cargar-taller";
import { DIAS_BITACORA, restarDias, type AsignacionBitacora } from "./bitacora";
import type { MarcaActual } from "./historial-marcas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// PostgREST devuelve máximo 1000 filas por consulta: se pide por páginas.
const PAGINA = 1000;
// Ids por consulta .in(): más largos pasarían el límite de tamaño de la URL.
const LOTE_IDS = 100;

const COLUMNAS =
  "id, planeacion_item_id, pedido_id, numero_pedido, item_code, modelo, unidad, equipo_id, equipo, encargado, proceso, cantidad, entregado, fecha_asignacion, estado, ultima_entrega, vez_paso, veces_proceso, parte_id, parte_descripcion, parte_unidad";

// Lo que sigue en el taller (todo) y lo que ya se entregó en los últimos días. Ante un error
// devuelve lo que alcanzó a leer: es un resumen y no debe tumbar la pantalla donde se muestra.
async function leerAsignaciones(
  supabase: Supabase,
  filtrar: (q: ReturnType<ReturnType<Supabase["from"]>["select"]>) => ReturnType<ReturnType<Supabase["from"]>["select"]>
): Promise<AsignacionBitacora[]> {
  const filas: AsignacionBitacora[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await filtrar(supabase.from("asignaciones_produccion_resumen").select(COLUMNAS))
      .order("fecha_asignacion", { ascending: false })
      .order("id")
      .range(desde, desde + PAGINA - 1)
      .returns<AsignacionBitacora[]>();
    if (error || !data) break;
    filas.push(...data);
    if (data.length < PAGINA) break;
  }
  return filas;
}

// O.T. de cada PM dado (por id de pedido).
async function otsDePedidos(supabase: Supabase, pedidoIds: string[]): Promise<Map<string, string | null>> {
  const unicos = [...new Set(pedidoIds)];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += LOTE_IDS) lotes.push(unicos.slice(i, i + LOTE_IDS));

  const respuestas = await Promise.all(
    lotes.map((ids) =>
      supabase
        .from("pedidos")
        .select("id, orden_trabajo")
        .in("id", ids)
        .returns<{ id: string; orden_trabajo: string | null }[]>()
    )
  );
  const ots = new Map<string, string | null>();
  for (const { data } of respuestas) for (const p of data ?? []) ots.set(p.id, p.orden_trabajo);
  return ots;
}

// Palomita o tache elegido, por asignación o por mueble (ítem) según `columna`. Si la tabla no se
// puede leer, todo queda sin marcar: es un dato informativo y no debe tumbar la pantalla.
async function leerMarcas(
  supabase: Supabase,
  columna: "asignacion_id" | "item_id",
  ids: string[]
): Promise<Map<string, MarcaActual>> {
  const marcas = new Map<string, MarcaActual>();
  const unicos = [...new Set(ids)];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += LOTE_IDS) lotes.push(unicos.slice(i, i + LOTE_IDS));
  const respuestas = await Promise.all(
    lotes.map((lote) =>
      supabase
        .from("marcas_taller_produccion")
        .select("asignacion_id, item_id, esta, nota")
        .in(columna, lote)
        .returns<{ asignacion_id: string | null; item_id: string | null; esta: boolean; nota: string | null }[]>()
    )
  );
  for (const { data } of respuestas) {
    for (const m of data ?? []) {
      const id = m[columna];
      if (id) marcas.set(id, { esta: m.esta, nota: m.nota });
    }
  }
  return marcas;
}

// Palomita o tache elegido de cada mueble (ítem), por id.
export function cargarMarcasDeMuebles(supabase: Supabase, muebleIds: string[]): Promise<Map<string, MarcaActual>> {
  return leerMarcas(supabase, "item_id", muebleIds);
}

export async function cargarBitacora(
  supabase: Supabase,
  hoy: string
): Promise<{
  asignaciones: AsignacionBitacora[];
  plazos: Map<string, PlazoConFecha>;
  ots: Map<string, string | null>;
  marcas: Map<string, MarcaActual>;
}> {
  const desde = restarDias(hoy, DIAS_BITACORA);
  const [enTaller, entregadas] = await Promise.all([
    leerAsignaciones(supabase, (q) => q.in("estado", ["en_proceso", "parcial"])),
    leerAsignaciones(supabase, (q) => q.eq("estado", "entregada").gte("ultima_entrega", desde)),
  ]);
  const asignaciones = [...enTaller, ...entregadas];
  const pedidoIds = asignaciones.map((a) => a.pedido_id).filter((id): id is string => !!id);
  const [plazos, ots, marcas] = await Promise.all([
    plazosDePedidos(supabase, enTaller.flatMap((a) => (a.pedido_id ? [a.pedido_id] : [])), hoy),
    otsDePedidos(supabase, pedidoIds),
    leerMarcas(supabase, "asignacion_id", asignaciones.map((a) => a.id)),
  ]);
  return { asignaciones, plazos, ots, marcas };
}
