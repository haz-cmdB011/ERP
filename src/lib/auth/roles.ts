export const ROLES_VALIDOS = [
  "desarrollador",
  "admin_planeacion",
  "admin_produccion",
  "admin_calidad",
  "admin_estimaciones",
  "admin_finanzas",
  "planeacion",
  "area",
] as const;

export const AREAS_VALIDAS = ["produccion", "calidad", "estimaciones", "finanzas"] as const;

const PREFIJO_ADMIN_AREA = "admin_";

// El rol 'admin_<area>' ya encoda el área en su nombre (ej. admin_produccion
// -> produccion): se deriva de ahí en vez de pedirla por separado en el
// formulario. Solo el rol 'area' necesita que el área venga elegida aparte.
export function derivarArea(
  rol: string,
  areaEnviada: string | null
): (typeof AREAS_VALIDAS)[number] | null {
  if (rol === "area") {
    return AREAS_VALIDAS.includes(areaEnviada as (typeof AREAS_VALIDAS)[number])
      ? (areaEnviada as (typeof AREAS_VALIDAS)[number])
      : null;
  }
  if (rol.startsWith(PREFIJO_ADMIN_AREA) && rol !== "admin_planeacion") {
    const area = rol.slice(PREFIJO_ADMIN_AREA.length);
    return AREAS_VALIDAS.includes(area as (typeof AREAS_VALIDAS)[number])
      ? (area as (typeof AREAS_VALIDAS)[number])
      : null;
  }
  return null;
}
