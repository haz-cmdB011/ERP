import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolValido, AreaValida } from "./roles";

export interface PerfilActual {
  userId: string;
  rol: RolValido;
  area: AreaValida | null;
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

  return { userId: user.id, rol: perfil.rol as RolValido, area: perfil.area };
}

// Único con permiso para eliminar/restaurar pedidos (PM) de Planeación:
// el desarrollador (acceso global) o el administrador de esa área.
export function puedeAdministrarPlaneacion(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    (perfil?.rol === "administrador" && perfil.area === "planeacion")
  );
}
