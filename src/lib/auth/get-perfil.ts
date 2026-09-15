import type { SupabaseClient } from "@supabase/supabase-js";

export type RolPerfil =
  | "desarrollador"
  | "admin_planeacion"
  | "admin_produccion"
  | "admin_calidad"
  | "admin_estimaciones"
  | "admin_finanzas"
  | "planeacion"
  | "area";

export interface PerfilActual {
  userId: string;
  rol: RolPerfil;
  area: "produccion" | "calidad" | "estimaciones" | "finanzas" | null;
}

export async function getPerfilActual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- evita acoplar este helper al tipo genérico de Database
  supabase: SupabaseClient<any>
): Promise<PerfilActual | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, area")
    .eq("id", user.id)
    .single();

  if (!perfil) return null;

  return { userId: user.id, rol: perfil.rol as RolPerfil, area: perfil.area };
}

// Único con permiso para eliminar/restaurar pedidos (PM) de Planeación.
export function puedeAdministrarPlaneacion(perfil: PerfilActual | null): boolean {
  return perfil?.rol === "desarrollador" || perfil?.rol === "admin_planeacion";
}
