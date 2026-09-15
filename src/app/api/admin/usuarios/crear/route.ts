import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES_VALIDOS, derivarArea } from "@/lib/auth/roles";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const rol = body?.rol;
  const areaEnviada = body?.area || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }
  if (rol === "area" && !derivarArea(rol, areaEnviada)) {
    return NextResponse.json(
      { error: "Un usuario de rol 'area' requiere un área válida." },
      { status: 400 }
    );
  }

  // Se crea directamente con email + contraseña y el correo ya confirmado:
  // no depende de ningún link de Supabase. Los links de Supabase quedan
  // reservados exclusivamente para el flujo de "olvidé mi contraseña".
  const adminClient = createAdminClient();
  const { data: creado, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !creado.user) {
    return NextResponse.json(
      { error: `No se pudo crear el usuario: ${createError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  // El trigger on_auth_user_created ya creó la fila en perfiles con los
  // valores por defecto (rol='area', area=null); la actualizamos con lo
  // elegido en el formulario.
  const { error: updateError } = await adminClient
    .from("perfiles")
    .update({ rol, area: derivarArea(rol, areaEnviada) })
    .eq("id", creado.user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Usuario creado pero no se pudo asignar el rol: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: creado.user.id, email });
}
