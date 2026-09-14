import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

const ROLES_VALIDOS = ["admin", "planeacion", "area"] as const;
const AREAS_VALIDAS = ["produccion", "calidad", "estimaciones", "finanzas"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const rol = body?.rol;
  const area = body?.area || null;

  if (!ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }
  if (rol === "area" && !AREAS_VALIDAS.includes(area)) {
    return NextResponse.json(
      { error: "Un usuario de rol 'area' requiere un área válida." },
      { status: 400 }
    );
  }

  // Se usa el cliente normal (no service_role): la RLS "admin_update_any_perfil"
  // ya permite esto porque quien llama es admin, validado arriba con
  // requireAdmin(). No hace falta bypassar RLS para esta operación.
  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles")
    .update({ rol, area: rol === "area" ? area : null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
