import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rutaInternaSegura } from "@/lib/seguridad/redireccion";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Solo rutas internas: ver rutaInternaSegura (redirección abierta).
  const next = rutaInternaSegura(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
