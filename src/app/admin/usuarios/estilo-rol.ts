import type { RolValido } from "@/lib/auth/roles";

// Cada rol tiene su color (inicial y pastilla). El verde de la marca es del administrador,
// para que lo demás no le reste contraste.
export const ESTILO_ROL: Record<RolValido, { pastilla: string }> = {
  desarrollador: { pastilla: "bg-violet-100 text-violet-800" },
  administrador: { pastilla: "bg-brand-100 text-brand-900" },
  trabajador: { pastilla: "bg-sky-100 text-sky-800" },
  usuario: { pastilla: "bg-slate-100 text-slate-700" },
  maquilador: { pastilla: "bg-amber-100 text-amber-800" },
};
