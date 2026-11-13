import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enviarASuscripciones, notificacionesConfiguradas } from "@/lib/notificaciones/enviar";
import type { SuscripcionPush } from "@/lib/notificaciones/suscripcion";
import { consumirLimite, respuestaLimite } from "@/lib/seguridad/limite-tasa";

// Manda una notificación de prueba a los aparatos de la persona que tiene la sesión abierta, para comprobar que las
// notificaciones funcionan. Lee sus suscripciones con su propia sesión (RLS: solo ve las suyas).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  if (!(await consumirLimite({ clave: `push:prueba:${user.id}`, maximo: 10, ventanaSegundos: 3600 }))) {
    return respuestaLimite("Has pedido muchas pruebas. Inténtalo en un rato.", 3600);
  }
  if (!notificacionesConfiguradas()) {
    return NextResponse.json({ error: "Las notificaciones todavía no están configuradas en el servidor." }, { status: 503 });
  }

  const { data, error } = await supabase.from("suscripciones_push").select("endpoint, p256dh, auth").returns<SuscripcionPush[]>();
  if (error) {
    console.error("notificaciones: no se pudieron leer las suscripciones", error.message);
    return NextResponse.json({ error: "No se pudo leer tu suscripción. Inténtalo de nuevo." }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Este aparato no tiene las notificaciones activadas." }, { status: 409 });
  }

  const resultado = await enviarASuscripciones(data, {
    titulo: "Notificación de prueba",
    cuerpo: "Así te avisaremos de lo importante de tu área.",
    url: "/cuenta",
    etiqueta: "prueba",
  });
  // Las que ya no existen (se desinstaló la app o se quitó el permiso) se limpian.
  if (resultado.caducadas.length > 0) {
    await supabase.from("suscripciones_push").delete().in("endpoint", resultado.caducadas);
  }
  if (resultado.enviadas === 0) {
    return NextResponse.json({ error: "No se pudo enviar. Desactiva y vuelve a activar las notificaciones." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, enviadas: resultado.enviadas });
}
