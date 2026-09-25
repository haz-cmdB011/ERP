export const ROLES_VALIDOS = [
  "desarrollador",
  "administrador",
  "trabajador",
  "usuario",
  "maquilador",
] as const;
export type RolValido = (typeof ROLES_VALIDOS)[number];

export const AREAS_VALIDAS = [
  "planeacion",
  "produccion",
  "calidad",
  "estimaciones",
  "finanzas",
] as const;
export type AreaValida = (typeof AREAS_VALIDAS)[number];

export const ROL_LABELS: Record<RolValido, string> = {
  desarrollador: "Desarrollador",
  administrador: "Administrador",
  trabajador: "Trabajador",
  usuario: "Usuario",
  maquilador: "Maquilador",
};

export const AREA_LABELS: Record<AreaValida, string> = {
  planeacion: "Planeación",
  produccion: "Producción",
  calidad: "Calidad",
  estimaciones: "Estimaciones",
  finanzas: "Finanzas",
};

// 'administrador' y 'trabajador' quedan ligados a un área específica
// (elegida aparte en el formulario). 'desarrollador' (acceso global) y
// 'usuario' (rol por defecto, sin asignar todavía) no requieren área.
// 'maquilador' es un usuario externo que siempre pertenece a Estimaciones
// (no se elige área) y lleva su nombre de contratista.
export function requiereArea(rol: string): boolean {
  return rol === "administrador" || rol === "trabajador";
}

export function requiereContratista(rol: string): boolean {
  return rol === "maquilador";
}

export function derivarArea(rol: string, areaEnviada: string | null): AreaValida | null {
  if (rol === "maquilador") return "estimaciones";
  if (!requiereArea(rol)) return null;
  return AREAS_VALIDAS.includes(areaEnviada as AreaValida) ? (areaEnviada as AreaValida) : null;
}
