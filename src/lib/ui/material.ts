// Cada material tiene su color: franja a la izquierda del mueble y pastilla con su nombre.
// Lo usan las tablas de muebles de Planeación y de Producción.
const ESTILO_MATERIAL: Record<string, { pastilla: string; franja: string }> = {
  MADERA: { pastilla: "bg-amber-100 text-amber-800", franja: "border-l-amber-400" },
  METAL: { pastilla: "bg-slate-200 text-slate-700", franja: "border-l-slate-400" },
  TAPIZ: { pastilla: "bg-rose-100 text-rose-800", franja: "border-l-rose-400" },
  HIBRIDO: { pastilla: "bg-violet-100 text-violet-800", franja: "border-l-violet-400" },
};

export function estiloMaterial(material: string | null) {
  return ESTILO_MATERIAL[material?.toUpperCase() ?? ""];
}
