import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { contrasenaFiltrada, MENSAJE_CONTRASENA_FILTRADA } from "@/lib/auth/contrasena-filtrada";
import {
  ROLES_VALIDOS,
  derivarArea,
  normalizarAreasMaquila,
  requiereArea,
  requiereContratista,
} from "@/lib/auth/roles";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const rol = body?.rol;
  const areaEnviada = body?.area || null;
  // Nombre del usuario. En el maquilador es también su contratista (lo que
  // se imprime en sus recibos); se acepta "contratista" por compatibilidad.
  const nombreEnviado = typeof body?.nombre === "string" ? body.nombre : body?.contratista;
  const nombre = typeof nombreEnviado === "string" ? nombreEnviado.trim() : "";
  const contratista = nombre;
  const areasMaquila = normalizarAreasMaquila(body?.areasMaquila);

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }
  if (await contrasenaFiltrada(password)) {
    return NextResponse.json({ error: MENSAJE_CONTRASENA_FILTRADA }, { status: 400 });
  }
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

  // Se crea directamente con email + contraseña y el correo ya confirmado:
  // no depende de ningún link de Supabase. Los links de Supabase quedan
  // reservados exclusivamente para el flujo de "olvidé mi contraseña".
  const adminClient = createAdminClient();
  const { data: creado, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !creado.user) {
    return NextResponse.json(
      { error: `No se pudo crear el usuario: ${createError?.message ?? "error desconocido"}` },
      { status: 500 }
    );
  }

  // El trigger on_auth_user_created ya creó la fila en perfiles con los
  // valores por defecto (rol='usuario', area=null); la actualizamos con lo
  // elegido en el formulario.
  const { error: updateError } = await adminClient
    .from("perfiles")
    .update({
      rol,
      area: derivarArea(rol, areaEnviada),
      nombre_completo: nombre || null,
      contratista: requiereContratista(rol) ? contratista : null,
      areas_maquila: requiereContratista(rol) ? areasMaquila : null,
    })
    .eq("id", creado.user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Usuario creado pero no se pudo asignar el rol: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, userId: creado.user.id, email });
}
