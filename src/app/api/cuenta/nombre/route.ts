import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOMBRE_MAX, NOMBRE_MIN, normalizarNombre } from "@/lib/cuenta/nombre";

// Cambia el nombre de la persona que tiene la sesión. Solo toca su propia fila
// de perfiles (la política perfiles_update_own de la base lo exige además).
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const nombre = normalizarNombre(body?.nombre);
  if (!nombre) {
    return NextResponse.json(
      { error: `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("perfiles")
    .update({ nombre_completo: nombre })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar el nombre: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ nombre });
}
