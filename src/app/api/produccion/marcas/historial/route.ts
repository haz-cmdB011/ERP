import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EventoMarca } from "@/lib/produccion/historial-marcas";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ULTIMOS = 15;

// Últimos cambios de la marca de una asignación (`asignacionId`) o de un mueble (`itemId`), del más
// reciente al más viejo. Solo lectura; la RLS deja ver el historial al personal interno.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const asignacionId = request.nextUrl.searchParams.get("asignacionId");
  const itemId = request.nextUrl.searchParams.get("itemId");
  const clave =
    asignacionId && !itemId
      ? { columna: "asignacion_id" as const, id: asignacionId }
      : itemId && !asignacionId
        ? { columna: "item_id" as const, id: itemId }
        : null;
  if (!clave || !UUID.test(clave.id)) {
    return NextResponse.json({ error: "Se requiere asignacionId o itemId (uno solo)." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("historial_marcas_taller_produccion")
    .select(
      "id, asignacion_id, item_id, esta_anterior, esta, nota, modelo, numero_pedido, orden_trabajo, equipo, hecho_por_nombre, hecho_en"
    )
    .eq(clave.columna, clave.id)
    .order("hecho_en", { ascending: false })
    .limit(ULTIMOS)
    .returns<EventoMarca[]>();
  if (error) {
    return NextResponse.json({ error: `No se pudo leer el historial: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ eventos: data ?? [] });
}
