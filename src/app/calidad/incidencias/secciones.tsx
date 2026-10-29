"use client";

import { useState, type ReactNode } from "react";
import IconoMenu, { type NombreIcono } from "@/components/iconos-menu";

// Reparte las estadísticas en apartados cortos (Resumen, Auditores, Áreas...) para que no salgan
// todas juntas: solo se ve el apartado elegido. Cada apartado se pinta en el servidor y aquí solo
// se alterna cuál se muestra.
export default function Secciones({
  secciones,
}: {
  secciones: Array<{ id: string; titulo: string; icono?: NombreIcono; contenido: ReactNode }>;
}) {
  const [activa, setActiva] = useState(secciones[0]?.id);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap gap-1 border-b border-slate-200"
        role="group"
        aria-label="Apartados de estadísticas"
      >
        {secciones.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={activa === s.id}
            onClick={() => setActiva(s.id)}
            className={`-mb-px inline-flex min-h-11 items-center gap-2 rounded-t-lg border-b-2 px-4 text-base font-medium transition-colors ${
              activa === s.id
                ? "border-brand-600 font-semibold text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {s.icono && <IconoMenu nombre={s.icono} className={`h-4 w-4 shrink-0 ${activa === s.id ? "text-brand-700" : ""}`} />}
            {s.titulo}
          </button>
        ))}
      </div>
      {secciones.map((s) => (
        <div key={s.id} hidden={activa !== s.id} className="flex flex-col gap-6">
          {s.contenido}
        </div>
      ))}
    </div>
  );
}
