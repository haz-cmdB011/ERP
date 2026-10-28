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
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl bg-slate-100 p-1"
        role="group"
        aria-label="Apartados de estadísticas"
      >
        {secciones.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={activa === s.id}
            onClick={() => setActiva(s.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all max-md:min-h-11 ${
              activa === s.id
                ? "bg-brand-500 text-on-brand shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            }`}
          >
            {s.icono && <IconoMenu nombre={s.icono} className="h-4 w-4 shrink-0" />}
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
