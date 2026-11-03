// Cada material tiene el color de su pastilla. En el estilo Mobiliarium (mob:)
// la pastilla es solo contorno y texto, sin relleno.
// Lo usan las tablas de muebles de Planeación y de Producción.
const ESTILO_MATERIAL: Record<string, { pastilla: string }> = {
  MADERA: { pastilla: "bg-amber-100 text-amber-800 mob:bg-transparent mob:ring-1 mob:ring-inset mob:ring-amber-300" },
  METAL: { pastilla: "bg-slate-200 text-slate-700 mob:bg-transparent mob:ring-1 mob:ring-inset mob:ring-slate-300" },
  TAPIZ: { pastilla: "bg-rose-100 text-rose-800 mob:bg-transparent mob:ring-1 mob:ring-inset mob:ring-rose-300" },
  HIBRIDO: { pastilla: "bg-violet-100 text-violet-800 mob:bg-transparent mob:ring-1 mob:ring-inset mob:ring-violet-300" },
};

export function estiloMaterial(material: string | null) {
  return ESTILO_MATERIAL[material?.toUpperCase() ?? ""];
}
