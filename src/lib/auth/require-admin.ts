import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

type RequireAdminResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Verifica que el usuario autenticado en la sesión actual tiene rol
 * 'desarrollador' en public.perfiles (acceso global, sin restricción de
 * área — hoy reservado al equipo técnico). Debe llamarse al inicio de toda
 * ruta o server action que dependa del cliente con privilegios de
 * service_role.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, error: "No autenticado." };
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (perfil?.rol !== "desarrollador") {
    return { ok: false, status: 403, error: "Requiere rol de desarrollador." };
  }

  return { ok: true, user };
}
