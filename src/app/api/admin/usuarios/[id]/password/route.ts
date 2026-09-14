import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // requireAdmin() exige rol === 'admin' exactamente (no 'planeacion' ni
  // 'area'): solo los administradores con acceso a todas las áreas pueden
  // restablecer contraseñas desde este panel.
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.updateUserById(id, { password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
