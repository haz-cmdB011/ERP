import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RevertirBody {
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

  let body: RevertirBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  const itemIds = body.itemIds;
  if (!Array.isArray(itemIds) || itemIds.length === 0 || !itemIds.every((id) => typeof id === "string")) {
    return NextResponse.json(
      { error: "Se requiere itemIds: un arreglo de IDs de ítems a revertir." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("planeacion_items")
    .update({
      estado_liberacion: "pendiente",
      liberado_en: null,
      liberado_por: null,
    })
    .in("id", itemIds)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: `No se pudo revertir la selección: ${error.message}` },
      { status: 500 }
    );
  }

  if (data.length < itemIds.length) {
    return NextResponse.json(
      {
        error:
          "No tienes permiso para revertir ítems a pendiente (se requiere rol Planeación o Admin), o algunos ítems ya no existen.",
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true, revertidos: data.length });
}
