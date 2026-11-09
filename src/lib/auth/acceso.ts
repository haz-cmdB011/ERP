// Quién puede abrir qué pantalla y a dónde va cada quien al "inicio". Cada persona ve solo las
// áreas que tiene asignadas: el administrador y el trabajador, la suya; el maquilador (externo),
// Estimaciones; el desarrollador, todas, más Administración. El "usuario" recién registrado no
// tiene ninguna hasta que se le asigne (solo su perfil). Lo que cada quien puede HACER lo decide
// además la base de datos (RLS); esto decide qué pantallas puede ABRIR. Si abre un enlace de otra
// área no se le mueve en silencio a la suya: se le dice que no tiene acceso y se le ofrece ir a
// su inicio (ver components/sin-acceso.tsx).

export type AreaApp = "planeacion" | "produccion" | "calidad" | "estimaciones" | "admin";

// Áreas con pantallas, en el orden del menú (Administración aparte).
export const AREAS_CON_PANTALLAS = ["planeacion", "produccion", "calidad", "estimaciones"] as const;
export type AreaConPantallas = (typeof AREAS_CON_PANTALLAS)[number];

export const NOMBRE_AREA_APP: Record<AreaApp, string> = {
  planeacion: "Planeación",
  produccion: "Producción",
  calidad: "Calidad",
  estimaciones: "Estimaciones",
  admin: "Administración",
};

// Pantalla de inicio de cada área.
export const INICIO_DE_AREA: Record<AreaApp, string> = {
  planeacion: "/planeacion",
  produccion: "/produccion",
  calidad: "/calidad",
  estimaciones: "/estimaciones",
  admin: "/admin/usuarios",
};

// Perfil completo de una cuenta sin área: solo puede ver y editar su perfil.
export const RUTA_CUENTA = "/cuenta";

export interface PerfilAcceso {
  rol: string | null | undefined;
  area?: string | null;
}

/** Áreas que la persona puede abrir, en el orden del menú. */
export function areasDePerfil(perfil: PerfilAcceso | null | undefined): AreaApp[] {
  const rol = perfil?.rol;
  if (rol === "desarrollador") return [...AREAS_CON_PANTALLAS, "admin"];
  if (rol === "maquilador") return ["estimaciones"];
  if (rol === "administrador" || rol === "trabajador") {
    const area = perfil?.area;
    // Un área sin pantallas (Finanzas) no abre ninguna otra.
    return AREAS_CON_PANTALLAS.includes(area as AreaConPantallas) ? [area as AreaConPantallas] : [];
  }
  return [];
}

export function puedeEntrarAArea(perfil: PerfilAcceso | null | undefined, area: AreaApp): boolean {
  return areasDePerfil(perfil).includes(area);
}

/** Pantalla de inicio de la persona: la de su área (el maquilador, sus recibos). */
export function inicioDePerfil(perfil: PerfilAcceso | null | undefined): string {
  if (perfil?.rol === "maquilador") return "/estimaciones/recibos";
  const [primera] = areasDePerfil(perfil);
  return primera ? INICIO_DE_AREA[primera] : RUTA_CUENTA;
}

// Área a la que pertenece una ruta interna ("/calidad/folios" → calidad), o null si no es de
// ningún área (perfil, QR, login...).
export function areaDeRuta(ruta: string): AreaApp | null {
  const tramo = ruta.split(/[/?#]/)[1] ?? "";
  if (tramo === "admin") return "admin";
  return AREAS_CON_PANTALLAS.includes(tramo as AreaConPantallas) ? (tramo as AreaConPantallas) : null;
}

/** La persona puede abrir esa ruta (las que no son de un área, sí). */
export function puedeAbrirRuta(perfil: PerfilAcceso | null | undefined, ruta: string): boolean {
  const area = areaDeRuta(ruta);
  return area === null || puedeEntrarAArea(perfil, area);
}

/** Texto para la pantalla de "sin acceso" al abrir un área que no es de la persona. */
export function avisoSinAcceso(
  perfil: PerfilAcceso | null | undefined,
  area: AreaApp
): { titulo: string; mensaje: string; hrefInicio: string; etiquetaInicio: string } {
  const propias = areasDePerfil(perfil);
  const hrefInicio = inicioDePerfil(perfil);
  if (perfil?.rol === "maquilador") {
    return {
      titulo: "Esta pantalla es del personal interno",
      mensaje: "Tu cuenta es de maquilador y solo tiene acceso a Estimaciones.",
      hrefInicio,
      etiquetaInicio: "Ir a mis recibos",
    };
  }
  if (propias.length === 0) {
    return {
      titulo: "Tu cuenta aún no tiene un área asignada",
      mensaje: "Un administrador debe asignarte un rol y un área para que puedas ver la información.",
      hrefInicio,
      etiquetaInicio: "Ir a mi perfil",
    };
  }
  const nombres = propias.map((a) => NOMBRE_AREA_APP[a]).join(", ");
  return {
    titulo: `Esta pantalla es de ${NOMBRE_AREA_APP[area]}`,
    mensaje: `Tu cuenta solo tiene acceso a ${nombres}.`,
    hrefInicio,
    etiquetaInicio: `Ir a ${NOMBRE_AREA_APP[propias[0]]}`,
  };
}
