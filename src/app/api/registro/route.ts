import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Registro público (sin sesión): a diferencia de /api/admin/usuarios/crear,
// cualquier trabajador puede llamar esta ruta para darse de alta a sí
// mismo. Por eso el rol queda fijo en 'usuario' (el más bajo, sin permisos
// de escritura) — no se puede elegir desde el formulario.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const nombres = typeof body?.nombres === "string" ? body.nombres.trim() : "";
  const apellidos = typeof body?.apellidos === "string" ? body.apellidos.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!nombres) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (!apellidos) {
    return NextResponse.json({ error: "Los apellidos son obligatorios." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  // Igual que la creación de usuarios por un admin: se crea ya confirmado,
  // sin pasar por el flujo de confirmación por correo de Supabase.
  const adminClient = createAdminClient();
  const { data: creado, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !creado.user) {
    return NextResponse.json(
      { error: `No se pudo crear la cuenta: ${createError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  // El trigger on_auth_user_created ya creó la fila en perfiles con los
  // valores por defecto (rol='usuario', area=null); se completa el nombre
  // y se deja explícito el rol más bajo, sin depender solo del default.
  const { error: updateError } = await adminClient
    .from("perfiles")
    .update({
      nombre_completo: `${nombres} ${apellidos}`,
      rol: "usuario",
      area: null,
    })
    .eq("id", creado.user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Cuenta creada pero no se pudo completar el perfil: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email });
}
