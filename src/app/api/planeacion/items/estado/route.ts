import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerCambioLote } from "@/lib/planeacion/cambio-estado-lote";

// Cambia el estado de revisión de varios ítems de una vez (el cambio de uno solo
// está en ../[id]). Igual que ahí, el rol lo deciden las políticas RLS de UPDATE
// sobre planeacion_items: sin permiso el UPDATE afecta 0 filas en vez de fallar.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const lectura = leerCambioLote(await request.json().catch(() => null));
  if (!lectura.ok) {
    return NextResponse.json({ error: lectura.error }, { status: 400 });
  }
  const { itemIds, estado, motivo } = lectura.cambio;

  const { data, error } = await supabase
    .from("planeacion_items")
    .update({ estado_revision: estado, motivo_cancelacion: motivo })
    .in("id", itemIds)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "No tienes permiso para modificar estos ítems, o ya no existen." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    ok: true,
    actualizados: data.length,
    omitidos: itemIds.length - data.length,
  });
}
