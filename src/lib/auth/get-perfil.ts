import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarAreasMaquila, type RolValido, type AreaValida, type AreaMaquila } from "./roles";

export interface PerfilActual {
  userId: string;
  rol: RolValido;
  area: AreaValida | null;
  // Solo maquiladores: su nombre de contratista, fijo en sus recibos.
  contratista: string | null;
  // Solo maquiladores: las áreas de maquila de las que puede generar recibos.
  areasMaquila: AreaMaquila[];
  // Ruta de la foto de perfil en Storage (ver src/lib/cuenta/avatar.ts), si tiene.
  avatarPath?: string | null;
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
    .select("rol, area, contratista, areas_maquila")
    .eq("id", user.id)
    .single();

  if (!perfil) return null;

  return {
    userId: user.id,
    rol: perfil.rol as RolValido,
    area: perfil.area,
    contratista: perfil.contratista ?? null,
    areasMaquila: normalizarAreasMaquila(perfil.areas_maquila),
    avatarPath: user.app_metadata?.avatar_path ?? null,
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
export function puedeVerPrecioSugerido(perfil: Pick<PerfilActual, "rol" | "area"> | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    ((perfil?.rol === "administrador" || perfil?.rol === "trabajador") &&
      perfil.area === "estimaciones")
  );
}

// Espejo de puede_decidir_discrepancias() en la base: quien acepta o rechaza el
// motivo de un descuadre de cantidades con el PM (desarrollador o
// administrador de Estimaciones).
export function puedeDecidirDiscrepancias(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    (perfil?.rol === "administrador" && perfil.area === "estimaciones")
  );
}

// Usuario externo: solo captura y consulta SUS recibos, sin ver el precio
// sugerido. Espejo de is_maquilador() en la base.
export function esMaquilador(perfil: PerfilActual | null): boolean {
  return perfil?.rol === "maquilador";
}

// ¿Puede generar recibos de este tipo? Todos los que capturan recibos sí,
// salvo el maquilador fuera de sus áreas. Espejo de puede_capturar_tipo().
export function puedeCapturarTipo(perfil: PerfilActual | null, tipo: AreaMaquila): boolean {
  if (!esMaquilador(perfil)) return true;
  return perfil?.areasMaquila.includes(tipo) ?? false;
}

// Espejo de is_produccion() en la base: desarrollador, administrador o
// trabajador de Producción. Asigna modelos a equipos, registra entregas y
// administra el catálogo de equipos.
export function puedeEditarProduccion(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    ((perfil?.rol === "administrador" || perfil?.rol === "trabajador") &&
      perfil.area === "produccion")
  );
}

// Espejo de is_calidad() en la base: desarrollador, administrador o trabajador
// de Calidad. Evalúa lotes y componentes (genera folios).
export function puedeEvaluarCalidad(perfil: { rol: string; area: string | null } | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    ((perfil?.rol === "administrador" || perfil?.rol === "trabajador") && perfil.area === "calidad")
  );
}

// Espejo de is_admin_area('produccion'): quien puede anular una entrega
// capturada por error.
export function puedeAdministrarProduccion(perfil: PerfilActual | null): boolean {
  return (
    perfil?.rol === "desarrollador" ||
    (perfil?.rol === "administrador" && perfil.area === "produccion")
  );
}
