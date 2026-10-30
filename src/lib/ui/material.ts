// Cada material tiene el color de su pastilla (solo contorno y texto, sin relleno).
// Lo usan las tablas de muebles de Planeación y de Producción.
const ESTILO_MATERIAL: Record<string, { pastilla: string }> = {
  MADERA: { pastilla: "text-amber-800 ring-1 ring-inset ring-amber-300" },
  METAL: { pastilla: "text-slate-700 ring-1 ring-inset ring-slate-300" },
  TAPIZ: { pastilla: "text-rose-800 ring-1 ring-inset ring-rose-300" },
  HIBRIDO: { pastilla: "text-violet-800 ring-1 ring-inset ring-violet-300" },
};

export function estiloMaterial(material: string | null) {
  return ESTILO_MATERIAL[material?.toUpperCase() ?? ""];
}
