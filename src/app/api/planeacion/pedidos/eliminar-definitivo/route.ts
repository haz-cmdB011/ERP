import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verificarContrasena } from "@/lib/auth/verificar-contrasena";
import { eliminarPedidoDefinitivo } from "@/lib/planeacion/eliminar-pedido-db";

const MAX_PEDIDOS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResultadoEliminacion {
  id: string;
  ok: boolean;
  conservadoPorFolio?: boolean;
  error?: string;
}

// Borrado DEFINITIVO de varios pedidos a la vez: { "ids": [...], "contrasena": "…" }.
// La contraseña se comprueba una sola vez; después cada pedido pasa por el mismo
// RPC que el borrado individual (que valida el permiso) y un fallo en uno no
// detiene a los demás: la respuesta trae el resultado de cada uno.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as { ids?: unknown; contrasena?: unknown };
  const ids = Array.isArray(cuerpo.ids) ? [...new Set(cuerpo.ids)] : [];
  if (ids.length === 0 || ids.length > MAX_PEDIDOS || !ids.every((i) => typeof i === "string" && UUID.test(i))) {
    return NextResponse.json(
      { error: `Indica entre 1 y ${MAX_PEDIDOS} pedidos válidos.` },
      { status: 400 }
    );
  }
  const contrasena = typeof cuerpo.contrasena === "string" ? cuerpo.contrasena : "";
  if (!(await verificarContrasena(user.email, contrasena))) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 403 });
  }

  const resultados: ResultadoEliminacion[] = [];
  for (const id of ids as string[]) {
    const { error, conservadoPorFolio } = await eliminarPedidoDefinitivo(supabase, id);
    resultados.push(error ? { id, ok: false, error } : { id, ok: true, conservadoPorFolio });
  }
  return NextResponse.json({ resultados });
}
