import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Borrado DEFINITIVO de un pedido (PM): si ninguno de sus ítems tiene
// folio de Calidad, borra en cascada sus versiones/items/imágenes (sin
// forma de deshacerlo). Si ya tiene folio(s), el RPC eliminar_pedido_definitivo
// NO borra nada — deja el pedido y sus ítems como "cancelado" para no
// perder ese historial (ver migración preservar_folio_calidad_al_eliminar_pedido).
// El permiso real lo sigue exigiendo el RPC (is_admin() / is_admin_planeacion()).
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
  const { data: conservadoPorFolio, error } = await supabase.rpc("eliminar_pedido_definitivo", {
    p_pedido_id: id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ ok: true, conservadoPorFolio });
}
