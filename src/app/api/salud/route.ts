import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipDe } from "@/lib/seguridad/registro";
import { consumirLimite, respuestaLimite } from "@/lib/seguridad/limite-tasa";

// Para un monitor de disponibilidad (UptimeRobot, Better Stack...): responde 200 si la
// app está viva Y la base contesta, y 503 si la base no responde. No revela datos y es
// público a propósito (el monitor no tiene sesión). Como cada llamada consulta la base,
// también cuenta como actividad: en el plan gratuito de Supabase evita que el proyecto
// se pause por inactividad.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await consumirLimite({ clave: `salud:${ipDe(request)}`, maximo: 120, ventanaSegundos: 60 }))) {
    return respuestaLimite("Demasiadas consultas.", 60);
  }

  let base = false;
  try {
    const { error } = await createAdminClient()
      .from("perfiles")
      .select("id", { count: "exact", head: true })
      .limit(1);
    base = !error;
  } catch {
    base = false;
  }

  return NextResponse.json(
    { ok: base, base, hora: new Date().toISOString() },
    { status: base ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
