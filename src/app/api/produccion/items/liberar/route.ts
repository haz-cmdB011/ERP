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

  // RLS (planeacion_update_planeacion_items) exige rol planeación/admin: si
  // el usuario no lo tiene, el update afecta 0 filas en vez de fallar, así
  // que lo detectamos aquí para devolver un mensaje claro en vez de un
  // "éxito" silencioso que en realidad no liberó nada.
  if (data.length < itemIds.length) {
    return NextResponse.json(
      {
        error:
          "No tienes permiso para liberar ítems a producción (se requiere rol Planeación o Admin), o algunos ítems ya no existen.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, liberados: data.length });
}
