import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contrasenaFiltrada, MENSAJE_CONTRASENA_FILTRADA } from "@/lib/auth/contrasena-filtrada";
import {
  crearLimitadorPorIp,
  dominioPermitido,
  dominiosPermitidos,
  emailValido,
  ipDe,
  MAX_ALTAS_POR_HORA,
  MAX_ALTAS_POR_IP,
  MAX_NOMBRE,
  MAX_PASSWORD,
  MIN_PASSWORD,
  VENTANA_IP_MS,
} from "@/lib/seguridad/registro";
import { consumirLimite, respuestaLimite } from "@/lib/seguridad/limite-tasa";

// Registro público (sin sesión): a diferencia de /api/admin/usuarios/crear,
// cualquier trabajador puede llamar esta ruta para darse de alta a sí
// mismo. Por eso el rol queda fijo en 'usuario' (el más bajo): la cuenta queda
// PENDIENTE hasta que un administrador le asigne rol y área, y mientras tanto la
// base de datos no le deja ver los datos de la empresa (migración
// lectura_solo_personal). No se puede elegir rol desde el formulario.
//
// Defensas contra altas masivas (esta ruta no pide sesión):
//  - REGISTRO_DOMINIOS_PERMITIDOS (opcional, "empresa.com,otra.com"): solo
//    correos de esos dominios;
//  - tope por IP (contado en la base, más uno en memoria de respaldo) y tope global
//    por hora (contado en la base).
const excedeLimitePorIp = crearLimitadorPorIp();

export async function POST(request: Request) {
  if (excedeLimitePorIp(ipDe(request))) {
    return NextResponse.json(
      { error: "Demasiados intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo." },
      { status: 429 }
    );
  }

  // El tope en memoria de arriba es por instancia; este se cuenta en la base y vale
  // para todas (misma cantidad y ventana que MAX_ALTAS_POR_IP / VENTANA_IP_MS).
  if (
    !(await consumirLimite({
      clave: `registro:ip:${ipDe(request)}`,
      maximo: MAX_ALTAS_POR_IP,
      ventanaSegundos: VENTANA_IP_MS / 1000,
    }))
  ) {
    return respuestaLimite(
      "Demasiados intentos desde tu conexión. Espera unos minutos e inténtalo de nuevo.",
      VENTANA_IP_MS / 1000
    );
  }

  const body = await request.json().catch(() => null);
  const nombres = typeof body?.nombres === "string" ? body.nombres.trim() : "";
  const apellidos = typeof body?.apellidos === "string" ? body.apellidos.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!nombres) {
    return NextResponse.json({ error: "El nombre es obligatorio." }, { status: 400 });
  }
  if (!apellidos) {
    return NextResponse.json({ error: "Los apellidos son obligatorios." }, { status: 400 });
  }
  if (nombres.length > MAX_NOMBRE || apellidos.length > MAX_NOMBRE) {
    return NextResponse.json(
      { error: `El nombre y los apellidos no pueden pasar de ${MAX_NOMBRE} caracteres.` },
      { status: 400 }
    );
  }
  if (!emailValido(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (!dominioPermitido(email, dominiosPermitidos(process.env.REGISTRO_DOMINIOS_PERMITIDOS))) {
    return NextResponse.json(
      { error: "Solo se pueden registrar correos de la empresa. Pide a un administrador que te cree la cuenta." },
      { status: 403 }
    );
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json(
      { error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.` },
      { status: 400 }
    );
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD) {
    return NextResponse.json(
      { error: `La contraseña no puede pasar de ${MAX_PASSWORD} caracteres.` },
      { status: 400 }
    );
  }

  if (await contrasenaFiltrada(password)) {
    return NextResponse.json({ error: MENSAJE_CONTRASENA_FILTRADA }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Tope global: si en la última hora ya se crearon demasiadas cuentas, se pausa
  // el registro (señal de abuso). Un administrador puede crear cuentas a mano.
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recientes } = await adminClient
    .from("perfiles")
    .select("id", { count: "exact", head: true })
    .gte("created_at", haceUnaHora);
  if ((recientes ?? 0) >= MAX_ALTAS_POR_HORA) {
    return NextResponse.json(
      { error: "El registro está temporalmente pausado por exceso de solicitudes. Inténtalo más tarde o pide a un administrador que te cree la cuenta." },
      { status: 429 }
    );
  }

  // Igual que la creación de usuarios por un admin: se crea ya confirmado,
  // sin pasar por el flujo de confirmación por correo de Supabase.
  const { data: creado, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !creado.user) {
    // Mensaje genérico: el detalle (p. ej. "ya existe ese correo") revelaría qué
    // correos tienen cuenta. El motivo real queda en el registro del servidor.
    console.error("registro: no se pudo crear la cuenta", createError?.message);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Revisa los datos o pide a un administrador que la cree." },
      { status: 400 }
    );
  }

  // El trigger on_auth_user_created ya creó la fila en perfiles con los
  // valores por defecto (rol='usuario', area=null); se completa el nombre
  // y se deja explícito el rol más bajo, sin depender solo del default.
  const { error: updateError } = await adminClient
    .from("perfiles")
    .update({
      nombre_completo: `${nombres} ${apellidos}`,
      rol: "usuario",
      area: null,
    })
    .eq("id", creado.user.id);

  if (updateError) {
    console.error("registro: cuenta creada pero perfil incompleto", updateError.message);
    return NextResponse.json(
      { error: "Tu cuenta se creó, pero no se pudo completar el perfil. Avisa a un administrador." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, email });
}
