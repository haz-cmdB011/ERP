import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface LiberarBody {
  itemIds?: unknown;
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let body: LiberarBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  const itemIds = body.itemIds;
  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === "string")) {
    return NextResponse.json(
      { error: "Se requiere itemIds: un arreglo de IDs de ítems a liberar." },
      { status: 400 }
    );
  }

  // Un mueble con componentes no se libera sin su despiece guardado (se hace en el carrito).
  const { data: conHijos, error: errorHijos } = await supabase
    .from("planeacion_items")
    .select("parent_item_id, padre:parent_item_id ( item_code )")
    .in("parent_item_id", itemIds)
    .eq("tipo_registro", "FU")
    .is("eliminacion_solicitada_en", null)
    .or("estado_revision.is.null,estado_revision.neq.cancelado")
    .returns<{ parent_item_id: string; padre: { item_code: number } | null }[]>();
  const idsConHijos = [...new Set((conHijos ?? []).map((h) => h.parent_item_id))];
  const { data: conDespiece, error: errorDespiece } = idsConHijos.length
    ? await supabase.from("despieces_produccion").select("planeacion_item_id").in("planeacion_item_id", idsConHijos)
    : { data: [], error: null };
  if (errorHijos || errorDespiece) {
    return NextResponse.json(
      { error: `No se pudo revisar el despiece: ${(errorHijos ?? errorDespiece)?.message}` },
      { status: 500 }
    );
  }
  const hechos = new Set((conDespiece ?? []).map((d) => d.planeacion_item_id));
  const sinDespiece = [
    ...new Set((conHijos ?? []).filter((h) => !hechos.has(h.parent_item_id)).map((h) => h.padre?.item_code)),
  ];
  if (sinDespiece.length > 0) {
    return NextResponse.json(
      {
        error: `Falta el despiece de ${sinDespiece.length === 1 ? "el mueble" : "los muebles"} ${sinDespiece.join(", ")}. Hazlo en el carrito antes de liberar.`,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("planeacion_items")
    .update({
      estado_liberacion: "enviado_a_produccion",
      liberado_en: new Date().toISOString(),
      liberado_por: user.id,
    })
    .in("id", itemIds)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: `No se pudo liberar la selección: ${error.message}` },
      { status: 500 }
    );
  }

  // Liberan Planeación y Producción (Planeación decide qué; el trabajador de
  // Producción lo marca). RLS deja fuera a los demás: el update afecta 0
  // filas en vez de fallar, así que lo detectamos aquí para devolver un
  // mensaje claro en vez de un "éxito" silencioso que no liberó nada.
  if (data.length < itemIds.length) {
    return NextResponse.json(
      {
        error:
          "No tienes permiso para liberar ítems a producción (se requiere Planeación o Producción), o algunos ítems ya no existen.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, liberados: data.length });
}
