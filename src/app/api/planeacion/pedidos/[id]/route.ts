import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verificarContrasena } from "@/lib/auth/verificar-contrasena";
import { eliminarPedidoDefinitivo } from "@/lib/planeacion/eliminar-pedido-db";

// Borrado DEFINITIVO de un pedido (PM), sin forma de deshacerlo (detalle en
// eliminarPedidoDefinitivo). Exige la contraseña de quien lo pide en el cuerpo:
// { "contrasena": "…" }. El permiso real lo sigue exigiendo el RPC.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as { contrasena?: unknown };
  const contrasena = typeof cuerpo.contrasena === "string" ? cuerpo.contrasena : "";
  if (!(await verificarContrasena(user.email, contrasena))) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 403 });
  }

  const { id } = await params;
  const { error, conservadoPorFolio } = await eliminarPedidoDefinitivo(supabase, id);
  if (error) {
    return NextResponse.json({ error }, { status: 403 });
  }
  return NextResponse.json({ ok: true, conservadoPorFolio });
}
