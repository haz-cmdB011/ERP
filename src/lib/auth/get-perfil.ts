import type { SupabaseClient } from "@supabase/supabase-js";
import type { RolValido, AreaValida } from "./roles";

export interface PerfilActual {
  userId: string;
  rol: RolValido;
  area: AreaValida | null;
  // Solo maquiladores: su nombre de contratista, fijo en sus recibos.
  contratista: string | null;
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
    .select("rol, area, contratista")
    .eq("id", user.id)
    .single();

  if (!perfil) return null;

  return {
    userId: user.id,
    rol: perfil.rol as RolValido,
    area: perfil.area,
    contratista: perfil.contratista ?? null,
  };
}

// Único con permiso para eliminar/restaurar pedidos (PM) de Planeación:
// el desarrollador (acceso global) o el administrador de esa área.
export function puedeAdministrarPlaneacion(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    (perfil?.rol === "administrador" && perfil.area === "planeacion")
  );
}

// Espejo de is_planeacion() en la base: trabajador, administrador o
// desarrollador de Planeación — quien puede editar items (incluido el
// estado de revisión), no solo verlos.
export function puedeEditarPlaneacion(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    ((perfil?.rol === "administrador" || perfil?.rol === "trabajador") &&
      perfil.area === "planeacion")
  );
}

// Espejo de is_estimaciones() en la base: desarrollador, administrador o
// trabajador de Estimaciones. Son quienes ven el precio sugerido del motor,
// revisan los recibos (aceptan o modifican el precio que propuso el
// maquilador) y los marcan como pagados.
export function puedeVerPrecioSugerido(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    ((perfil?.rol === "administrador" || perfil?.rol === "trabajador") &&
      perfil.area === "estimaciones")
  );
}

// Usuario externo: solo captura y consulta SUS recibos, sin ver el precio
// sugerido. Espejo de is_maquilador() en la base.
export function esMaquilador(perfil: PerfilActual | null): boolean {
  return perfil?.rol === "maquilador";
}
