import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { limpiarNota, NOTA_MAX } from "@/lib/produccion/historial-marcas";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Palomita o tache de una asignación (`asignacionId`) o de un mueble (`itemId`) en la bitácora de
// taller: `esta` true (palomita), false (tache) o null (sin marcar), con una `nota` opcional (el
// motivo). Hay una sola marca por asignación y una por mueble, así que repetir no duplica nada; cada
// cambio queda en el historial (lo escribe un trigger de la base). Cambiar la marca sin mandar nota
// borra la nota anterior: es una decisión nueva. La base (RLS) vuelve a exigir que sea de Producción.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let cuerpo: { asignacionId?: unknown; itemId?: unknown; esta?: unknown; nota?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }
  const { asignacionId, itemId, esta } = cuerpo;
  // Exactamente uno de los dos: la marca es de una asignación o de un mueble.
  const clave =
    typeof asignacionId === "string" && itemId === undefined
      ? { columna: "asignacion_id" as const, id: asignacionId }
      : typeof itemId === "string" && asignacionId === undefined
        ? { columna: "item_id" as const, id: itemId }
        : null;
  if (!clave || !UUID.test(clave.id) || (esta !== null && typeof esta !== "boolean")) {
    return NextResponse.json(
      { error: "Se requiere asignacionId o itemId (uno solo) y esta (true, false o null)." },
      { status: 400 }
    );
  }
  const nota = limpiarNota(cuerpo.nota);
  if (!nota.ok) {
    return NextResponse.json({ error: `La nota debe ser texto de ${NOTA_MAX} caracteres o menos.` }, { status: 400 });
  }

  const perfil = await getPerfilActual(supabase);
  if (!puedeEditarProduccion(perfil)) {
    return NextResponse.json({ error: "Solo Producción puede marcar la bitácora." }, { status: 403 });
  }

  const { error } =
    esta === null
      ? await supabase.from("marcas_taller_produccion").delete().eq(clave.columna, clave.id)
      : await supabase.from("marcas_taller_produccion").upsert(
          {
            [clave.columna]: clave.id,
            esta,
            nota: nota.nota,
            marcado_por: user.id,
            marcado_en: new Date().toISOString(),
          },
          { onConflict: clave.columna }
        );
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar la marca: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
