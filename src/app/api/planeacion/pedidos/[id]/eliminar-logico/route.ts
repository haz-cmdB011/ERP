import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Borrado LÓGICO: marca el pedido como eliminado sin perder su historial
// (puede restaurarse). El permiso (desarrollador o admin_planeacion) se
// valida dentro de la función soft_delete_pedido, que lanza una excepción
// si el usuario no califica.
export async function POST(
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
  const { error } = await supabase.rpc("soft_delete_pedido", { p_pedido_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
