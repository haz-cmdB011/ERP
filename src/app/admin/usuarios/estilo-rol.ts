import type { RolValido } from "@/lib/auth/roles";

// Cada rol tiene su color (franja de la fila y pastilla). El verde de la marca es del administrador,
// para que lo demás no le reste contraste.
export const ESTILO_ROL: Record<RolValido, { franja: string; pastilla: string }> = {
  desarrollador: { franja: "border-l-violet-500", pastilla: "bg-violet-100 text-violet-800" },
  administrador: { franja: "border-l-brand-500", pastilla: "bg-brand-100 text-brand-900" },
  trabajador: { franja: "border-l-sky-500", pastilla: "bg-sky-100 text-sky-800" },
  usuario: { franja: "border-l-slate-300", pastilla: "bg-slate-100 text-slate-700" },
  maquilador: { franja: "border-l-amber-500", pastilla: "bg-amber-100 text-amber-800" },
};
