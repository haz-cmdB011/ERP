import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET_AVATARES,
  LADO_AVATAR,
  MAX_BYTES_FOTO,
  TIPOS_FOTO,
  asegurarBucketAvatares,
  nuevaRutaAvatar,
  rutaAvatarValida,
} from "@/lib/cuenta/avatar";
import { detectarFormatoImagen, LIMITE_PIXELES } from "@/lib/seguridad/imagen";

async function usuarioActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Sube o reemplaza la foto de perfil. El navegador ya la reduce, pero aquí se
// valida y se normaliza otra vez (no se confía en el cliente): cuadrada de
// 256 px en WebP, con la orientación de la cámara aplicada.
export async function POST(request: Request) {
  const user = await usuarioActual();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const formulario = await request.formData().catch(() => null);
  const archivo = formulario?.get("foto");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ninguna imagen." }, { status: 400 });
  }
  if (!(TIPOS_FOTO as readonly string[]).includes(archivo.type)) {
    return NextResponse.json({ error: "La foto debe ser JPG, PNG o WebP." }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES_FOTO) {
    return NextResponse.json({ error: "La foto pesa demasiado (máximo 2 MB)." }, { status: 400 });
  }

  // Se confía en los bytes, no en el tipo que declara el navegador.
  const original = Buffer.from(await archivo.arrayBuffer());
  if (!detectarFormatoImagen(original)) {
    return NextResponse.json({ error: "La foto debe ser JPG, PNG o WebP." }, { status: 400 });
  }

  let imagen: Buffer;
  try {
    imagen = await sharp(original, { limitInputPixels: LIMITE_PIXELES })
      .rotate()
      .resize(LADO_AVATAR, LADO_AVATAR, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "No se pudo leer la imagen. Prueba con otra." }, { status: 400 });
  }

  try {
    await asegurarBucketAvatares();
  } catch (e) {
    return NextResponse.json(
      { error: `No se pudo preparar el almacenamiento: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const ruta = nuevaRutaAvatar(user.id);
  const { error: errorSubida } = await admin.storage
    .from(BUCKET_AVATARES)
    .upload(ruta, imagen, { contentType: "image/webp", upsert: false });
  if (errorSubida) {
    return NextResponse.json({ error: `No se pudo guardar la foto: ${errorSubida.message}` }, { status: 500 });
  }

  const anterior = user.app_metadata?.avatar_path;
  const { error: errorPerfil } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, avatar_path: ruta },
  });
  if (errorPerfil) {
    await admin.storage.from(BUCKET_AVATARES).remove([ruta]);
    return NextResponse.json({ error: `No se pudo actualizar tu perfil: ${errorPerfil.message}` }, { status: 500 });
  }

  // La foto anterior ya no se usa: se borra para no acumular archivos.
  if (rutaAvatarValida(user.id, anterior)) {
    await admin.storage.from(BUCKET_AVATARES).remove([anterior]);
  }
  return NextResponse.json({ ok: true });
}

// Quita la foto: se vuelve a mostrar la inicial.
export async function DELETE() {
  const user = await usuarioActual();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const admin = createAdminClient();
  const anterior = user.app_metadata?.avatar_path;
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, avatar_path: null },
  });
  if (error) {
    return NextResponse.json({ error: `No se pudo quitar la foto: ${error.message}` }, { status: 500 });
  }
  if (rutaAvatarValida(user.id, anterior)) {
    await admin.storage.from(BUCKET_AVATARES).remove([anterior]);
  }
  return NextResponse.json({ ok: true });
}
