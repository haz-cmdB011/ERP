import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPerfilActual, puedeEvaluarCalidad } from "@/lib/auth/get-perfil";
import { comprimirFotoEntrega, TAMANO_MAXIMO_FOTO } from "@/lib/produccion/foto-entrega";
import { BUCKET_FOTOS_NO_CONFORMIDAD } from "@/lib/calidad/no-conformidad";

export const runtime = "nodejs";

// Sube una foto de la no conformidad de un informe No aprobado (multipart,
// campo `foto`). Se comprime, se guarda en el bucket privado bajo la carpeta
// del informe y se registra con agregar_foto_informe_calidad, que vuelve a
// validar permiso, tipo de informe y el máximo de fotos.
export async function POST(request: Request, { params }: { params: Promise<{ informeId: string }> }) {
  const { informeId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(informeId)) {
    return NextResponse.json({ error: "Informe no válido." }, { status: 400 });
  }

  const supabase = await createClient();
  const perfil = await getPerfilActual(supabase);
  if (!perfil) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!puedeEvaluarCalidad(perfil)) {
    return NextResponse.json({ error: "Solo Calidad puede agregar fotos al informe." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  }
  if (foto.size > TAMANO_MAXIMO_FOTO) {
    return NextResponse.json({ error: "La foto pesa demasiado (máximo 4 MB)." }, { status: 413 });
  }

  const comprimida = await comprimirFotoEntrega(Buffer.from(await foto.arrayBuffer()));
  if (!comprimida) {
    return NextResponse.json({ error: "No se pudo leer la foto. Usa JPG, PNG o WebP." }, { status: 400 });
  }

  const ruta = `${informeId}/${crypto.randomUUID()}.webp`;
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_FOTOS_NO_CONFORMIDAD)
    .upload(ruta, comprimida, { contentType: "image/webp", cacheControl: "31536000" });
  if (errorSubida) {
    return NextResponse.json({ error: `No se pudo subir la foto: ${errorSubida.message}` }, { status: 500 });
  }

  const { data: id, error } = await supabase.rpc("agregar_foto_informe_calidad", {
    p_informe_id: informeId,
    p_foto_path: ruta,
  });
  if (error) {
    // La foto no quedó registrada: no debe quedar huérfana en el bucket.
    await createAdminClient().storage.from(BUCKET_FOTOS_NO_CONFORMIDAD).remove([ruta]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id });
}
