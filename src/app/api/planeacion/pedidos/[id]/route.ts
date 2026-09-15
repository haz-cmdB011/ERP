import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Borrado DEFINITIVO de un pedido (PM): borra en cascada sus versiones,
// items e imágenes. Restringido por la política RLS
// "planeacion_admin_delete_pedidos" (desarrollador o admin_planeacion) —
// no se valida el rol aquí porque la RLS ya es la fuente de verdad: si el
// usuario no tiene permiso, el delete simplemente no afecta ninguna fila.
export async function DELETE(
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
  const { data, error } = await supabase.from("pedidos").delete().eq("id", id).select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "No tienes permiso para eliminar este pedido, o no existe." },
      { status: 403 }
    );
  }

  return NextResponse.json({ ok: true });
}
