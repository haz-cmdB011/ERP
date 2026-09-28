import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import {
  ROLES_VALIDOS,
  derivarArea,
  normalizarAreasMaquila,
  requiereArea,
  requiereContratista,
} from "@/lib/auth/roles";

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
  const areaEnviada = body?.area || null;
  // Nombre del usuario. En el maquilador es también su contratista (lo que
  // se imprime en sus recibos); se acepta "contratista" por compatibilidad.
  const nombreEnviado = typeof body?.nombre === "string" ? body.nombre : body?.contratista;
  const nombre = typeof nombreEnviado === "string" ? nombreEnviado.trim() : "";
  const contratista = nombre;
  const areasMaquila = normalizarAreasMaquila(body?.areasMaquila);

  if (!ROLES_VALIDOS.includes(rol)) {
    return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
  }
  if (requiereArea(rol) && !derivarArea(rol, areaEnviada)) {
    return NextResponse.json(
      { error: "Este rol requiere elegir un área válida." },
      { status: 400 }
    );
  }

  if (requiereContratista(rol) && !contratista) {
    return NextResponse.json(
      { error: "El maquilador necesita su nombre (es su contratista en los recibos)." },
      { status: 400 }
    );
  }
  if (requiereContratista(rol) && areasMaquila.length === 0) {
    return NextResponse.json(
      { error: "El maquilador necesita al menos un área de maquila." },
      { status: 400 }
    );
  }

  // Se usa el cliente normal (no service_role): la RLS "admin_update_any_perfil"
  // ya permite esto porque quien llama es admin, validado arriba con
  // requireAdmin(). No hace falta bypassar RLS para esta operación.
  const supabase = await createClient();
  const { error } = await supabase
    .from("perfiles")
    .update({
      rol,
      area: derivarArea(rol, areaEnviada),
      nombre_completo: nombre || null,
      contratista: requiereContratista(rol) ? contratista : null,
      areas_maquila: requiereContratista(rol) ? areasMaquila : null,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
