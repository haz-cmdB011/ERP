import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import { leerCantidad, leerFecha, mensajeErrorRpc } from "@/lib/produccion/asignaciones";
import { esRechazoDefinitivo, esViolacionUnica, leerClaveEnvio } from "@/lib/produccion/envio-entrega";

export const runtime = "nodejs";

// Registra una entrega de un equipo: fecha en que terminó, cantidad y folio de la hoja
// de entrega. Producción no califica las piezas ni sube foto (migración
// entrega_sin_foto_ni_calificacion): la entrega pasa a Calidad, que es quien evalúa.
// registrar_entrega_produccion vuelve a validar todo (permisos, cantidades, fechas).
// Las capturas que quedaron en la cola con la pantalla anterior traen foto y
// calificación: se ignoran y se registran igual que las nuevas.
//
// Es seguro REPETIR el mismo envío: el celular guarda las capturas hechas sin red y las
// reenvía al volver la conexión, y puede reenviar una que el servidor ya había guardado
// (la red se cortó antes de que llegara la respuesta). La `claveEnvio` que manda el celular
// queda en la entrega (índice único): la función devuelve la misma entrega en vez de
// registrar otra.
async function entregaDeClave(supabase: Awaited<ReturnType<typeof createClient>>, clave: string) {
  const { data } = await supabase
    .from("entregas_produccion")
    .select("id")
    .eq("clave_envio", clave)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!puedeEditarProduccion(perfil)) {
    return NextResponse.json({ error: "Solo Producción puede registrar entregas." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const asignacionId = form.get("asignacionId");
  const fecha = leerFecha(form.get("fecha"));
  const cantidad = leerCantidad(form.get("cantidad"));
  const folios = form.get("folios");

  if (typeof asignacionId !== "string" || !/^[0-9a-f-]{36}$/i.test(asignacionId)) {
    return NextResponse.json({ error: "Asignación no válida." }, { status: 400 });
  }
  const clave = leerClaveEnvio(form.get("claveEnvio"));
  if (!fecha) {
    return NextResponse.json({ error: "Fecha de entrega no válida." }, { status: 400 });
  }
  if (cantidad === null) {
    return NextResponse.json({ error: "La cantidad debe ser mayor que cero." }, { status: 400 });
  }
  if (typeof folios !== "string" || !folios.trim()) {
    return NextResponse.json({ error: "Escribe el folio de la hoja de entrega." }, { status: 400 });
  }

  const { data: entregaId, error } = await supabase.rpc("registrar_entrega_produccion", {
    p_asignacion_id: asignacionId,
    p_fecha_entrega: fecha,
    p_cantidad: cantidad,
    p_folios_calidad: folios.trim().slice(0, 500),
    p_clave_envio: clave,
  });

  if (error) {
    // Dos envíos iguales a la vez: ganó el otro.
    if (esViolacionUnica(error)) {
      const id = await entregaDeClave(supabase, clave);
      if (id) return NextResponse.json({ ok: true, id, repetida: true });
    }
    // 400 = la regla de la base la rechazó (repetir no la arregla). Cualquier otra falla
    // (corte con la base, tiempo agotado) es pasajera: 500, y el celular reintenta.
    return NextResponse.json(
      { error: mensajeErrorRpc(error.message) },
      { status: esRechazoDefinitivo(error) ? 400 : 500 }
    );
  }

  return NextResponse.json({ ok: true, id: entregaId });
}
