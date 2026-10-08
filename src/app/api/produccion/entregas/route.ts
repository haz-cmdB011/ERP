import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfilActual, puedeEditarProduccion } from "@/lib/auth/get-perfil";
import {
  BUCKET_FOTOS_ENTREGA,
  leerCantidad,
  leerFecha,
  mensajeErrorRpc,
} from "@/lib/produccion/asignaciones";
import { comprimirFotoEntrega, TAMANO_MAXIMO_FOTO } from "@/lib/produccion/foto-entrega";
import {
  esFotoYaSubida,
  esRechazoDefinitivo,
  esViolacionUnica,
  leerClaveEnvio,
  rutaFotoEntrega,
} from "@/lib/produccion/envio-entrega";

export const runtime = "nodejs";

// Registra una entrega de un equipo: fecha en que terminó, cantidad, folios de
// Calidad y la foto de la hoja (multipart/form-data). La foto se comprime,
// se sube al bucket privado y después se registra la entrega con la función
// registrar_entrega_produccion, que vuelve a validar todo (permisos,
// cantidades, fechas).
//
// Es seguro REPETIR el mismo envío: el celular guarda las capturas hechas sin red y las
// reenvía al volver la conexión, y puede reenviar una que el servidor ya había guardado
// (la red se cortó antes de que llegara la respuesta). La `claveEnvio` que manda el celular
// fija la ruta de la foto, y un índice único sobre foto_path (migración
// entregas_foto_unica) impide que esa ruta registre dos entregas: el reintento recibe la
// misma entrega, marcada `repetida`.
async function entregaDeFoto(supabase: Awaited<ReturnType<typeof createClient>>, ruta: string) {
  const { data } = await supabase
    .from("entregas_produccion")
    .select("id")
    .eq("foto_path", ruta)
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
  const foto = form.get("foto");

  if (typeof asignacionId !== "string" || !/^[0-9a-f-]{36}$/i.test(asignacionId)) {
    return NextResponse.json({ error: "Asignación no válida." }, { status: 400 });
  }
  const ruta = rutaFotoEntrega(asignacionId, leerClaveEnvio(form.get("claveEnvio")));

  // ¿Este mismo envío ya se registró en un intento anterior?
  const previa = await entregaDeFoto(supabase, ruta);
  if (previa) {
    return NextResponse.json({ ok: true, id: previa, repetida: true });
  }

  if (!fecha) {
    return NextResponse.json({ error: "Fecha de entrega no válida." }, { status: 400 });
  }
  if (cantidad === null) {
    return NextResponse.json({ error: "La cantidad debe ser mayor que cero." }, { status: 400 });
  }
  if (typeof folios !== "string" || !folios.trim()) {
    return NextResponse.json({ error: "Escribe los folios de Calidad." }, { status: 400 });
  }
  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "Falta la foto de los folios." }, { status: 400 });
  }
  if (foto.size > TAMANO_MAXIMO_FOTO) {
    return NextResponse.json({ error: "La foto pesa demasiado (máximo 4 MB)." }, { status: 413 });
  }

  const comprimida = await comprimirFotoEntrega(Buffer.from(await foto.arrayBuffer()));
  if (!comprimida) {
    return NextResponse.json(
      { error: "No se pudo leer la foto. Usa JPG, PNG o WebP." },
      { status: 400 }
    );
  }

  // Si un intento anterior de este envío ya subió la foto (y se cortó antes de registrar),
  // se reutiliza: es la misma foto.
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_FOTOS_ENTREGA)
    .upload(ruta, comprimida, { contentType: "image/webp" });
  if (errorSubida && !esFotoYaSubida(errorSubida)) {
    return NextResponse.json(
      { error: `No se pudo subir la foto: ${errorSubida.message}` },
      { status: 500 }
    );
  }

  const { data: entregaId, error } = await supabase.rpc("registrar_entrega_produccion", {
    p_asignacion_id: asignacionId,
    p_fecha_entrega: fecha,
    p_cantidad: cantidad,
    p_folios_calidad: folios.trim().slice(0, 500),
    p_foto_path: ruta,
  });

  if (error) {
    // Dos envíos iguales a la vez: ganó el otro. La foto es la de la entrega registrada,
    // así que NO se borra.
    if (esViolacionUnica(error)) {
      const id = await entregaDeFoto(supabase, ruta);
      if (id) return NextResponse.json({ ok: true, id, repetida: true });
    }
    // La entrega no quedó: la foto subida no debe quedar huérfana. El bucket
    // no deja borrar a nadie desde la app, por eso se usa service role.
    await createAdminClient().storage.from(BUCKET_FOTOS_ENTREGA).remove([ruta]);
    // 400 = la regla de la base la rechazó (repetir no la arregla). Cualquier otra falla
    // (corte con la base, tiempo agotado) es pasajera: 500, y el celular reintenta.
    return NextResponse.json(
      { error: mensajeErrorRpc(error.message) },
      { status: esRechazoDefinitivo(error) ? 400 : 500 }
    );
  }

  return NextResponse.json({ ok: true, id: entregaId });
}
