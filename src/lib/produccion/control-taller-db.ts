import type { createClient } from "@/lib/supabase/server";
import { armarBitacora } from "./bitacora";
import { cargarBitacora, cargarMarcasDeMuebles } from "./bitacora-db";
import { armarControl, type RenglonControl } from "./control-taller";
import type { EventoMarca } from "./historial-marcas";
import { hoyMexico } from "./asignaciones";
import { cargarMueblesInicio } from "./inicio-db";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Últimos cambios que se leen del historial; los filtros de la pantalla se aplican sobre ellos.
export const MAX_EVENTOS = 1000;

// Todos los muebles vigentes y las asignaciones a la vista, un renglón cada uno, con su marca.
export async function cargarControl(supabase: Supabase): Promise<RenglonControl[]> {
  const hoy = hoyMexico();
  const [muebles, { asignaciones, plazos, ots, marcas }] = await Promise.all([
    cargarMueblesInicio(supabase),
    cargarBitacora(supabase, hoy),
  ]);
  const marcasDeMuebles = await cargarMarcasDeMuebles(supabase, muebles.map((m) => m.id));
  return armarControl(muebles, armarBitacora(asignaciones, plazos, ots, hoy, marcas), marcasDeMuebles);
}

// Cambios del historial, del más reciente al más viejo. Si no se puede leer (por ejemplo, la
// migración aún no se aplica) devuelve el motivo en vez de tumbar la pantalla.
export async function cargarEventos(supabase: Supabase): Promise<{ eventos: EventoMarca[]; error: string | null }> {
  const { data, error } = await supabase
    .from("historial_marcas_taller_produccion")
    .select(
      "id, asignacion_id, item_id, esta_anterior, esta, nota, modelo, numero_pedido, orden_trabajo, equipo, hecho_por_nombre, hecho_en"
    )
    .order("hecho_en", { ascending: false })
    .limit(MAX_EVENTOS)
    .returns<EventoMarca[]>();
  return { eventos: data ?? [], error: error?.message ?? null };
}
