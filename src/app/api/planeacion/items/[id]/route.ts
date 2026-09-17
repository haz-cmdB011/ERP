import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ESTADOS_VALIDOS = ["en_revision", "cancelado", null] as const;

// Sin gate explícito de rol aquí: la política RLS
// "planeacion_update_planeacion_items" (is_planeacion(), ya existente)
// es la que decide si el usuario puede cambiar esto — cubre exactamente
// trabajador/administrador/desarrollador de Planeación.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const estadoRevision = body?.estado_revision ?? null;

  if (!ESTADOS_VALIDOS.includes(estadoRevision)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("planeacion_items")
    .update({ estado_revision: estadoRevision })
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "No tienes permiso para modificar este ítem, o no existe." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
