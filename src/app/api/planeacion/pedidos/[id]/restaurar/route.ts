import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Deshace un borrado lógico. Mismo esquema de permisos que eliminar-logico:
// lo valida restore_pedido() internamente.
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
  const { error } = await supabase.rpc("restore_pedido", { p_pedido_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
