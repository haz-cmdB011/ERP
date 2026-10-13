// Quién puede abrir qué pantalla y a dónde va cada quien al "inicio". El personal interno
// (desarrollador, administrador, trabajador, usuario) entra a todas las áreas: lo que puede hacer
// dentro lo deciden la base de datos (RLS) y el rol. El maquilador es externo y solo tiene
// Estimaciones. Si abre un enlace de otra área no se le mueve en silencio a la suya: se le dice
// que no tiene acceso y se le ofrece ir a su inicio (ver components/sin-acceso.tsx).

export type AreaApp = "planeacion" | "produccion" | "calidad" | "estimaciones" | "admin";

export function puedeEntrarAArea(rol: string | null | undefined, area: AreaApp): boolean {
  if (area === "admin") return rol === "desarrollador";
  if (rol === "maquilador") return area === "estimaciones";
  return true;
}

// Pantalla de inicio de cada persona: la del maquilador es Estimaciones; las demás, Planeación.
export function inicioDeRol(rol: string | null | undefined): string {
  return rol === "maquilador" ? "/estimaciones/recibos" : "/planeacion";
}
