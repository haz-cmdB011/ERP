import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leerIdsAviso } from "@/lib/notificaciones/avisos";

export const runtime = "nodejs";

// Marca avisos como leídos por la persona con la sesión abierta. Repetirlo no hace daño (ya leído = ya leído).
// La base (RLS) solo deja marcar a su nombre y avisos que puede ver.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  let cuerpo: { ids?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }
  const ids = leerIdsAviso(cuerpo?.ids);
  if (!ids) return NextResponse.json({ error: "Indica los avisos a marcar (hasta 50)." }, { status: 400 });

  const { error } = await supabase
    .from("avisos_leidos")
    .upsert(
      ids.map((aviso_id) => ({ aviso_id, user_id: user.id })),
      { onConflict: "aviso_id,user_id", ignoreDuplicates: true }
    );
  if (error) {
    console.error("avisos: no se pudieron marcar como leídos", error.message);
    return NextResponse.json({ error: "No se pudo marcar como leído. Inténtalo de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
