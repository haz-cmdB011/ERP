import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES_VALIDOS = ["admin", "planeacion", "area"] as const;
const AREAS_VALIDAS = ["produccion", "calidad", "estimaciones", "finanzas"] as const;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const rol = body?.rol;
  const area = body?.area || null;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }
  if (rol === "area" && !AREAS_VALIDAS.includes(area)) {
    return NextResponse.json(
      { error: "Un usuario de rol 'area' requiere un área válida." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const origin = new URL(request.url).origin;

  const { data: invitado, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/callback`,
    });

  if (inviteError || !invitado.user) {
    return NextResponse.json(
      { error: `No se pudo invitar al usuario: ${inviteError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  // El trigger on_auth_user_created ya creó la fila en perfiles con los
  // valores por defecto (rol='area', area=null); la actualizamos con lo
  // elegido en el formulario.
  const { error: updateError } = await adminClient
    .from("perfiles")
    .update({ rol, area: rol === "area" ? area : null })
    .eq("id", invitado.user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Usuario invitado pero no se pudo asignar el rol: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: invitado.user.id, email });
}
