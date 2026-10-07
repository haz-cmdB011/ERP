import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  COOKIE_PENDIENTES_OCULTOS,
  estaOculta,
  pendientesDeCuenta,
  type PendienteCuenta,
} from "@/lib/cuenta/pendientes";
import TarjetaPendientesCuenta, { type PendienteMostrado } from "./tarjeta-pendientes-cuenta";

// Resumen del inicio de un área: qué le falta a la cuenta de quien entró
// (nombre, foto, verificación en dos pasos). No dibuja nada si la cuenta está
// completa, si la persona ya lo ocultó o si todavía no tiene rol asignado (a
// esas cuentas ya se les muestra el aviso de cuenta pendiente).
export default async function PendientesCuenta({ href = "/planeacion/cuenta" }: { href?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: perfil }, { data: factores }] = await Promise.all([
    supabase.from("perfiles").select("nombre_completo, rol").eq("id", user.id).single(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (!perfil || perfil.rol === "usuario") return null;

  const pendientes = pendientesDeCuenta({
    nombre: perfil.nombre_completo,
    tieneFoto: !!user.app_metadata?.avatar_path,
    // `totp` solo trae los factores ya verificados (los de un alta a medias no).
    mfaActivo: (factores?.totp?.length ?? 0) > 0,
  });
  if (estaOculta(pendientes, (await cookies()).get(COOKIE_PENDIENTES_OCULTOS)?.value)) return null;

  const esDesarrollador = perfil.rol === "desarrollador";
  const textos: Record<PendienteCuenta, { titulo: string; detalle: string }> = {
    nombre: { titulo: "Agrega tu nombre", detalle: "Se muestra en lugar de tu correo." },
    foto: { titulo: "Sube tu foto de perfil", detalle: "Aparece en la barra superior." },
    mfa: {
      titulo: "Activa la verificación en dos pasos",
      detalle: esDesarrollador ? "Recomendado para desarrolladores." : "Opcional: un código de tu teléfono al entrar.",
    },
  };
  const mostrados: PendienteMostrado[] = pendientes.map((id) => ({ id, ...textos[id] }));

  return <TarjetaPendientesCuenta pendientes={mostrados} href={href} />;
}
