import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ESTADOS_VALIDOS = ["en_revision", "cancelado", null] as const;

// Sin gate explícito de rol aquí: las políticas RLS de UPDATE sobre
// planeacion_items deciden quién puede cambiar esto —
// "planeacion_update_planeacion_items" (is_planeacion()) y
// "produccion_solicitar_eliminacion_planeacion_items" (is_produccion()) —, así
// que también Producción puede revertir una cancelación desde su panel.
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

  // El motivo es obligatorio al cancelar, y se limpia al salir de "cancelado"
  // para no dejar un motivo obsoleto colgado.
  let motivoCancelacion: string | null = null;
  if (estadoRevision === "cancelado") {
    const motivo = typeof body?.motivo_cancelacion === "string" ? body.motivo_cancelacion.trim() : "";
    if (!motivo) {
      return NextResponse.json(
        { error: "Debes indicar el motivo de la cancelación." },
        { status: 400 }
      );
    }
    motivoCancelacion = motivo;
  }

  const { data, error } = await supabase
    .from("planeacion_items")
    .update({ estado_revision: estadoRevision, motivo_cancelacion: motivoCancelacion })
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
