import type { RolValido } from "@/lib/auth/roles";

// Cada rol tiene su color (inicial y pastilla; fila: el tono suave al señalar su fila). El verde de la marca es del administrador,
// para que lo demás no le reste contraste.
export const ESTILO_ROL: Record<RolValido, { pastilla: string; fila: string }> = {
  desarrollador: { pastilla: "bg-violet-100 text-violet-800", fila: "hover:bg-violet-50" },
  administrador: { pastilla: "bg-brand-100 text-brand-900", fila: "hover:bg-brand-50" },
  trabajador: { pastilla: "bg-sky-100 text-sky-800", fila: "hover:bg-sky-50" },
  usuario: { pastilla: "bg-slate-100 text-slate-700", fila: "hover:bg-slate-50" },
  maquilador: { pastilla: "bg-amber-100 text-amber-800", fila: "hover:bg-amber-50" },
};
