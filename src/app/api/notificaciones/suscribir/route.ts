import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validarSuscripcion } from "@/lib/notificaciones/suscripcion";
import { consumirLimite, respuestaLimite } from "@/lib/seguridad/limite-tasa";

const MAX_CUERPO = 4096;

async function usuarioActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Guarda la suscripción de este aparato para la persona que tiene la sesión abierta (el navegador la dio al activar
// las notificaciones). Si el aparato ya estaba guardado a nombre de otra persona (se cerró sesión y entró otra), pasa
// a la nueva: por eso se escribe con la clave de servicio, siempre con el id de quien tiene la sesión.
export async function POST(request: Request) {
  const user = await usuarioActual();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  if (Number(request.headers.get("content-length") ?? 0) > MAX_CUERPO) {
    return NextResponse.json({ error: "La solicitud es demasiado grande." }, { status: 413 });
  }
  if (!(await consumirLimite({ clave: `push:suscribir:${user.id}`, maximo: 30, ventanaSegundos: 3600 }))) {
    return respuestaLimite("Has activado las notificaciones muchas veces. Inténtalo en un rato.", 3600);
  }

  const cuerpo = await request.json().catch(() => null);
  const valida = validarSuscripcion(cuerpo);
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });

  const { error } = await createAdminClient()
    .from("suscripciones_push")
    .upsert(
      {
        user_id: user.id,
        endpoint: valida.suscripcion.endpoint,
        p256dh: valida.suscripcion.p256dh,
        auth: valida.suscripcion.auth,
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("notificaciones: no se pudo guardar la suscripción", error.message);
    return NextResponse.json({ error: "No se pudo guardar. Inténtalo de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Quita la suscripción de este aparato (al desactivar las notificaciones). Con la sesión de la persona: RLS solo
// deja borrar las suyas.
export async function DELETE(request: Request) {
  const user = await usuarioActual();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const cuerpo = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint = cuerpo?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 1024) {
    return NextResponse.json({ error: "Falta la dirección de la suscripción." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suscripciones_push").delete().eq("endpoint", endpoint);
  if (error) {
    console.error("notificaciones: no se pudo quitar la suscripción", error.message);
    return NextResponse.json({ error: "No se pudo quitar. Inténtalo de nuevo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
