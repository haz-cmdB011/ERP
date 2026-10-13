import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { mensajeErrorRpc } from "@/lib/produccion/asignaciones";
import { esUuid } from "@/lib/produccion/qr-viajero";
import { esRechazoDefinitivo, leerClaveEnvio } from "@/lib/produccion/envio-entrega";
import { lineasDesdeJson, validarLineas } from "@/lib/produccion/despiece";

export const runtime = "nodejs";

// Guarda el despiece de un mueble. Pasa por aquí (y no directo a la base desde el
// navegador) para poder usar la cola de envíos sin conexión: el taller a veces pierde
// el Wi-Fi y el despiece no debe perderse.
//
// Es seguro REPETIR el mismo envío: la `claveEnvio` queda en el historial del despiece
// y guardar_despiece_produccion no vuelve a guardar una clave que ya vio. Si alguien
// guardó otra versión mientras tanto, responde 409 con el motivo (la cola lo muestra
// como rechazado y la persona decide qué hacer con sus cambios).
export async function POST(request: Request) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!puedeEditarProduccion(perfil)) {
    return NextResponse.json({ error: "Solo Producción puede guardar el despiece." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const itemId = form.get("itemId");
  if (typeof itemId !== "string" || !esUuid(itemId)) {
    return NextResponse.json({ error: "Ítem no válido." }, { status: 400 });
  }
  const versionCruda = form.get("versionEsperada");
  const version = typeof versionCruda === "string" && /^\d{1,9}$/.test(versionCruda) ? Number(versionCruda) : null;
  if (version === null) {
    return NextResponse.json({ error: "Falta la versión del despiece." }, { status: 400 });
  }

  let lineas;
  try {
    const crudo = form.get("lineas");
    lineas = lineasDesdeJson(typeof crudo === "string" ? JSON.parse(crudo) : null);
  } catch {
    return NextResponse.json({ error: "Las líneas del despiece no son válidas." }, { status: 400 });
  }
  const problema = validarLineas(lineas);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  const { data, error } = await supabase.rpc("guardar_despiece_produccion", {
    p_item_id: itemId,
    p_lineas: lineas,
    p_version_esperada: version,
    p_igual_a_sugerencia: form.get("igualASugerencia") === "true",
    p_clave_envio: leerClaveEnvio(form.get("claveEnvio")),
  });

  if (error) {
    const mensaje = mensajeErrorRpc(error.message);
    const conflicto = /Alguien más guardó/.test(mensaje);
    return NextResponse.json(
      { error: mensaje, conflicto },
      { status: conflicto ? 409 : esRechazoDefinitivo(error) ? 400 : 500 }
    );
  }
  return NextResponse.json({ ok: true, version: data });
}
