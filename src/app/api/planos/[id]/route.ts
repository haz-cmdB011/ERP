import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Los planos viven en un bucket privado: este endpoint genera una URL
// firmada de corta duración en el momento de abrirlo (en vez de firmar
// todos los PDF de un pedido al cargar la página) y redirige a ella.
const SIGNED_URL_EXPIRES_SECONDS = 300;

export async function GET(
  _request: Request,
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
  const { data: plano } = await supabase
    .from("planos")
    .select("storage_path, nombre_archivo")
    .eq("id", id)
    .maybeSingle<{ storage_path: string; nombre_archivo: string }>();
  if (!plano) {
    return NextResponse.json({ error: "Plano no encontrado." }, { status: 404 });
  }

  const { data: firmada, error } = await supabase.storage
    .from("planos")
    .createSignedUrl(plano.storage_path, SIGNED_URL_EXPIRES_SECONDS);
  if (error || !firmada) {
    return NextResponse.json(
      { error: `No se pudo abrir el plano: ${error?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  redirect(firmada.signedUrl);
}
