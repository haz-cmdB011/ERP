// Cada material tiene el color de su pastilla.
// Lo usan las tablas de muebles de Planeación y de Producción.
const ESTILO_MATERIAL: Record<string, { pastilla: string }> = {
  MADERA: { pastilla: "bg-amber-100 text-amber-800" },
  METAL: { pastilla: "bg-slate-200 text-slate-700" },
  TAPIZ: { pastilla: "bg-rose-100 text-rose-800" },
  HIBRIDO: { pastilla: "bg-violet-100 text-violet-800" },
};

export function estiloMaterial(material: string | null) {
  return ESTILO_MATERIAL[material?.toUpperCase() ?? ""];
}
